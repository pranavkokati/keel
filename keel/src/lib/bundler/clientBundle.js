/**
 * In-browser project bundler — replaces the E2B cloud sandbox entirely for
 * previewing and self-healing generated projects.
 *
 * Why this exists: Keel previously ran every generated project inside a
 * real E2B cloud VM (npm install + vite dev server) just to render a
 * preview and to check whether the code built cleanly. That's a real
 * infrastructure cost and a real operational dependency for whoever hosts
 * a Keel instance. esbuild-wasm can bundle the exact same Vite + React +
 * Tailwind project structure entirely inside the visitor's own browser tab
 * — no server, no VM, no network round trip per edit. This mirrors the
 * architecture used by other BYOK app builders that ship an in-browser
 * bundler instead of a cloud sandbox (esbuild-wasm compiled to WebAssembly,
 * running client-side).
 *
 * Scope and honest limitations:
 * - React/ReactDOM/react-router-dom and other bare-specifier imports are
 *   resolved to esm.sh CDN builds and marked `external` rather than bundled
 *   — esbuild-wasm has no npm registry access from inside a browser tab, so
 *   this is the standard way in-browser bundlers handle third-party deps.
 * - Tailwind CSS is NOT compiled by esbuild. Running Tailwind's real
 *   compiler as WASM in a browser tab is its own large undertaking and
 *   isn't attempted here. Instead the preview shell loads Tailwind's own
 *   official browser-only "Play CDN" script, which JIT-compiles utility
 *   classes from the live DOM. This is a deliberate, documented tradeoff:
 *   it covers the vast majority of generated Tailwind usage, but it is not
 *   a byte-for-byte match for a real `tailwindcss` CLI/PostCSS build, and
 *   arbitrary custom `tailwind.config.js` theme extensions are not honored
 *   in the preview (they still work correctly in the real project once the
 *   user downloads it and runs a real build).
 * - TypeScript files are transpiled (types stripped), not type-checked —
 *   same tradeoff any fast in-browser bundler makes.
 * - This module resolves and bundles JS/JSX/TS/TSX and inlines CSS files
 *   it can find in the virtual file set; it does not handle images/fonts
 *   as bundled assets (those already work in the real project via Vite's
 *   own asset pipeline once downloaded).
 */

import * as esbuild from 'esbuild-wasm';

const CDN_IMPORT_MAP = {
  react: 'https://esm.sh/react@19.2.0',
  'react-dom': 'https://esm.sh/react-dom@19.2.0',
  'react-dom/client': 'https://esm.sh/react-dom@19.2.0/client',
  'react-router-dom': 'https://esm.sh/react-router-dom@6.30.3?deps=react@19.2.0,react-dom@19.2.0',
};

const JS_EXTENSIONS = ['.jsx', '.js', '.tsx', '.ts'];

let initPromise = null;
function ensureInitialized() {
  if (!initPromise) {
    initPromise = esbuild
      .initialize({ wasmURL: `https://unpkg.com/esbuild-wasm@${esbuild.version}/esbuild.wasm`, worker: true })
      .catch((err) => {
        initPromise = null; // allow retry on next call rather than permanently wedging
        throw err;
      });
  }
  return initPromise;
}

