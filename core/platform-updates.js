const repository = 'KyotakaMD45/rorisu';
const branch = 'master';
const githubApi = `https://api.github.com/repos/${repository}`;
const providers = new Set(['git', 'render', 'koyeb', 'heroku']);

export function getUpdateProvider(environment = process.env) {
  const detectedProvider = environment.RENDER === 'true'
    ? 'render'
    : environment.KOYEB_SERVICE_ID
      ? 'koyeb'
      : environment.DYNO
        ? 'heroku'
        : 'git';
  const provider = (environment.UPDATE_PROVIDER || detectedProvider).trim().toLowerCase();
  if (!providers.has(provider)) {
    const error = new Error('UPDATE_PROVIDER doit être réglé sur git, render, koyeb ou heroku.');
    error.code = 'ERR_UPDATE_CONFIG';
    error.userMessage = error.message;
    throw error;
  }
  return provider;
}

function configurationError(provider, variable) {
  const error = new Error(`${variable} est obligatoire pour utiliser les mises à jour ${provider}.`);
  error.code = 'ERR_UPDATE_CONFIG';
  error.userMessage = error.message;
  return error;
}

function requiredValue(environment, provider, name) {
  const value = environment[name]?.trim();
  if (!value) throw configurationError(provider, name);
  return value;
}

async function requestJson(fetchImpl, url, options, provider) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    const error = new Error(`Connexion impossible à l’API de mise à jour ${provider}.`, { cause });
    error.code = 'ERR_UPDATE_PROVIDER';
    error.userMessage = error.message;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`L’API ${provider} a refusé l’opération (HTTP ${response.status}).`);
    error.code = 'ERR_UPDATE_PROVIDER';
    error.userMessage = error.message;
    throw error;
  }

  if (response.status === 202 || response.status === 204) return {};
  try {
    return await response.json();
  } catch (cause) {
    const error = new Error(`Réponse JSON invalide de l’API ${provider}.`, { cause });
    error.code = 'ERR_UPDATE_PROVIDER';
    error.userMessage = error.message;
    throw error;
  }
}

function providerHeaders(token, accept = 'application/json') {
  return {
    authorization: `Bearer ${token}`,
    accept,
    'content-type': 'application/json',
  };
}

async function getKoyebService(environment, fetchImpl) {
  const token = requiredValue(environment, 'koyeb', 'KOYEB_API_TOKEN');
  const serviceId = requiredValue(environment, 'koyeb', 'KOYEB_SERVICE_ID');
  const serviceResponse = await requestJson(
    fetchImpl,
    `https://app.koyeb.com/v1/services/${encodeURIComponent(serviceId)}`,
    { headers: providerHeaders(token) },
    'Koyeb',
  );
  const service = serviceResponse.service;
  if (!service) {
    const error = new Error('La réponse Koyeb ne contient pas le service demandé.');
    error.code = 'ERR_UPDATE_PROVIDER';
    error.userMessage = error.message;
    throw error;
  }

  return { service, serviceId, token };
}

async function getDeployedCommit(provider, environment, fetchImpl) {
  const configuredCommit = environment.UPDATE_CURRENT_COMMIT?.trim();
  if (configuredCommit) return configuredCommit;

  if (provider === 'render') {
    const commit = environment.RENDER_GIT_COMMIT?.trim();
    if (commit) return commit;
  } else if (provider === 'heroku') {
    const commit = environment.HEROKU_BUILD_COMMIT?.trim()
      || environment.HEROKU_SLUG_COMMIT?.trim();
    if (commit) return commit;
  } else if (provider === 'koyeb') {
    const { service, token } = await getKoyebService(environment, fetchImpl);
    const deploymentId = service.active_deployment_id || service.latest_deployment_id;
    if (deploymentId) {
      const deployment = await requestJson(
        fetchImpl,
        `https://app.koyeb.com/v1/deployments/${encodeURIComponent(deploymentId)}`,
        { headers: providerHeaders(token) },
        'Koyeb',
      );
      const gitMetadata = deployment.deployment?.metadata?.git;
      const commit = gitMetadata?.git_env?.sha || gitMetadata?.sha
        || deployment.deployment?.metadata?.trigger?.git?.sha;
      if (commit) return commit;
    }
  }

  const error = new Error(
    `Impossible de déterminer le commit déployé sur ${provider}. Configure UPDATE_CURRENT_COMMIT si la plateforme ne fournit pas sa révision.`,
  );
  error.code = 'ERR_UPDATE_REVISION_UNKNOWN';
  error.userMessage = error.message;
  throw error;
}

