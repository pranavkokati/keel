import { getKey } from '../byok/keyStore.js';
import { getProvider } from '../providers/index.js';
import { GENERATE_SYSTEM_PROMPT, EDIT_SYSTEM_PROMPT } from './prompts.js';
import { parseLegacyDelimitedOutput } from './legacyParser.js';
import { likelyNeedsBackend } from './backendDetect.js';

/**
 * Calls /api/relay for a given provider, attaching that provider's BYOK key
 * (read from this browser's localStorage, see byok/keyStore.js) in the
 * `x-keel-key` header. This is the single choke point every generation path
 * (generate, edit, self-heal, ensemble) goes through.
 *
 * @param {{providerId: string, model?: string, messages: Array<{role:string, content:string}>}} args
 */
async function callRelay({ providerId, model, messages }) {
  const key = getKey(providerId);
  if (!key) {
    throw new KeelKeyMissingError(providerId);
  }

  const res = await fetch('/api/relay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-keel-key': key,
    },
    body: JSON.stringify({ providerId, model, messages }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Relay call to ${providerId} failed (${res.status})`);
  }

  // Structured path came back empty (provider without tool-calling support,
  // or the model declined the tool call) — fall back to delimiter parsing
  // of whatever text did come back.
  if ((!json.files || json.files.length === 0) && json.summary) {
    const fallback = parseLegacyDelimitedOutput(json.summary);
    if (fallback.files.length > 0) return { ...fallback, needsBackend: false, raw: json.raw };
  }

  return json;
}

export class KeelKeyMissingError extends Error {
  constructor(providerId) {
    const p = getProvider(providerId);
    super(`No API key configured for ${p.label}. Add one in Settings — Keel is BYOK, so your ${p.label} key stays in this browser only.`);
    this.providerId = providerId;
  }
}

/**
 * Generates a brand-new project from a prompt.
 * @param {{prompt: string, providerId: string, model?: string, contextFiles?: Array<{name:string, content:string}>}} args
 * @returns {Promise<{files: Array<{path:string, content:string}>, summary: string, needsBackend: boolean}>}
 */
export async function generateProject({ prompt, providerId, model, contextFiles = [] }) {
  const contextBlock = buildContextBlock(contextFiles);
  const messages = [
    { role: 'system', content: GENERATE_SYSTEM_PROMPT },
    { role: 'user', content: prompt + contextBlock },
  ];
  const result = await callRelay({ providerId, model, messages });
  return { ...result, needsBackend: result.needsBackend || likelyNeedsBackend(prompt) };
}

/**
 * Applies a chat-driven edit to an existing project.
 * @param {{instruction: string, providerId: string, model?: string, currentFiles: Array<{path:string, content:string}>}} args
 */
export async function editProject({ instruction, providerId, model, currentFiles }) {
  const projectSnapshot = currentFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  const messages = [
    { role: 'system', content: EDIT_SYSTEM_PROMPT },
    { role: 'user', content: `Current project:\n\n${projectSnapshot}\n\nInstruction: ${instruction}` },
  ];
  return callRelay({ providerId, model, messages });
}

function buildContextBlock(files) {
  if (!files?.length) return '';
  const blocks = files.map((f) => `--- ${f.name} ---\n${f.content}`).join('\n\n');
  return `\n\nAdditional context files provided by the user:\n\n${blocks}`;
}

export { callRelay };
