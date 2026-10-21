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
    async generate({ prompt, history = [], media = [], responseModalities }) {
      if (!apiKey) {
        throw new GeminiError('Configurez GEMINI_API_KEY dans config.env pour utiliser Gemini.');
      }
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new TypeError('La question Gemini ne peut pas être vide.');
      }

      const endpoint = new URL(`${apiBaseUrl}/${encodeURIComponent(model)}:generateContent`);
      endpoint.searchParams.set('key', apiKey);
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

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new GeminiError('La réponse de Gemini est illisible.');
      }
      const responseParts = payload.candidates?.[0]?.content?.parts || [];
      const text = responseParts
        .filter((part) => typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
        .trim();
      const images = responseParts
        .filter((part) => part.inlineData?.mimeType?.startsWith('image/')
          && typeof part.inlineData.data === 'string')
        .map((part) => ({
          mimeType: part.inlineData.mimeType,
          buffer: Buffer.from(part.inlineData.data, 'base64'),
        }))
        .filter(({ buffer }) => buffer.length > 0);
      const audios = responseParts
        .filter((part) => part.inlineData?.mimeType?.startsWith('audio/')
          && typeof part.inlineData.data === 'string')
        .map((part) => ({
          mimeType: part.inlineData.mimeType,
          buffer: Buffer.from(part.inlineData.data, 'base64'),
        }))
        .filter(({ buffer }) => buffer.length > 0);

      if (!text && !images.length && !audios.length) {
        throw new GeminiError('Gemini n’a pas fourni de réponse exploitable.');
      }
      return { text, images, audios };
    },
  };
}
