#!/usr/bin/env node
/**
 * Standalone, dependency-free verifier for KEEL_PROVENANCE.json (see
 * src/lib/provenance/manifest.js for what a PASS here does and does not
 * prove — read that file's header before trusting output from this script
 * beyond what it actually checks).
 *
 * Usage:
 *   node scripts/verify-provenance.mjs <path-to-extracted-project-or-zip-root>
 *
 * Deliberately has zero npm dependencies and duplicates (rather than
 * imports) the two pure canonicalization/signing-payload functions from
 * src/lib/provenance/manifest.js — the whole point of an independent
 * verifier is that it doesn't have to trust Keel's own runtime code path
 * to check Keel's own claims. Uses Node's built-in Web Crypto
 * (`node:crypto`'s `webcrypto`), the same API surface the browser side
 * uses, so the cryptographic behavior is the same implementation family,
 * not a reimplementation that could subtly diverge.
 */

import { webcrypto } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel']);
const SIGNING_PAYLOAD_VERSION = 'KEEL_PROVENANCE_V1';

async function walk(dir, root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, root)));
    } else if (entry.isFile()) {
      const content = await readFile(full, 'utf8').catch(() => null);
      if (content == null) continue; // skip binary/unreadable files — provenance covers text source, not arbitrary binary assets
      const path = relative(root, full).split(sep).join('/');
      files.push({ path, content });
    }
  }
  return files;
}

function canonicalizeFiles(files) {
  const relevant = files.filter((f) => f.path !== 'KEEL_PROVENANCE.json');
  const sorted = [...relevant].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sorted.map((f) => `${f.path} ${f.content}`).join('');
}

async function sha256Hex(text) {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildSigningPayload(body) {
  return [
    SIGNING_PAYLOAD_VERSION,
    body.generatedAt,
    body.prompt,
    body.providerId || '',
    body.model || '',
    body.generationSource || '',
    String(body.build.ok),
    String(body.build.errorCount),
    body.verdict ? String(body.verdict.score) : '',
    body.verdict ? String(body.verdict.issueCount) : '',
    body.runtimeQa ? String(body.runtimeQa.testedCount) : '',
    body.runtimeQa ? String(body.runtimeQa.brokenCount) : '',
    body.filesHash,
    String(body.fileCount),
  ].join('\n');
}

function base64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: node scripts/verify-provenance.mjs <path-to-extracted-project>');
    process.exit(2);
  }

  const rootStat = await stat(targetDir).catch(() => null);
  if (!rootStat || !rootStat.isDirectory()) {
    console.error(`Not a directory: ${targetDir}`);
    process.exit(2);
  }

  const allFiles = await walk(targetDir, targetDir);
  const manifestFile = allFiles.find((f) => f.path === 'KEEL_PROVENANCE.json');
  if (!manifestFile) {
    console.error('No KEEL_PROVENANCE.json found in that directory — nothing to verify.');
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestFile.content);
  } catch {
    console.error('KEEL_PROVENANCE.json is not valid JSON.');
    process.exit(1);
  }

  const results = { filesHashMatch: false, signatureValid: false };

  const recomputedHash = await sha256Hex(canonicalizeFiles(allFiles));
  results.filesHashMatch = recomputedHash === manifest.filesHash;

  try {
    const publicKey = await webcrypto.subtle.importKey(
      'jwk',
      manifest.publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );
    const signingPayload = buildSigningPayload(manifest);
    results.signatureValid = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64ToBytes(manifest.signature),
      new TextEncoder().encode(signingPayload)
    );
  } catch (e) {
    console.error(`Signature verification threw: ${e.message}`);
  }

  console.log(`Files hash:  ${results.filesHashMatch ? 'MATCH' : 'MISMATCH'} (recomputed ${recomputedHash}${results.filesHashMatch ? '' : ` vs recorded ${manifest.filesHash}`})`);
  console.log(`Signature:   ${results.signatureValid ? 'VALID' : 'INVALID'} against the public key embedded in the manifest itself`);
  console.log(`Recorded:    provider=${manifest.providerId ?? 'n/a'} model=${manifest.model ?? 'n/a'} source=${manifest.generationSource} build.ok=${manifest.build?.ok} verdict=${manifest.verdict ? manifest.verdict.score + '/100' : 'n/a'} runtimeQA=${manifest.runtimeQa ? `${manifest.runtimeQa.brokenCount} broken of ${manifest.runtimeQa.testedCount}` : 'n/a'}`);

  const pass = results.filesHashMatch && results.signatureValid;
  console.log('');
  if (pass) {
    console.log('PASS — the files in this directory are byte-identical to what was recorded, and the manifest has not been altered since it was signed by the key embedded in it.');
    console.log('This does NOT prove the named provider/model produced this code as a third-party attestation — the signing key is self-issued client-side. See src/lib/provenance/manifest.js for the exact claim this does and does not make.');
  } else {
    console.log('FAIL — either the file contents have changed since generation, the manifest was edited, or the signature does not match. Do not treat this bundle as verified.');
  }
  process.exit(pass ? 0 : 1);
}

main();
