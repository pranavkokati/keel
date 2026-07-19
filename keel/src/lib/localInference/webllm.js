/**
 * Local, in-browser inference tier — no API key, no cloud call, no per-token
 * cost to anyone. Runs a small quantized code model directly in the
 * visitor's browser via WebGPU, using MLC's WebLLM engine.
 *
 * Honest scope note: local mode only targets Instant HTML mode (plain
 * HTML/CSS/JS, no build step) — never Vite+React mode. Two reasons:
 * (1) small quantized models (0.5B-7B params) are meaningfully less
 * reliable than frontier cloud models at producing correct, complete
 * multi-file React projects, and constraining them to simple static
 * markup plays to their actual capability level rather than past it;
 * (2) it means local generation never needs the in-browser esbuild
 * bundler at all (see src/lib/bundler/clientBundle.js) — one fewer
 * unverified system stacked on another for the path that's already the
 * least-tested one in this codebase.
 *
 * Verification status, stated plainly: the code below is written against
 * WebLLM's documented MLCEngine / CreateMLCEngine API and the model IDs
 * below are real, published entries in WebLLM's prebuilt model list (each
 * cross-checked against its own Hugging Face model card at the time this
 * was written). What is NOT verified: actually running this in a real
 * browser with a WebGPU-capable GPU. This sandbox has neither a browser
 * nor a GPU, so end-to-end behavior (does the model actually download,
 * does WebGPU actually initialize, is generation quality usable) is
 * unverified. Treat this tier as beta until someone runs it on real
 * hardware.
 */

import { parseLegacyDelimitedOutput } from '../generation/legacyParser.js';
import { LOCAL_GENERATE_SYSTEM_PROMPT, LOCAL_EDIT_SYSTEM_PROMPT, LOCAL_SELF_HEAL_SYSTEM_PROMPT } from './prompts.js';

export const LOCAL_MODELS = [
  { id: 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5-Coder 0.5B (fastest, ~500MB download)' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5-Coder 1.5B (recommended, ~1.5GB download)' },
  { id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5-Coder 3B (best quality, ~3GB download)' },
];

export const DEFAULT_LOCAL_MODEL = LOCAL_MODELS[1].id;

export class WebGpuUnavailableError extends Error {
  constructor() {
    super("This browser doesn't expose WebGPU (navigator.gpu is unavailable), so the local model can't run. Use a recent Chrome/Edge, or configure a cloud provider key in Settings instead.");
  }
}

let enginePromise = null;
let engineModelId = null;

export function isWebGpuAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
}

async function getEngine(modelId, onProgress) {
  if (!isWebGpuAvailable()) throw new WebGpuUnavailableError();

  if (enginePromise && engineModelId === modelId) return enginePromise;

  engineModelId = modelId;
  enginePromise = (async () => {
    const webllm = await import('@mlc-ai/web-llm');
    return webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => onProgress?.({ text: progress.text, fraction: progress.progress }),
    });
  })().catch((err) => {
    enginePromise = null;
    engineModelId = null;
    throw err;
  });

  return enginePromise;
}

async function chatOnce(engine, systemPrompt, userContent) {
  const response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 4096,
  });
  return response.choices?.[0]?.message?.content || '';
}

export async function generateProjectLocally({ prompt, modelId = DEFAULT_LOCAL_MODEL, onProgress }) {
  const engine = await getEngine(modelId, onProgress);
  const raw = await chatOnce(engine, LOCAL_GENERATE_SYSTEM_PROMPT, prompt);
  const parsed = parseLegacyDelimitedOutput(raw);
  return { ...parsed, needsBackend: false };
}

export async function editProjectLocally({ instruction, currentFiles, modelId = DEFAULT_LOCAL_MODEL, onProgress }) {
  const engine = await getEngine(modelId, onProgress);
  const snapshot = currentFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  const raw = await chatOnce(engine, LOCAL_EDIT_SYSTEM_PROMPT, `Current project:\n\n${snapshot}\n\nInstruction: ${instruction}`);
  const parsed = parseLegacyDelimitedOutput(raw);
  return { ...parsed, needsBackend: false };
}

export async function healLocally({ files, errors, modelId = DEFAULT_LOCAL_MODEL, onProgress }) {
  const engine = await getEngine(modelId, onProgress);
  const snapshot = files.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  const raw = await chatOnce(engine, LOCAL_SELF_HEAL_SYSTEM_PROMPT, `Project:\n\n${snapshot}\n\nError:\n\n${errors.join('\n')}`);
  const parsed = parseLegacyDelimitedOutput(raw);
  return parsed.files?.length ? parsed.files : files;
}
