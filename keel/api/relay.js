/**
 * Stateless BYOK relay — the ONLY place a user's provider API key ever
 * reaches a server Keel controls.
 *
 * Contract this file must uphold, because it's the thing the whole
 * "your server never has custody of anyone's key" claim rests on:
 *   - The key arrives in the `x-keel-key` request header, never the body
 *     (bodies are more likely to get logged by accident by infra in front
 *     of this function; a header discipline makes "never log the key" a
 *     one-line rule: never log headers).
 *   - The key is read once, used to build exactly one outbound fetch, and
 *     then falls out of scope. It is never written to a variable that
 *     outlives this request, never passed to console.log/console.error,
 *     never persisted to Supabase, and this function has no database
 *     client at all — it cannot accidentally persist anything.
 *   - No response caching. Every call is a fresh pass-through.
 *
 * This is deliberately a plain Vercel Node serverless function (not Edge),
 * has no dependency on the sandbox or Supabase modules, and does the
 * absolute minimum: validate input shape, look up the provider adapter,
 * forward, normalize, return.
 */

import { getProvider } from '../src/lib/providers/index.js';

// Runs on Vercel's Node.js serverless runtime (the actual Node version is
// controlled by the "engines" field in package.json, not this config —
// Vercel's `config.runtime` only accepts "nodejs" | "edge" |
// "experimental-edge").
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const apiKey = req.headers['x-keel-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'Missing x-keel-key header. Keel is BYOK — configure a key in Settings.' });
    return;
  }

  const { providerId, model, messages } = req.body || {};
  if (!providerId || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Body must include { providerId, model?, messages }' });
    return;
  }

  let provider;
  try {
    provider = getProvider(providerId);
  } catch (e) {
    res.status(400).json({ error: e.message });
    return;
  }

  const { url, headers, body } = provider.toProviderRequest({ apiKey, model, messages });

  let providerRes;
  try {
    providerRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Deliberately no `apiKey` or `headers` in this error payload.
    res.status(502).json({ error: `Could not reach ${provider.label}: ${e.message}` });
    return;
  }

  const rawText = await providerRes.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    res.status(502).json({ error: `${provider.label} returned a non-JSON response`, providerStatus: providerRes.status });
    return;
  }

  if (!providerRes.ok) {
    // Provider error bodies sometimes echo the request; strip anything
    // key-shaped defensively before it leaves this function.
    const safe = JSON.stringify(json).replace(new RegExp(escapeRegExp(apiKey), 'g'), '[redacted]');
    res.status(providerRes.status).json({ error: `${provider.label} error`, detail: JSON.parse(safe) });
    return;
  }

  const normalized = provider.fromProviderResponse(json);
  res.status(200).json(normalized);
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
