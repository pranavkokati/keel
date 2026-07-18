import { useState } from 'react';
import ProviderRaceBadge from './ProviderRaceBadge.jsx';

export default function ChatPanel({ messages, busy, onSend, ensembleAvailable, ensembleEnabled, onToggleEnsemble }) {
  const [input, setInput] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    onSend(input.trim());
    setInput('');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            Describe an app to build — e.g. "a landing page for a coffee roastery with a signup form" or "a todo app
            with accounts that saves each user's tasks".
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
      </div>

      <form onSubmit={submit} className="border-t border-neutral-200 p-3 dark:border-neutral-800">
        {ensembleAvailable && (
          <label className="mb-2 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <input type="checkbox" checked={ensembleEnabled} onChange={onToggleEnsemble} />
            Ensemble mode — race all configured providers, keep the cleanest build
          </label>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            placeholder="Describe an app, or ask for an edit…"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
