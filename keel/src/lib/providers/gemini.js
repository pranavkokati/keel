import { asGeminiFunctionDeclaration, EMIT_PROJECT_TOOL_NAME } from '../generation/schema.js';

/**
 * Gemini adapter. Google's generativelanguage.googleapis.com rejects direct
 * browser requests at the CORS preflight stage (confirmed — see README
 * "Why a relay instead of pure client-side calls"), so this provider is the
 * concrete reason Keel routes every provider through /api/relay rather than
 * calling from the browser directly.
 */
export const geminiProvider = {
  id: 'gemini',
  label: 'Gemini',
  docsUrl: 'https://aistudio.google.com/apikey',
  defaultModel: 'gemini-2.0-flash',
  supportsToolCalling: true,

  toProviderRequest({ apiKey, model, messages }) {
    const m = model || this.defaultModel;
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: messages
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          })),
        systemInstruction: buildSystemInstruction(messages),
        tools: [{ functionDeclarations: [asGeminiFunctionDeclaration()] }],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [EMIT_PROJECT_TOOL_NAME] } },
        generationConfig: { temperature: 0.2 },
      },
    };
  },

  fromProviderResponse(json) {
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const call = parts.find((p) => p.functionCall)?.functionCall;
    if (!call) {
      const text = parts.map((p) => p.text || '').join('');
      return { summary: text, files: [], needsBackend: false, raw: json };
    }
    const args = call.args || {};
    return {
      summary: args.summary || '',
      files: Array.isArray(args.files) ? args.files : [],
      needsBackend: Boolean(args.needsBackend),
      backendSql: args.backendSql || null,
      raw: json,
    };
  },
};

function buildSystemInstruction(messages) {
  const sys = messages.find((m) => m.role === 'system');
  if (!sys) return undefined;
  return { parts: [{ text: sys.content }] };
}
