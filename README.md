# Keel

Keel is an open-source AI app generator: describe an app in plain English, get a
real Vite + React project back with a live sandboxed preview, chat-driven edits,
and one-click deploy. It's in the same category as tools like, Bolt, or
Lovable, built from scratch with three differences that matter:

1. **Bring your own key.** Every AI generation/edit call runs on a model key the
   *user* provides (Groq, Gemini, or OpenRouter). The operator running a Keel
   instance never pays for anyone else's inference — cost scales with each
   user's own key and rate limit, never the operator's bill.
2. **Self-healing generation.** Generated code is pushed into the live sandbox,
   real build/console errors are captured, and the model is automatically
   re-prompted with the *actual* error until the project boots clean (capped at
   a few attempts) — not a single post-hoc "fix errors" pass over hoped-for bugs.
3. **Ensemble generation.** If you've configured more than one provider key,
   Keel can generate the same request against multiple models in parallel and
   keep whichever result actually builds and boots cleanest, instead of
   committing to one model's first attempt.

Keel is licensed AGPL-3.0-or-later: if you run a modified version of Keel as a
network service, you must make the source of your modified version available
to your users (see `LICENSE`).

## Why this exists

This project starts from a simple observation: most "prompt to app" tools ask
the operator to eat two costs — AI inference and a paid code sandbox — which is
exactly why most of them are commercial products with metered pricing, not
things you can self-host for free. Keel is built so an individual can run a
fully-functional instance at genuinely $0/month:

| Cost center | Who pays | How |
|---|---|---|
| AI inference (generation, edits, self-heal retries) | The end user | BYOK — their own Groq/Gemini/OpenRouter key, entered client-side, never stored server-side |
| Sandbox preview (E2B) | The operator, free tier | 100 free hours/month on E2B's Hobby tier, enforced with a hard monthly cap (`src/lib/sandbox/killSwitch.js`) so usage can never silently roll into paid billing |
| Auth + saved projects (Supabase) | The operator, free tier | Supabase's free tier (itself open source, self-hostable) — no proprietary Firebase dependency |
| Hosting | The operator, free tier | Any Vercel/Netlify/Cloudflare Hobby-tier deployment |

## Architecture

```
keel/
├── src/
│   ├── App.jsx                  # Shell: routing + theme + layout
│   ├── pages/
│   │   ├── LandingPage.jsx
│   │   └── BuilderPage.jsx      # Chat + file explorer + preview, resizable panels
│   ├── components/
│   │   ├── ChatPanel.jsx
│   │   ├── PreviewPane.jsx
│   │   ├── FileExplorer.jsx
│   │   ├── SettingsModal.jsx    # BYOK key entry (client-side only)
│   │   └── ProviderRaceBadge.jsx
│   └── lib/
│       ├── providers/           # Groq / Gemini / OpenRouter adapters (BYOK)
│       ├── generation/
│       │   ├── schema.js        # Structured-output JSON schema for generated files
│       │   ├── engine.js        # Generate + parse (structured, with legacy-delimiter fallback)
│       │   ├── selfHeal.js      # Sandbox-verified iterative repair loop
│       │   └── ensemble.js      # Multi-provider race generation
│       ├── sandbox/
│       │   ├── e2bAdapter.js       # Sandbox provider interface + E2B implementation
│       │   ├── killSwitch.js       # Hard usage cap enforcement (sandbox hours)
│       │   └── deployKillSwitch.js # Hard usage cap enforcement (live deploys)
│       ├── byok/
│       │   └── keyStore.js      # Client-side-only key storage
│       └── supabase/
│           └── client.js
├── api/                          # Serverless functions (Vercel)
│   ├── _shared/
│   │   └── supabaseDefaults.js  # process.env-based fallback (server can't read import.meta.env)
│   ├── relay.js                 # Stateless BYOK relay — forwards a request to
│   │                             #   the chosen provider using a key sent in the
│   │                             #   request itself; never logged, never persisted
│   ├── sandbox/
│   │   ├── start.js
│   │   ├── update.js
│   │   └── usage.js             # Kill-switch check, backed by Supabase usage ledger
│   ├── backend/
│   │   └── provision.js         # Executes validated, namespaced backendSql against Postgres
│   └── deploy/
│       └── publish.js           # Live-deploys a generated app to its own Vercel project
└── supabase/
    ├── migrations/0001_init.sql # projects table, sandbox_usage ledger, RLS policies
    └── migrations/0002_deploy_usage.sql # deploy_usage ledger for the live-deploy kill-switch
```

