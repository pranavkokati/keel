export const config = { runtime: 'nodejs' };

/**
 * Stateless BYOK relay for image generation — same pattern as api/relay.js
 * (key arrives per-request in a header, never stored), used to resolve
 * {{IMAGE:prompt}} markers (see src/lib/generation/imageGen.js) into real
 * images without adding any operator-side secret: it spends whichever of
 * the user's own Gemini or OpenRouter keys they've already configured for
 * text generation, since both of those providers also do image generation
 * on the same key.
 *
 * Gemini and OpenRouter each need a different request/response shape for
 * image output, so this endpoint branches on providerId rather than reusing
 * providers/*.js's toProviderRequest (those are shaped around the
 * emit_project tool-call contract, not image generation).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const apiKey = req.headers['x-keel-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'Missing x-keel-key header.' });
    return;
  }

  const { providerId, prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Body must include { providerId, prompt }' });
    return;
  }

  try {
    const image = providerId === 'gemini' ? await generateWithGemini(apiKey, prompt) : providerId === 'openrouter' ? await generateWithOpenRouter(apiKey, prompt) : null;

    if (!image) {
      res.status(400).json({ error: `Image generation isn't supported for provider "${providerId}" (only gemini and openrouter can generate images).` });
      return;
    }

    res.status(200).json({ image });
  } catch (e) {
    res.status(502).json({ error: `Image generation failed: ${e.message}` });
  }
}

const GEMINI_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'];

async function generateWithGemini(apiKey, prompt) {
  for (const model of GEMINI_IMAGE_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });
    if (!res.ok) continue;
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const withImage = parts.find((p) => p.inlineData?.data);
    if (withImage) {
      return `data:${withImage.inlineData.mimeType || 'image/png'};base64,${withImage.inlineData.data}`;
    }
  }
  return null;
}

async function generateWithOpenRouter(apiKey, prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/keel-oss/keel', 'X-Title': 'Keel' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: prompt }],
      modalities: ['text', 'image'],
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const image = json?.choices?.[0]?.message?.images?.[0];
  if (image?.image_url?.url?.startsWith('data:')) return image.image_url.url;
  return null;
}
