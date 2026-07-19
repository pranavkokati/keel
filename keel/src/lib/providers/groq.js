import { asOpenAiTool, EMIT_PROJECT_TOOL_NAME } from '../generation/schema.js';

/**
 * Groq adapter — OpenAI-compatible chat/completions API, fast LPU inference,
 * genuinely free developer tier (rate-limited, no credit card). Good default
 * "fast, free" option for BYOK users.
 */
export const groqProvider = {
  id: 'groq',
  label: 'Groq',
  docsUrl: 'https://console.groq.com/keys',
  defaultModel: 'llama-3.3-70b-versatile',
  supportsToolCalling: true,

  /** Builds the request the relay will forward to Groq's API. */
  toProviderRequest({ apiKey, model, messages }) {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: model || this.defaultModel,
        messages,
        tools: [asOpenAiTool()],
        tool_choice: { type: 'function', function: { name: EMIT_PROJECT_TOOL_NAME } },
        temperature: 0.2,
      },
    };
  },

  /** Normalizes Groq's OpenAI-shaped response into { summary, files, needsBackend, raw }. */
  fromProviderResponse(json) {
    const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return { summary: json?.choices?.[0]?.message?.content || '', files: [], needsBackend: false, raw: json };
    }
    const args = safeJsonParse(toolCall.function?.arguments);
    return {
      summary: args?.summary || '',
      files: Array.isArray(args?.files) ? args.files : [],
      needsBackend: Boolean(args?.needsBackend),
      backendSql: args?.backendSql || null,
      raw: json,
    };
  },
};

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
