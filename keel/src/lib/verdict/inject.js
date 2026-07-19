import { VERDICT_ENGINE_SCRIPT } from './engine.js';
import { RUNTIME_QA_SCRIPT } from './runtimeQa.js';

const BOOTSTRAP = `
(function () {
  function run() {
    try {
      var result = window.__keelVerdictRun(80);
      window.parent.postMessage({ source: 'keel-verdict', result: result }, '*');
    } catch (e) {
      window.parent.postMessage({ source: 'keel-verdict', error: String(e && e.message || e) }, '*');
    }
    // Runtime QA runs after the static Verdict pass, deliberately serialized
    // rather than parallel: it clicks things and mutates the live DOM
    // (opens modals, switches tabs), which would otherwise race Verdict's
    // own DOM snapshot and produce a nondeterministic score.
    Promise.resolve(window.__keelRuntimeQaRun ? window.__keelRuntimeQaRun() : null)
      .then(function (result) {
        if (result) window.parent.postMessage({ source: 'keel-runtime-qa', result: result }, '*');
      })
      .catch(function (e) {
        window.parent.postMessage({ source: 'keel-runtime-qa', error: String(e && e.message || e) }, '*');
      });
  }
  if (document.readyState === 'complete') {
    setTimeout(run, 600);
  } else {
    window.addEventListener('load', function () { setTimeout(run, 600); });
  }
})();
`;

/**
 * Ephemeral instrumentation only — appends a self-contained check-and-
 * report script to an HTML string, so Keel's parent window can receive a
 * `keel-verdict` postMessage (static design QA) followed by a
 * `keel-runtime-qa` postMessage (does the app actually work when clicked —
 * see runtimeQa.js) computed entirely in the browser that's already
 * running the preview — no Playwright, no server compute, no LLM call for
 * either check.
 *
 * Shared by both preview paths: Instant HTML mode operates on the `files`
 * array directly (injectVerdictBootstrap below); the in-browser bundler
 * (src/lib/bundler/clientBundle.js) produces a preview HTML string
 * directly and calls this lower-level function on that string instead.
 */
export function appendVerdictScript(htmlString) {
  const scriptTag = `<script>${VERDICT_ENGINE_SCRIPT}\n${RUNTIME_QA_SCRIPT}\n${BOOTSTRAP}</script>`;
  return /<\/body>/i.test(htmlString) ? htmlString.replace(/<\/body>/i, `${scriptTag}\n</body>`) : `${htmlString}\n${scriptTag}`;
}

/**
 * Never call this on the `files` array that gets persisted to React state
 * / ZIP downloads / saved projects — it's meant for exactly one purpose:
 * ephemeral instrumentation of Instant HTML mode's preview document.
 */
export function injectVerdictBootstrap(files) {
  const indexIdx = files.findIndex((f) => normalizePath(f.path) === 'index.html' || normalizePath(f.path).endsWith('/index.html'));
  if (indexIdx === -1) return files;

  const next = files.slice();
  next[indexIdx] = { ...next[indexIdx], content: appendVerdictScript(next[indexIdx].content) };
  return next;
}

function normalizePath(p) { return p.replace(/^\/+/, ''); }
