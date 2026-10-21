import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

// Gère le stockage JSON et PostgreSQL, avec des écritures locales sérialisées.
async function createJsonStorage(filePath) {
  const absolutePath = path.resolve(filePath);
  let writeQueue = Promise.resolve();
  let values = new Map();

  async function load() {
    try {
      const contents = await fs.readFile(absolutePath, 'utf8');
      const parsed = JSON.parse(contents);
      values = new Map(Object.entries(parsed));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await persist();
    }
  }

  async function persist() {
    const temporaryPath = `${absolutePath}.writing`;
    const contents = JSON.stringify(Object.fromEntries(values), null, 2);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(temporaryPath, contents, 'utf8');
    try {
      await fs.rename(temporaryPath, absolutePath);
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) {
        throw error;
      }
      await fs.writeFile(absolutePath, contents, 'utf8');
      await fs.rm(temporaryPath, { force: true });
    }
  }

  function enqueuePersist() {
    writeQueue = writeQueue.then(persist);
    return writeQueue;
  }

  await load();

  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
      await enqueuePersist();
    },
    async increment(key) {
      const nextValue = Number(values.get(key) || 0) + 1;
      values.set(key, nextValue);
      await enqueuePersist();
      return nextValue;
    },
    async close() {
      await writeQueue;
    },
  };
}

// Utilise PostgreSQL si une URL est fournie, sinon le stockage JSON local.
export async function createStorage({ databaseUrl, storageFile }) {
  if (!databaseUrl) return createJsonStorage(storageFile);

  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  return {
    async get(key) {
      const result = await pool.query('SELECT value FROM bot_store WHERE key = $1', [key]);
      return result.rows[0]?.value ?? null;
    },
    async set(key, value) {
      await pool.query(
        `INSERT INTO bot_store (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(value)],
      );
    },
    async increment(key) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO bot_store (key, value, updated_at)
           VALUES ($1, '1'::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE
             SET value = (CASE
               WHEN jsonb_typeof(bot_store.value) = 'number' THEN bot_store.value::text::bigint
               ELSE 0
             END + 1)::text::jsonb,
                 updated_at = NOW()
           RETURNING value`,
          [key],
        );
        await client.query('COMMIT');
        return Number(result.rows[0].value);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
