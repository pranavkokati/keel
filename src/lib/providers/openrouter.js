import { asOpenAiTool, EMIT_PROJECT_TOOL_NAME } from '../generation/schema.js';

/**
 * OpenRouter adapter — OpenAI-compatible, aggregates many models (including
 * free-tier ones) behind one API. Also notably one of the few providers whose
 * API sets permissive CORS headers, so this is the one path that could, in
 * principle, skip the relay and call directly from the browser. Keel still
 * routes it through /api/relay for consistency with Groq/Gemini rather than
 * special-casing one provider's networking behavior.
 */
export const openrouterProvider = {
  id: 'openrouter',
  label: 'OpenRouter',
  docsUrl: 'https://openrouter.ai/keys',
  defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
  supportsToolCalling: true,

  toProviderRequest({ apiKey, model, messages }) {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/keel-oss/keel',
        'X-Title': 'Keel',
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
