import { callRelay } from './engine.js';

/**
 * Launch Kit — an opt-in extra generation pass that emits three files
 * grounded in the project Keel actually just built: LAUNCH.md (real
 * install/run instructions derived from the real package.json and file
 * layout that exists), QA_CHECKLIST.md (a manual verification checklist
 * that references real copy, headings, and interactive elements present in
 * the generated code — not a generic template), and MARKETING.md (a short
 * launch blurb grounded in what the app actually does).
 *
 * Why this exists: some competing "one-prompt app builder" tools (e.g.
 * Komand Builder, a local single-prompt generator) advertise a full
 * package — frontend, backend, tests, marketing copy, deploy docs — but
 * produce it by filling in a fixed template with the same boilerplate
 * React component, the same canned marketing sentence, and a "test" that
 * only checks two hardcoded strings exist in a schema file, regardless of
 * what was actually asked for or generated (verified by reading that
 * project's own source: server/generator.js writes one static component
 * whose only prompt-derived pieces are a title string and a
 * three-word "product line" classification; server/orchestrator.js's
 * "test" step calls a single assert on two fixed substrings; there is no
 * LLM call anywhere in that codebase's generation path). Launch Kit takes
 * the opposite approach on purpose: every file it emits is a real BYOK LLM
 * call fed the actual generated code, so the QA checklist references
 * things that actually exist on the page and the install docs match the
 * actual package.json — not a static shell reused across every request.
 *
 * Explicit scope limit, stated plainly rather than implied: this does NOT
 * emit a wired-up automated test runner. Keel's generated Vite+React
 * projects don't ship with a test framework in package.json, so writing a
 * "unit test file" that nothing ever executes would be worse than not
 * writing one — a checklist a human (or an agent with browser tools) can
 * actually act on is the honest artifact here, not a decorative test file
 * that silently never runs. If genuine automated testing is wanted, ask
 * Keel in chat to add a real test runner (e.g. Vitest) to the project
 * first; Launch Kit's checklist is deliberately a different, more honest
 * kind of QA artifact for a framework-generated static/SPA project with no
 * CI pipeline of its own.
 */

const LAUNCH_KIT_SYSTEM_PROMPT = `You are Keel's Launch Kit generator. You will be given a user's original request and the complete, already-generated project files (already verified to build, if this is a Vite+React project). Your job is to produce exactly three new documentation files grounded in the ACTUAL code you were given — never generic boilerplate.

Call the emit_project tool exactly once. The "files" array must contain exactly these three files (paths exactly as written):

1. LAUNCH.md — real install/run instructions. Read the actual package.json (if present) for the real dependency list and the real npm scripts, and write instructions that match them exactly (correct script names, correct port if visible in vite.config, correct env vars if a .env.example-style file exists in the project). If this is a plain HTML/CSS/JS project (no package.json), say so and give the real "open index.html directly, or run any static file server" instructions instead — do not invent a build step that doesn't exist.

2. QA_CHECKLIST.md — a manual verification checklist of 6-12 concrete items, each one referencing something that actually exists in the generated code: a real heading's exact text, a real button's exact label, a real form field, a real link destination, a real section. Do not write generic items like "check that the page loads" — every item must be specific enough that someone could fail it by looking at the actual rendered page.

3. MARKETING.md — a short (under 150 words) launch blurb: one headline and 2-3 sentences describing what this specific app does, written from the actual content/purpose of the generated project, not a generic SaaS pitch. If the project is clearly a personal/demo project rather than a product, say so plainly rather than inventing business claims (MRR, users, conversion rates, etc.) that have no basis in what was generated.

The "summary" field should be one sentence confirming what was added. Do not modify or re-emit any of the original project files — only the three new files above.`;

/**
 * @param {{providerId: string, model?: string, projectFiles: Array<{path:string, content:string}>, originalPrompt: string}} args
 * @returns {Promise<{files: Array<{path:string, content:string}>, summary: string}>}
 */
export async function generateLaunchKit({ providerId, model, projectFiles, originalPrompt }) {
  const snapshot = projectFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  const messages = [
    { role: 'system', content: LAUNCH_KIT_SYSTEM_PROMPT },
    { role: 'user', content: `Original request: ${originalPrompt}\n\nGenerated project:\n\n${snapshot}` },
  ];
  const result = await callRelay({ providerId, model, messages });
  const files = (result.files || []).filter((f) => ['LAUNCH.md', 'QA_CHECKLIST.md', 'MARKETING.md'].includes(f.path));
  return { files, summary: result.summary };
}