### Why a relay instead of pure client-side calls

The simplest BYOK design would have the browser call each AI provider directly
with the user's key and no server in the loop at all. That doesn't actually
work uniformly: Google's Gemini API rejects direct browser requests at the CORS
preflight stage, so a pure-client design silently breaks for that provider.
Keel routes all inference through `api/relay.js`, a stateless serverless
function that takes the user's key *per request* (sent as a header, never
written to a database, a file, or a log line) and forwards it to the selected
provider. This keeps the "your server never has custody of anyone's key"
property while working identically across providers regardless of their CORS
policy.

### Backend auto-provisioning, and its actual scope

When generation detects `needsBackend`, the model is required to also emit
`backendSql` — Postgres DDL for the tables the app needs — following a strict
contract (`src/lib/generation/prompts.js`): every table name must be prefixed
`app_`, RLS must be enabled, and only `CREATE TABLE` / `CREATE INDEX` /
`ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` statements are allowed at all.
Before anything touches a real database, two things happen client-side:
`validateBackendSql()` re-checks that allowlist and rejects anything outside
it (no `DROP`/`DELETE`/`TRUNCATE`/`GRANT`, no reference to Keel's own
`projects`/`sandbox_usage`/`deploy_usage` tables), and `namespaceBackend()`
rewrites every `app_` prefix to a per-project `app_<random-slug>_` prefix —
because a single Keel instance shares one Postgres database across every
project anyone generates on it, and two people both building a "todos" table
can't be allowed to collide. `api/backend/provision.js` re-validates
server-side (never trust validation that happened somewhere else) and runs
the statements in a single transaction via a direct Postgres connection
(`SUPABASE_DB_URL` — this has to be a real Postgres connection, not the
service-role key, because PostgREST can't execute DDL).

Be clear-eyed about what this is and isn't: the RLS policies Keel generates
are **prototype-grade table isolation, not per-end-user security** — every
row in a generated app's tables is readable/writable by anyone using that
app, not scoped to individual accounts. Lovable's Supabase integration goes
further (it wires up `auth.uid()`-scoped policies against real user
accounts); Keel doesn't attempt that yet because doing it reliably across
arbitrary AI-generated apps, most of which have no auth UI at all, is a much
larger and currently unbuilt problem. Don't ship a generated app's backend
as-is for anything holding data one user shouldn't see from another.

### Live deploy, and its actual scope

`api/deploy/publish.js` gives a generated app a real, permanent URL by
creating a Vercel project under the *operator's* Vercel account
(`VERCEL_API_TOKEN`) and deploying to it via Vercel's REST API — the same
free Hobby tier used to host Keel itself. If the project needed a backend,
the generated app's Supabase URL/anon key are set as that new project's
environment variables before the build runs, so the deployed app's
`src/lib/supabaseClient.js` (also emitted by the model per the contract
above) can actually reach the shared database. `deployKillSwitch.js` caps
deploys per month (`KEEL_DEPLOY_MONTHLY_CAP`, default 200) for the same
reason the sandbox has an hours cap: a popular open-source instance
shouldn't be able to silently run its operator into paid usage.

### The generation engine, and why it isn't delimiter parsing

A frequent failure mode in tools like this is parsing AI output by scanning
streamed text for a marker like `---FILE:path---` and then patching whatever
came out truncated or malformed. It's fragile — a model that emits that
literal string in a code comment, or a stream cut mid-token, corrupts the
parse. Keel's default path uses each provider's structured-output / tool-call
mode with an explicit JSON schema (`src/lib/generation/schema.js`): the model
returns `{ files: [{ path, content }], summary }` as validated structured data,
not free text to be regex-matched. A legacy delimiter parser is kept only as a
fallback for models/providers where structured output isn't available.

## Getting started

```bash
npm install
cp .env.example .env   # fill in Supabase + E2B if you want persistence/sandbox preview
npm run dev
```

Open http://localhost:5173, open Settings, and paste in a Groq, Gemini, or
OpenRouter key to start generating. No key on the operator's side is required
for AI generation at all — only Supabase and E2B are operator-provided, and
both are optional for a purely local single-user instance.

## Status

Implemented: generation engine, self-heal loop, ensemble generation, BYOK
relay, sandbox adapter + kill-switch, Supabase schema, the builder UI, ZIP
export, and email/password auth with save/load projects (`AuthContext`,
`AuthModal`, `ProjectSidebar`, `src/lib/supabase/projects.js`). A live instance
ships with a real Supabase project's URL and anon key hardcoded as a safe
fallback default in `src/lib/supabase/client.js` (anon keys are public-by-design
and gated entirely by the RLS policies in `supabase/migrations/0001_init.sql`),
so auth and saved projects work out of the box on the hosted deployment with no
manual environment configuration required. Self-hosters can override with their
own `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

Also implemented: backend auto-provisioning (`api/backend/provision.js`,
`src/lib/generation/backendProvision.js`) that actually creates
namespaced, RLS-enabled tables from AI-generated DDL rather than just
flagging `needsBackend` in chat — with the explicit caveat in the
"Backend auto-provisioning" section above that its RLS is table-level
isolation, not per-end-user security. Also implemented: live deploy
(`api/deploy/publish.js`) that gives a generated app a real, permanent
Vercel URL under the operator's account, instead of a ZIP download being
the only output.

Every operator-side feature degrades gracefully when its secret isn't set:
BYOK generation always works regardless of what the operator has
configured; sandbox preview needs `E2B_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY`;
backend provisioning needs `SUPABASE_DB_URL`; live deploy needs
`VERCEL_API_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` (see "Manual setup steps"
below for all four).

Not yet built (tracked as open issues, contributions welcome under AGPL-3.0):
per-end-user auth scoping for generated apps' backends (see caveat above),
slash commands, one-click Netlify deploy as an alternative to Vercel, OAuth
sign-in providers, and image generation.

## Manual setup steps for the hosted deployment

Four secrets can't be provisioned automatically and must be set by whoever
operates a given deployment, in Vercel → Project → Settings → Environment
Variables, then redeployed. Every one of these degrades gracefully (a clean
501 with an explanatory message) when unset — nothing crashes, the relevant
feature just isn't available yet:

- **`E2B_API_KEY`** — sign up free at [e2b.dev](https://e2b.dev), copy an API
  key from the dashboard. Without this, `/api/sandbox/*` returns a graceful
  501 and generation still works, just without a live preview or self-heal.
- **`SUPABASE_SERVICE_ROLE_KEY`** — from the Supabase dashboard for this
  project (ref `xafpxbdarpaygfhqfvrh`): Project Settings → API → `service_role`
  key. Used server-side to enforce the sandbox-hours and live-deploy
  kill-switches; must never be exposed client-side or committed to the repo.
- **`SUPABASE_DB_URL`** — same dashboard, Project Settings → Database →
  Connection string (use the "Transaction pooler" string for serverless).
  Needed for backend auto-provisioning (`/api/backend/provision`) to run
  `CREATE TABLE` — the service-role key alone can't, since PostgREST doesn't
  execute DDL.
- **`VERCEL_API_TOKEN`** — from [vercel.com/account/tokens](https://vercel.com/account/tokens).
  Needed for the "Publish live" button (`/api/deploy/publish`) to create a
  new Vercel project and deployment on the operator's account for each
  generated app. `VERCEL_TEAM_ID` is optional, only needed if the token
  belongs to a team account rather than a personal account.

Also required — a one-time manual fix, not an env var: **Supabase Auth's
Site URL still defaults to `http://localhost:3000`**, which means every
signup confirmation email currently points at localhost instead of the live
deployment. Fix it once in the Supabase dashboard for this project: Authentication
→ URL Configuration → set **Site URL** to `https://keel-two-gamma.vercel.app`
and add `https://keel-two-gamma.vercel.app/**` to **Redirect URLs**. This
isn't something the Supabase MCP tooling used to provision this project can
set — it has to be done in the dashboard.

## License

AGPL-3.0-or-later. See `LICENSE`. If you deploy a modified version of Keel as a
network service, you must offer your users the corresponding modified source.