async function fetchGitHub(fetchImpl, endpoint) {
  return requestJson(
    fetchImpl,
    `${githubApi}/${endpoint}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    },
    'GitHub',
  );
}

export async function checkPlatformUpdates({
  provider,
  environment = process.env,
  fetchImpl = fetch,
}) {
  const currentCommit = await getDeployedCommit(provider, environment, fetchImpl);
  const comparison = await fetchGitHub(
    fetchImpl,
    `compare/${encodeURIComponent(currentCommit)}...${branch}`,
  );

  if (comparison.status === 'identical' || comparison.status === 'behind') {
    return { provider, upstream: `github/${branch}`, commits: [], latestCommit: currentCommit };
  }
  if (comparison.status !== 'ahead') {
    const error = new Error('La version déployée et la branche GitHub ont divergé; déploiement automatique refusé.');
    error.code = 'ERR_UPDATE_DIVERGED';
    error.userMessage = error.message;
    throw error;
  }

  const commits = (comparison.commits || []).map((commit) => (
    `${commit.sha.slice(0, 7)}\t${commit.commit.message.split(/\r?\n/, 1)[0]}`
  ));
  const latestCommit = comparison.head_commit?.sha || comparison.commits?.at(-1)?.sha;
  if (!commits.length || !latestCommit) {
    const error = new Error('GitHub a signalé une mise à jour sans fournir les commits attendus.');
    error.code = 'ERR_UPDATE_PROVIDER';
    error.userMessage = error.message;
    throw error;
  }

  return { provider, upstream: `github/${branch}`, commits, latestCommit };
}

export async function requestPlatformDeployment({
  provider,
  targetCommit,
  environment = process.env,
  fetchImpl = fetch,
}) {
  if (!targetCommit) {
    const error = new Error('Le commit cible du déploiement est inconnu.');
    error.code = 'ERR_UPDATE_REVISION_UNKNOWN';
    error.userMessage = error.message;
    throw error;
  }

  if (provider === 'render') {
    const token = requiredValue(environment, provider, 'RENDER_API_KEY');
    const serviceId = requiredValue(environment, provider, 'RENDER_SERVICE_ID');
    const deploy = await requestJson(
      fetchImpl,
      `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys`,
      {
        method: 'POST',
        headers: providerHeaders(token),
        body: JSON.stringify({ commitId: targetCommit }),
      },
      'Render',
    );
    return { provider, deploymentId: deploy.id };
  }

  if (provider === 'koyeb') {
    const { serviceId, token } = await getKoyebService(environment, fetchImpl);
    const deploy = await requestJson(
      fetchImpl,
      `https://app.koyeb.com/v1/services/${encodeURIComponent(serviceId)}/redeploy`,
      {
        method: 'POST',
        headers: providerHeaders(token),
        body: JSON.stringify({ sha: targetCommit }),
      },
      'Koyeb',
    );
    return { provider, deploymentId: deploy.deployment?.id };
  }

  if (provider === 'heroku') {
    const token = requiredValue(environment, provider, 'HEROKU_API_KEY');
    const appName = requiredValue(environment, provider, 'HEROKU_APP_NAME');
    const build = await requestJson(
      fetchImpl,
      `https://api.heroku.com/apps/${encodeURIComponent(appName)}/builds`,
      {
        method: 'POST',
        headers: {
          ...providerHeaders(token, 'application/vnd.heroku+json; version=3'),
          'user-agent': 'RORISU updater',
        },
        body: JSON.stringify({
          source_blob: {
            url: `https://github.com/${repository}/archive/${targetCommit}.tar.gz`,
            version: targetCommit,
          },
        }),
      },
      'Heroku',
    );
    return { provider, deploymentId: build.id };
  }

  const error = new Error(`Le fournisseur ${provider} ne prend pas en charge le déploiement distant.`);
  error.code = 'ERR_UPDATE_PROVIDER';
  error.userMessage = error.message;
  throw error;
}
