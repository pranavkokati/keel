/**
 * Structured-output contract for generation and edit calls.
 *
 * Instead of asking the model to stream free text containing markers like
 * `---FILE:path---` and then regex-parsing (and patching truncated string
 * literals) out of whatever comes back, Keel asks for this shape directly via
 * each provider's function/tool-calling mode. See src/lib/generation/engine.js
 * for how this is used, and each src/lib/providers/*.js for how it's adapted
 * to that provider's specific tool-calling wire format.
 */

export const EMIT_PROJECT_TOOL_NAME = 'emit_project';

export const PROJECT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'One or two sentence, human-readable summary of what was built or changed.',
    },
    files: {
      type: 'array',
      description: 'Every file that should exist in the project after this step, as complete file contents (not diffs).',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative file path, e.g. "src/components/Hero.jsx".',
          },
          content: {
            type: 'string',
            description: 'The full, final contents of the file.',
          },
        },
        required: ['path', 'content'],
      },
    },
    needsBackend: {
      type: 'boolean',
      description: 'True if this project requires persistent data, auth, or server logic beyond a static frontend (see src/lib/generation/backendDetect.js).',
    },
    backendSql: {
      type: 'string',
      description:
        'Only when needsBackend is true: Postgres DDL to provision storage, containing ONLY CREATE TABLE, CREATE INDEX, ALTER TABLE ... ENABLE ROW LEVEL SECURITY, and CREATE POLICY statements — nothing else (no DROP/DELETE/TRUNCATE/GRANT). Every table name MUST start with the literal prefix "app_" (e.g. app_todos). See GENERATE_SYSTEM_PROMPT for the full contract.',
    },
  },
  required: ['files', 'summary'],
};

/** OpenAI-compatible tool definition (used by Groq and OpenRouter adapters). */
export function asOpenAiTool() {
  return {
    type: 'function',
    function: {
      name: EMIT_PROJECT_TOOL_NAME,
      description: 'Return the complete set of project files for the request.',
      parameters: PROJECT_JSON_SCHEMA,
    },
  };
}

/** Gemini function-declaration shape (used by the Gemini adapter). */
export function asGeminiFunctionDeclaration() {
  return {
    name: EMIT_PROJECT_TOOL_NAME,
    description: 'Return the complete set of project files for the request.',
    parameters: PROJECT_JSON_SCHEMA,
  };
}
