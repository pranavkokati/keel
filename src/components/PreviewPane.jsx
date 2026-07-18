import { useState } from 'react';

/** Live sandbox preview (iframe to the E2B preview URL) with a Code tab that shows the selected file's raw content. */
export default function PreviewPane({ previewUrl, selectedFile, healStatus }) {
  const [tab, setTab] = useState('preview');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <div className="flex gap-1">
          {['preview', 'code'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'rounded-md px-3 py-1 text-xs font-medium capitalize ' +
                (tab === t ? 'bg-neutral-200 dark:bg-neutral-800' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')
              }
            >
              {t}
            </button>
          ))}
        </div>
        {healStatus && (
          <span className={'text-xs ' + (healStatus.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
            {healStatus.ok
              ? healStatus.healed
                ? `Self-healed after ${healStatus.attempts} attempt(s)`
                : 'Built clean'
              : `Attempt ${healStatus.attempts}/3 — fixing build errors…`}
          </span>
        )}
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            open in new tab ↗
          </a>
        )}
      </div>

      <div className="flex-1 overflow-hidden bg-neutral-50 dark:bg-neutral-950">
        {tab === 'preview' ? (
          previewUrl ? (
            <iframe title="Live preview" src={previewUrl} className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
              No sandbox running yet.
            </div>
          )
        ) : (
          <pre className="h-full overflow-auto p-4 text-xs">
            <code>{selectedFile?.content || 'Select a file from the explorer.'}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
