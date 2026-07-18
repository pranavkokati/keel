/**
 * Fallback parser for the rare case a configured model/provider doesn't
 * support structured tool-calling output. This is intentionally NOT the
 * primary path (see engine.js) — it exists only so Keel degrades gracefully
 * instead of failing outright, and it is exactly the class of fragile
 * regex-over-streamed-text parsing the structured-output engine exists to
 * avoid. Keep it simple; don't invest in making this path clever.
 */

const FILE_MARKER = /^---FILE:(.+?)---$/;

/**
 * Parses `---FILE:path---\n<content>\n---FILE:next---...` style text into
 * a files array. Best-effort only.
 * @param {string} text
 * @returns {{files: Array<{path:string, content:string}>, summary: string}}
 */
export function parseLegacyDelimitedOutput(text) {
  const lines = text.split('\n');
  const files = [];
  let current = null;
  let preamble = [];

  for (const line of lines) {
    const match = line.match(FILE_MARKER);
    if (match) {
      if (current) files.push(current);
      current = { path: match[1].trim(), content: '' };
      continue;
    }
    if (current) {
      current.content += (current.content ? '\n' : '') + line;
    } else {
      preamble.push(line);
    }
  }
  if (current) files.push(current);

  return { files, summary: preamble.join('\n').trim().slice(0, 500) };
}
