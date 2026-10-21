const apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiError';
  }
}

function getHttpErrorMessage(status) {
  if (status === 400) return 'Gemini a refusé la requête. Vérifiez le modèle et le média envoyé.';
  if (status === 401 || status === 403) return 'Clé Gemini refusée. Vérifiez GEMINI_API_KEY.';
  if (status === 404) return 'Modèle Gemini introuvable. Vérifiez GEMINI_MODEL.';
  if (status === 429) return 'Quota Gemini atteint. Vérifiez les limites de votre clé API.';
  if (status >= 500) return 'Le service Gemini est temporairement indisponible.';
  return `Gemini a répondu avec l’erreur HTTP ${status}.`;
}

function getResponseParts(payload) {
  if (payload.error) {
    throw new GeminiError(payload.error.message || 'Le service Gemini a interrompu la réponse.');
  }
  return payload.candidates?.[0]?.content?.parts || [];
}

async function readEventStream(response, onText) {
  const reader = response.body?.getReader();
  if (!reader) throw new GeminiError('Gemini a renvoyé une réponse de streaming vide.');

  const decoder = new TextDecoder();
  const result = { text: '', images: [], audios: [] };
  let pending = '';
  let dataLines = [];

  async function handleEvent() {
    if (!dataLines.length) return;
    const data = dataLines.join('\n');
    dataLines = [];
    if (data === '[DONE]') return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      throw new GeminiError('La réponse de streaming Gemini est illisible.');
    }

    for (const part of getResponseParts(payload)) {
      if (typeof part.text === 'string') {
        result.text += part.text;
        await onText?.(part.text);
      }
      const media = part.inlineData;
      if (typeof media?.data !== 'string') continue;
      const buffer = Buffer.from(media.data, 'base64');
      if (!buffer.length) continue;
      if (media.mimeType?.startsWith('image/')) {
        result.images.push({ mimeType: media.mimeType, buffer });
      } else if (media.mimeType?.startsWith('audio/')) {
        result.audios.push({ mimeType: media.mimeType, buffer });
      }
    }
  }

  async function consumeLines(final = false) {
    const lines = pending.split(/\r?\n/);
    pending = final ? '' : lines.pop();
    if (final && pending) lines.push(pending);
    for (const line of lines) {
      if (!line) {
        await handleEvent();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (final) await handleEvent();
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      await consumeLines(done);
      if (done) break;
    }
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    throw new GeminiError('La connexion au flux Gemini a été interrompue.');
  } finally {
    reader.releaseLock();
  }

  return result;
}

export function createGeminiClient({
  apiKey,
  model,
  systemPrompt,
  temperature,
  maxOutputTokens,
  timeoutMs,
  fetchImpl = fetch,
}) {
  return {
    async generate({ prompt, history = [], media = [], responseModalities, onText }) {
      if (!apiKey) {
        throw new GeminiError(
          'Configurez GEMINI_API_KEY dans config.env pour utiliser Gemini. Obtenez une clé sur https://aistudio.google.com/apikey',
        );
      }
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new TypeError('La question Gemini ne peut pas être vide.');
      }

      const endpoint = new URL(`${apiBaseUrl}/${encodeURIComponent(model)}:streamGenerateContent`);
      endpoint.searchParams.set('key', apiKey);
      endpoint.searchParams.set('alt', 'sse');
      const parts = [{ text: prompt.trim() }, ...media.map(({ mimeType, buffer }) => ({
        inlineData: {
          mimeType,
          data: Buffer.from(buffer).toString('base64'),
        },
      }))];
      const request = {
        contents: [
          ...history,
          { role: 'user', parts },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens,
          ...(responseModalities ? { responseModalities } : {}),
        },
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
      };

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        });
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throw new GeminiError('La requête Gemini a dépassé le délai autorisé.');
        }
        throw new GeminiError('Impossible de joindre l’API Gemini. Vérifiez votre connexion.');
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new GeminiError(getHttpErrorMessage(response.status));
      }

      let generated;
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        generated = await readEventStream(response, onText);
      } else {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new GeminiError('La réponse de Gemini est illisible.');
        }
        const responseParts = getResponseParts(payload);
        const text = responseParts
          .filter((part) => typeof part.text === 'string')
          .map((part) => part.text)
          .join('');
        await onText?.(text);
        generated = {
          text,
          images: responseParts
            .filter((part) => part.inlineData?.mimeType?.startsWith('image/')
              && typeof part.inlineData.data === 'string')
            .map((part) => ({
              mimeType: part.inlineData.mimeType,
              buffer: Buffer.from(part.inlineData.data, 'base64'),
            }))
            .filter(({ buffer }) => buffer.length > 0),
          audios: responseParts
            .filter((part) => part.inlineData?.mimeType?.startsWith('audio/')
              && typeof part.inlineData.data === 'string')
            .map((part) => ({
              mimeType: part.inlineData.mimeType,
              buffer: Buffer.from(part.inlineData.data, 'base64'),
            }))
            .filter(({ buffer }) => buffer.length > 0),
        };
      }
      const text = generated.text.trim();
      const { images, audios } = generated;

      if (!text && !images.length && !audios.length) {
        throw new GeminiError('Gemini n’a pas fourni de réponse exploitable.');
      }
      return { text, images, audios };
    },
  };
}
