import { useRef, useState } from 'react';
import ProviderRaceBadge from './ProviderRaceBadge.jsx';
import { PROMPT_PRESETS } from '../lib/presets.js';

const CONTEXT_FILE_ACCEPT = '.txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.yaml,.yml';
const MAX_CONTEXT_BYTES = 60_000;

const SLASH_COMMANDS = [
  { cmd: '/download', help: 'Download the current project as a ZIP' },
  { cmd: '/publish', help: 'Publish the current project live' },
  { cmd: '/html', help: 'Switch to instant HTML mode (no bundler needed)' },
  { cmd: '/react', help: 'Switch back to Vite + React mode (bundled in your browser)' },
  { cmd: '/help', help: 'List available slash commands' },
];

export default function ChatPanel({
  messages,
  busy,
  onSend,
  ensembleAvailable,
  ensembleEnabled,
  onToggleEnsemble,
  mode,
  onSetMode,
  onDownload,
  onPublish,
  useLocalModel,
  onToggleLocalModel,
  webGpuAvailable,
}) {
  const [input, setInput] = useState('');
  const [contextFiles, setContextFiles] = useState([]);
  const fileInputRef = useRef(null);

  function submit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    const slash = handleSlashCommand(trimmed);
    if (slash) {
      setInput('');
      return;
    }

    onSend(trimmed, contextFiles);
    setInput('');
    setContextFiles([]);
  }

  function handleSlashCommand(text) {
    const [cmd] = text.split(/\s+/);
    switch (cmd.toLowerCase()) {
      case '/download':
        onDownload?.();
        return true;
      case '/publish':
        onPublish?.();
        return true;
      case '/html':
        onSetMode?.('html');
        return true;
      case '/react':
        onSetMode?.('react');
        return true;
      case '/help':
        return true;
      default:
        return false;
    }
  }

  async function handleFilesSelected(fileList) {
    const files = Array.from(fileList || []);
    const read = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, content: String(reader.result).slice(0, MAX_CONTEXT_BYTES) });
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
          })
      )
    );
    setContextFiles((cur) => [...cur, ...read.filter(Boolean)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              Describe an app to build, or start from a preset below. Type <code>/help</code> any time for slash commands.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setInput(p.prompt)}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-6' : 'mr-6'}>
            <div
              className={
                'rounded-2xl px-4 py-2.5 text-sm ' +
                (m.role === 'user'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-neutral-100 dark:bg-neutral-800')
              }
            >
              {m.content}
            </div>
            {m.candidates && (
              <div className="mt-1.5 px-1">
                <ProviderRaceBadge candidates={m.candidates} winnerProviderId={m.winnerProviderId} />
              </div>
            )}
            {m.action && (
              <div className="mt-1.5 px-1">
                <button
                  onClick={m.action.onClick}
                  disabled={m.action.disabled}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                >
                  {m.action.label}
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="mr-6 rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">Generating…</div>}
        {input.trim() === '/help' && (
          <div className="mr-6 rounded-2xl bg-neutral-100 px-4 py-2.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {SLASH_COMMANDS.map((s) => (
              <div key={s.cmd}>
                <code>{s.cmd}</code> — {s.help}
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-neutral-200 p-3 dark:border-neutral-800">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <label className={'flex items-center gap-1.5' + (useLocalModel ? ' opacity-40' : '')}>
            <input type="checkbox" checked={mode === 'html'} disabled={useLocalModel} onChange={(e) => onSetMode?.(e.target.checked ? 'html' : 'react')} />
            Instant HTML mode — bundled in your browser, preview is immediate
          </label>
          {ensembleAvailable && !useLocalModel && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={ensembleEnabled} onChange={onToggleEnsemble} />
              Ensemble — race all configured providers
            </label>
          )}
          <label className={'flex items-center gap-1.5' + (webGpuAvailable ? '' : ' opacity-40')} title={webGpuAvailable ? 'Runs a small code model directly in your browser via WebGPU — no API key, first use downloads ~1.5GB' : "Your browser doesn't support WebGPU, so this isn't available here"}>
            <input type="checkbox" checked={useLocalModel} disabled={!webGpuAvailable} onChange={onToggleLocalModel} />
            On-device model (no key needed{webGpuAvailable ? '' : ' — WebGPU unavailable'})
          </label>
        </div>

        {contextFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {contextFiles.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {f.name}
                <button type="button" onClick={() => setContextFiles((cur) => cur.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-500">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" multiple accept={CONTEXT_FILE_ACCEPT} className="hidden" onChange={(e) => handleFilesSelected(e.target.files)} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach context files"
            className="rounded-xl border border-neutral-300 px-3 text-sm text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            placeholder="Describe an app, ask for an edit, or type /help…"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
