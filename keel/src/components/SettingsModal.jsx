import { useState } from 'react';
import { PROVIDER_LIST } from '../lib/providers/index.js';
import { getKey, setKey } from '../lib/byok/keyStore.js';

/**
 * BYOK key entry. Everything typed here goes to localStorage on this
 * device and nowhere else until a generation call attaches it to a single
 * /api/relay request header — see src/lib/byok/keyStore.js.
 */
export default function SettingsModal({ open, onClose }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(PROVIDER_LIST.map((p) => [p.id, getKey(p.id) || '']))
  );

  if (!open) return null;

  function save() {
    for (const p of PROVIDER_LIST) setKey(p.id, values[p.id]);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Keel is bring-your-own-key. Keys are stored only in this browser and sent per-request through a stateless
          relay — this app's server never stores or logs them. Configure two or more to unlock ensemble generation.
        </p>

        <div className="mt-5 space-y-4">
          {PROVIDER_LIST.map((p) => (
            <div key={p.id}>
              <label className="flex items-center justify-between text-sm font-medium">
                {p.label}
                <a href={p.docsUrl} target="_blank" rel="noreferrer" className="text-xs font-normal text-blue-600 hover:underline dark:text-blue-400">
                  get a free key
                </a>
              </label>
              <input
                type="password"
                autoComplete="off"
                value={values[p.id]}
                onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                placeholder={`${p.label} API key`}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Cancel
          </button>
          <button onClick={save} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
