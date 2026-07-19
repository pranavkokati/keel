import { Link } from 'react-router-dom';

export default function LandingPage({ theme, onToggleTheme }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">Keel</span>
        <div className="flex items-center gap-3">
          <button onClick={onToggleTheme} className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <a
            href="https://github.com/keel-oss/keel"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Source (AGPL-3.0)
          </a>
          <Link to="/build" className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            Open builder
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Describe it. Ship it. Pay nothing to run it.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Keel generates a real Vite + React project from a plain-English prompt, with a live sandboxed preview and
          chat-driven edits — open source, and bring-your-own-key, so nobody but you pays for your own inference.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/build" className="rounded-xl bg-neutral-900 px-6 py-3 font-medium text-white dark:bg-white dark:text-neutral-900">
            Start building →
          </Link>
        </div>

        <div className="mt-20 grid gap-6 text-left sm:grid-cols-3">
          <Feature title="Bring your own key" body="Your Groq, Gemini, or OpenRouter key stays in your browser. Nobody hosting this instance ever sees it or pays for your generations." />
          <Feature title="Self-healing builds" body="Generated code is verified in a live sandbox and automatically re-prompted with real build errors, not guessed fixes." />
          <Feature title="Ensemble generation" body="Configure two or more provider keys and Keel races them in parallel, keeping whichever result actually builds cleanest." />
        </div>
      </main>
    </div>
  );
}

function Feature({ title, body }) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
    </div>
  );
}
