import { groqProvider } from './groq.js';
import { geminiProvider } from './gemini.js';
import { openrouterProvider } from './openrouter.js';

/** @type {Record<string, import('./groq.js').groqProvider>} */
export const PROVIDERS = {
  groq: groqProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export function getProvider(id) {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider "${id}". Known providers: ${Object.keys(PROVIDERS).join(', ')}`);
  return p;
}
