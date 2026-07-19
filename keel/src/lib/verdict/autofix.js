import { extractContrastFixes } from './engine.js';

const OVERRIDE_BLOCK_ID = 'keel-verdict-fixes';
const OVERRIDE_START = `<style id="${OVERRIDE_BLOCK_ID}">`;

/**
 * Turns a Verdict contrast result directly into real CSS — no LLM call, no
 * guessing which Tailwind class produced the color. Verdict already
 * computed a working replacement hex for each failing element AND a real
 * CSS selector for it (see engine.js's cssSelector); the only job left is
 * to emit `${selector} { color: ${hex} !important; }` for each one. This
 * works identically whether the original color came from a Tailwind
 * utility class, inline style, or plain CSS — Keel never needs to parse or
 * rewrite the source that produced the bad color, only override its
 * computed result, which is both simpler and harder to get wrong than
 * regex-rewriting arbitrary JSX/Tailwind class names.
 */
export function buildContrastOverrideCss(verdictResult) {
  const fixes = extractContrastFixes(verdictResult);
  if (fixes.length === 0) return null;

  const seen = new Map();
  for (const { selector, hex } of fixes) seen.set(selector, hex); // last wins if duplicated

  const rules = [...seen.entries()].map(([selector, hex]) => `${selector} { color: ${hex} !important; }`).join('\n');
  return `/* Verdict auto-fix: WCAG AA contrast corrections, computed locally, $0 LLM cost */\n${rules}`;
}

/**
 * Persists override CSS into the real (non-ephemeral) file set by writing
 * a single, idempotent <style id="keel-verdict-fixes"> block into
 * index.html's <head> — replacing any prior block from an earlier
 * auto-fix round rather than stacking duplicates.
 */
export function applyVerdictOverrides(files, cssText) {
  const indexIdx = files.findIndex((f) => normalizePath(f.path) === 'index.html' || normalizePath(f.path).endsWith('/index.html'));
  if (indexIdx === -1 || !cssText) return files;

  let content = files[indexIdx].content;
  const existingBlock = new RegExp(`${OVERRIDE_START}[\\s\\S]*?</style>`, 'i');
  const newBlock = `${OVERRIDE_START}\n${cssText}\n</style>`;

  content = existingBlock.test(content)
    ? content.replace(existingBlock, newBlock)
    : /<\/head>/i.test(content)
      ? content.replace(/<\/head>/i, `${newBlock}\n</head>`)
      : `${newBlock}\n${content}`;

  const next = files.slice();
  next[indexIdx] = { ...next[indexIdx], content };
  return next;
}

function normalizePath(p) {
  return p.replace(/^\/+/, '');
}
