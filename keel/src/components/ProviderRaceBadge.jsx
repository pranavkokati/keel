/** Shows ensemble-generation results: which providers were tried and which one won. */
export default function ProviderRaceBadge({ candidates, winnerProviderId }) {
  if (!candidates?.length || candidates.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-neutral-500 dark:text-neutral-400">Ensemble:</span>
      {candidates.map((c) => (
        <span
          key={c.providerId}
          className={
            'rounded-full px-2 py-0.5 font-medium ' +
            (c.providerId === winnerProviderId
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : c.ok
              ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400')
          }
          title={c.errors?.join('\n')}
        >
          {c.providerId}
          {c.providerId === winnerProviderId ? ' ✓ won' : c.ok ? '' : ' failed'}
        </span>
      ))}
    </div>
  );
}
