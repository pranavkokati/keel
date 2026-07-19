/**
 * "Instant HTML" mode: a second generation path alongside the default
 * Vite + React + E2B-sandbox path. When a request is simple enough not to
 * need a build step — a landing page, a portfolio, a form — Keel can
 * generate plain HTML/CSS/JS instead, and preview it by inlining everything
 * into a single document rendered in an <iframe srcDoc>. No sandbox, no
 * E2B_API_KEY, no build. This means live preview works out of the box on
 * *any* Keel instance for this class of request, even one where the
 * operator hasn't configured anything beyond the code itself — sandbox
 * preview for the Vite+React path still depends on E2B, but this path
 * doesn't depend on anything.
 */

const STYLESHEET_LINK = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
const SCRIPT_SRC = /<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi;

/**
 * @param {Array<{path: string, content: string}>} files
 * @returns {string|null} a single, self-contained HTML document with local
 *   <link rel="stylesheet"> and <script src="..."> tags inlined, or null if
 *   there's no index.html to build a preview from.
 */
export function buildHtmlPreviewDocument(files) {
  const byPath = new Map(files.map((f) => [normalizePath(f.path), f.content]));
  const indexPath = [...byPath.keys()].find((p) => p === 'index.html') || [...byPath.keys()].find((p) => p.endsWith('/index.html'));
  if (!indexPath) return null;

  let html = byPath.get(indexPath);

  html = html.replace(STYLESHEET_LINK, (match, href) => {
    const content = lookupLocalFile(byPath, href);
    return content == null ? match : `<style>\n${content}\n</style>`;
  });

  html = html.replace(SCRIPT_SRC, (match, src) => {
    const content = lookupLocalFile(byPath, src);
    return content == null ? match : `<script>\n${content}\n</script>`;
  });

  return html;
}

/** True if this file set looks like plain HTML/CSS/JS rather than a Vite/React project. */
export function isHtmlModeProject(files) {
  const paths = files.map((f) => normalizePath(f.path));
  const hasIndexHtml = paths.some((p) => p === 'index.html');
  const hasPackageJson = paths.some((p) => p === 'package.json');
  return hasIndexHtml && !hasPackageJson;
}

function lookupLocalFile(byPath, href) {
  if (/^https?:\/\//i.test(href) || href.startsWith('//')) return null; // external — leave the tag as-is
  const clean = normalizePath(href.replace(/^\.\//, ''));
  return byPath.has(clean) ? byPath.get(clean) : null;
}

function normalizePath(p) {
  return p.replace(/^\/+/, '');
}
