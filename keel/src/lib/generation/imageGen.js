import { getKey } from '../byok/keyStore.js';

const IMAGE_MARKER = /\{\{IMAGE:([^}]+)\}\}/g;

/** True if any file's content contains an unresolved {{IMAGE:...}} marker. */
export function hasImageMarkers(files) {
  return files.some((f) => IMAGE_MARKER.test(f.content));
}

/** Every distinct prompt inside {{IMAGE:...}} markers across a file set, in first-seen order. */
export function extractImagePrompts(files) {
  const seen = new Set();
  const prompts = [];
  for (const f of files) {
    for (const match of f.content.matchAll(IMAGE_MARKER)) {
      const prompt = match[1].trim();
      if (prompt && !seen.has(prompt)) {
        seen.add(prompt);
        prompts.push(prompt);
      }
    }
  }
  return prompts;
}

/**
 * Resolves every {{IMAGE:prompt}} marker in a file set into a real image,
 * using whichever image-capable BYOK key (Gemini or OpenRouter) the user
 * has configured — reusing the same key already entered in Settings for
 * text generation, no separate image key required. Markers that share the
 * same prompt text are only generated once and substituted everywhere.
 *
 * If no image-capable key is configured, or a generation call fails, the
 * marker is replaced with a small inline neutral placeholder SVG — visibly
 * a placeholder rather than a silently broken <img> tag, and generated
 * locally so it never depends on a third-party placeholder service.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {(onProgress: {done: number, total: number}) => void} [onProgress]
 */
export async function resolveImageMarkers(files, onProgress) {
  const prompts = extractImagePrompts(files);
  if (prompts.length === 0) return files;

  const providerId = getKey('gemini') ? 'gemini' : getKey('openrouter') ? 'openrouter' : null;
  const key = providerId ? getKey(providerId) : null;

  const resolved = new Map();
  for (let i = 0; i < prompts.length; i += 1) {
    const prompt = prompts[i];
    resolved.set(prompt, key ? await generateOne(providerId, key, prompt) : placeholderDataUri(prompt));
    onProgress?.({ done: i + 1, total: prompts.length });
  }

  return files.map((f) => ({
    ...f,
    content: f.content.replace(IMAGE_MARKER, (match, rawPrompt) => resolved.get(rawPrompt.trim()) || match),
  }));
}

async function generateOne(providerId, key, prompt) {
  try {
    const res = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-keel-key': key },
      body: JSON.stringify({ providerId, prompt }),
    });
    const json = await res.json();
    if (res.ok && json.image) return json.image;
  } catch {
    // fall through to placeholder
  }
  return placeholderDataUri(prompt);
}

/** A small, locally-generated neutral SVG placeholder — no network call, no third-party service. */
function placeholderDataUri(prompt) {
  const label = prompt.length > 40 ? `${prompt.slice(0, 37)}...` : prompt;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="#e5e5e5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#737373">${escapeXml(label)}</text></svg>`;
  return `data:image/svg+xml;base64,${base64(svg)}`;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function base64(s) {
  if (typeof window !== 'undefined' && window.btoa) return window.btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, 'utf-8').toString('base64');
}