function normalizePath(p) {
  return p.replace(/^\.\//, '').replace(/^\/+/, '');
}

function loaderForPath(path) {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  return 'js';
}

function resolveRelativeImport(importerPath, importPath, filesByPath) {
  const importerDir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/')) : '';
  const joined = normalizePath(joinPath(importerDir, importPath));

  if (filesByPath.has(joined)) return joined;
  for (const ext of JS_EXTENSIONS) {
    if (filesByPath.has(joined + ext)) return joined + ext;
  }
  for (const ext of JS_EXTENSIONS) {
    const asIndex = `${joined}/index${ext}`;
    if (filesByPath.has(asIndex)) return asIndex;
  }
  return null;
}

function joinPath(dir, rel) {
  const parts = `${dir}/${rel}`.split('/');
  const stack = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function findEntryPoint(filesByPath) {
  const candidates = ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts', 'src/index.jsx', 'src/index.js'];
  return candidates.find((c) => filesByPath.has(c)) || null;
}

function createVirtualFsPlugin(filesByPath) {
  return {
    name: 'keel-virtual-fs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path.startsWith('.') || args.path.startsWith('/')) {
          const resolved = resolveRelativeImport(args.importer ? normalizePath(args.importer) : '', args.path, filesByPath);
          if (!resolved) {
            return { errors: [{ text: `Cannot resolve "${args.path}" from "${args.importer}" — no matching file in the project.` }] };
          }
          return { path: resolved, namespace: 'keel-vfs' };
        }
        if (args.path.endsWith('.css')) {
          // Local package CSS we don't attempt to resolve from a CDN; ignore quietly.
          return { path: args.path, namespace: 'keel-vfs-empty' };
        }
        const cdnUrl = CDN_IMPORT_MAP[args.path] || `https://esm.sh/${args.path}`;
        return { path: cdnUrl, external: true };
      });

      build.onLoad({ filter: /.*/, namespace: 'keel-vfs' }, (args) => {
        const content = filesByPath.get(args.path);
        if (content == null) return { errors: [{ text: `File not found in project: ${args.path}` }] };
        return { contents: content, loader: loaderForPath(args.path), resolveDir: '' };
      });

      build.onLoad({ filter: /.*/, namespace: 'keel-vfs-empty' }, () => ({ contents: '', loader: 'js' }));
    },
  };
}

/**
 * Bundles a Vite+React+Tailwind-shaped project entirely in-browser.
 * Returns { ok: true, previewHtml } on success, or { ok: false, errors }
 * with the same shape the self-heal loop already expects from the old
 * E2B-based build check.
 */
export async function buildProjectInBrowser(files) {
  const filesByPath = new Map(files.map((f) => [normalizePath(f.path), f.content]));
  const indexPath = [...filesByPath.keys()].find((p) => p === 'index.html' || p.endsWith('/index.html'));
  if (!indexPath) return { ok: false, errors: ['No index.html found in the project.'] };

  const entry = findEntryPoint(filesByPath);
  if (!entry) return { ok: false, errors: ['No entry point found (expected src/main.jsx or similar).'] };

  try {
    await ensureInitialized();
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      target: 'es2020',
      plugins: [createVirtualFsPlugin(filesByPath)],
      logLevel: 'silent',
    });

    const jsOutput = result.outputFiles?.find((f) => f.path.endsWith('.js'));
    if (!jsOutput) return { ok: false, errors: ['Bundler produced no JS output.'] };

    const previewHtml = buildPreviewShell(filesByPath.get(indexPath), jsOutput.text);
    return { ok: true, errors: [], previewHtml };
  } catch (err) {
    const errors = (err?.errors || []).map((e) => `${e.text}${e.location ? ` (${e.location.file}:${e.location.line})` : ''}`);
    return { ok: false, errors: errors.length ? errors : [String(err?.message || err)] };
  }
}

const TAILWIND_PLAY_CDN = '<script src="https://cdn.tailwindcss.com"></script>';

function buildPreviewShell(indexHtmlSource, bundledJs) {
  let html = indexHtmlSource;

  // Swap the real module-script tag (which points at a source file path
  // that only exists in a real Vite dev server) for the actual bundled
  // code, inlined directly.
  html = html.replace(/<script[^>]+type=["']module["'][^>]*src=["'][^"']*["'][^>]*>\s*<\/script>/i, `<script type="module">${bundledJs}</script>`);

  // Ephemeral only: add Tailwind's browser JIT script for preview styling.
  // Never persisted back to the real files array (see inject.js for the
  // same ephemeral-vs-persisted principle applied to Verdict's bootstrap).
  if (!/cdn\.tailwindcss\.com/.test(html)) {
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${TAILWIND_PLAY_CDN}\n</head>`) : `${TAILWIND_PLAY_CDN}\n${html}`;
  }

  return html;
}
