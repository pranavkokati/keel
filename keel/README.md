# Keel

Keel is an open-source AI app generator: describe an app in plain English, get a
real project back with a live preview built entirely in your browser, chat-driven
edits, and one-click deploy. It's in the same category as tools like Bolt, v0,
Lovable, Dyad, OpenThorn, or single-prompt "autonomous builder" tools like Komand
Builder, built from scratch with a specific set of differences that matter:

1. **Bring your own key.** Every AI generation/edit call runs on a model key the
   *user* provides (Groq, Gemini, or OpenRouter). The operator running a Keel
   instance never pays for anyone else's inference — cost scales with each
   user's own key and rate limit, never the operator's bill.
2. **No cloud sandbox, anywhere.** Every generated project — Vite+React or
   plain HTML — is bundled and previewed entirely inside your browser tab via
   an in-browser esbuild-wasm bundler, and self-heal's build-error checking
   runs the same way. There is no server-side VM to provision, meter, or pay
   for, for *any* generation mode. See "In-browser bundling" below.
3. **An optional fully on-device generation tier.** Beyond BYOK (still paying
   a model provider directly instead of a markup), Keel can generate a
   project using a small code model that runs entirely in your browser via
   WebGPU — no API key at all, no cloud call of any kind. See "On-device
   inference" below for what this can and can't do today.
4. **Self-healing generation.** Generated code is checked against the
   in-browser build, real errors are captured, and the model is automatically
   re-prompted with the *actual* error until the project builds clean (capped
   at a few attempts) — not a single post-hoc "fix errors" pass over
   hoped-for bugs.
5. **Ensemble generation.** If you've configured more than one provider key,
   Keel can generate the same request against multiple models in parallel and
   keep whichever result actually builds cleanest, instead of committing to
   one model's first attempt.
6. **BYOK image generation.** `{{IMAGE:description}}` markers in generated
   code get replaced with real images after generation, using whichever of
   the user's own Gemini/OpenRouter keys is configured — no separate image
   API key, no operator cost, same BYOK model as text generation
   (`src/lib/generation/imageGen.js`, `api/image.js`).
7. **Local, zero-token design QA.** Every generation is checked, in the
   browser, for real WCAG contrast violations, type-scale drift,
   spacing-grid inconsistency, and heading/landmark structure — and
   contrast failures are auto-corrected with a real computed replacement
   color before you ever see them, all for $0 and zero LLM calls. See
   "Local design QA (Verdict)" below.
8. **Launch Kit — real, not templated.** An opt-in extra pass that adds
   install docs, a manual QA checklist, and launch copy — every one of them
   a genuine LLM call grounded in the project that was actually generated,
   never a fixed template filled in with a title. See "Launch Kit" below for
   exactly why this exists and what it's a direct response to.
9. **Runtime QA — does it actually work, not just does it compile.** After
   every generation, Keel clicks every safely-testable interactive element
   in the live preview and reports what actually threw an error, closing
   the largest real capability gap against frontier tools (Replit Agent 3's
   headline feature). See "Runtime QA" below for exact scope and the
   deliberate safety limit on form submission.
10. **Verifiable provenance, not a trust-me preview.** Every ZIP download
    can include a signed `KEEL_PROVENANCE.json` recording exactly what
    generated the project and what it was checked against — independently
    verifiable offline with a zero-dependency script, no Keel server or UI
    required to trust. See "Verifiable provenance" below for precisely what
    this proves and, just as importantly, what it doesn't.

**Honest positioning, not marketing copy:** this category is more crowded than
it looks, and it splits into two very different kinds of competitor. Dyad
(local-first desktop app, MIT, Ollama support for fully local models) and
OpenThorn (browser-based BYOK, in-browser esbuild-wasm bundler, no sandbox)
each already do a large piece of what Keel does — independently, and in
Dyad's case with a head start on desktop packaging that Keel doesn't try to
compete with. Both are genuine, real-LLM tools; the comparison there is about
feature surface and polish, not honesty. The other kind of competitor
*looks* more ambitious on paper and is worth naming specifically: Komand
Builder (a "single prompt → full package: frontend, backend, database,
billing, tests, marketing, deployment, install docs" pitch) turns out, on
reading its own source, to call **zero LLMs anywhere in its generation
path** — every "build" emits the identical hardcoded React component (only a
title string and a three-word category tag vary with the prompt), the
"tests" step asserts two fixed substrings exist in a schema file regardless
of what was asked for, "marketing copy" is one template string with the app
name substituted in, and "deployment" mostly just constructs a plausible-
looking URL string rather than calling a real deploy API. It's a
well-produced demo of what a multi-agent builder's *UI* would look like, not
one that's actually building anything different per request. Keel's actual
bet is combining, in one project, a genuinely working set of things that
each really do use real models and real verification: BYOK-or-free-tier
cloud inference, a zero-infrastructure in-browser build/preview pipeline, a
verified-working local deterministic design-QA pass, and — as of Launch
Kit — genuinely grounded launch documentation instead of a template.
Commercial tools (Bolt, Lovable, v0) remain meaningfully more polished on raw
feature surface against Dyad/OpenThorn-style honest competitors — native
GitHub sync, custom domains, visual editing, backend wizards with far more
engineering time behind them. Replit Agent 3 specifically is ahead on the
one capability that matters most for actually trusting a generated app:
it drives a real browser against its own output and fixes what breaks when
you interact with it, not just what fails to compile. Keel's answer to that
specific gap is Runtime QA (below) — DOM/event-driven click-testing of the
live preview, not vision-driven browser automation, so it's a real but
narrower version of the same idea, honestly scoped rather than claimed at
parity. If you want the single most polished, most autonomous app-builder
available today and don't care about self-hosting, BYOK, or on-device
generation, the commercial tools currently win that comparison outright.
See "Status" below for what's built, what's verified, and what's still
explicitly beta.

Keel is licensed AGPL-3.0-or-later: if you run a modified version of Keel as a
network service, you must make the source of your modified version available
to your users (see `LICENSE`).

## Why this exists

This project starts from a simple observation: most "prompt to app" tools ask
the operator to eat two costs — AI inference and a paid code sandbox — which is
exactly why most of them are commercial products with metered pricing, not
things you can self-host for free. Keel is built so an individual can run a
fully-functional instance at genuinely $0/month, including preview/build
infrastructure:

| Cost center | Who pays | How |
|---|---|---|
| AI inference (generation, edits, self-heal retries, Launch Kit) | The end user | BYOK — their own Groq/Gemini/OpenRouter key, entered client-side, never stored server-side |
| On-device inference (optional) | Nobody | Runs entirely in the user's own browser via WebGPU — no server, no key, no cloud call at all |
| Build + preview (both generation modes) | Nobody | esbuild-wasm bundling and Instant HTML rendering both happen in the user's own browser tab — no server-side sandbox exists to pay for |
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
│   │   ├── ChatPanel.jsx        # Mode toggles: Instant HTML, ensemble, on-device model
│   │   ├── PreviewPane.jsx
│   │   ├── FileExplorer.jsx
│   │   ├── SettingsModal.jsx    # BYOK key entry (client-side only)
│   │   └── ProviderRaceBadge.jsx
│   └── lib/
│       ├── providers/           # Groq / Gemini / OpenRouter adapters (BYOK, cloud)
│       ├── localInference/
│       │   ├── webllm.js        # WebGPU on-device generation via WebLLM (MLCEngine)
│       │   └── prompts.js       # Delimited-format prompts tuned for small local models
│       ├── bundler/
│       │   └── clientBundle.js  # In-browser esbuild-wasm bundler — replaces the cloud sandbox entirely
│       ├── generation/
│       │   ├── schema.js        # Structured-output JSON schema for generated files
│       │   ├── prompts.js       # System prompts (React mode + Instant HTML mode)
│       │   ├── engine.js        # Generate + parse (structured, with legacy-delimiter fallback)
│       │   ├── selfHeal.js      # In-browser-build-verified iterative repair loop
│       │   ├── ensemble.js      # Multi-provider race generation
│       │   ├── launchKit.js     # Opt-in install-docs/QA-checklist/marketing pass, grounded in real generated code
│       │   ├── backendProvision.js # SQL allowlist validator + per-project table namespacing
│       │   ├── htmlPreview.js   # Instant HTML mode: inlines index.html+CSS+JS for iframe srcDoc
│       │   └── imageGen.js      # Resolves {{IMAGE:prompt}} markers via BYOK Gemini/OpenRouter
│       ├── verdict/
│       │   ├── engine.js        # Ported, dependency-free design-QA check engine (contrast/type-scale/spacing/hierarchy)
│       │   ├── runtimeQa.js     # Click-tests the live preview's real interactive elements, catches runtime errors
│       │   ├── inject.js        # Ephemeral bootstrap injection for scoring + click-testing a live preview
│       │   └── autofix.js       # Turns computed WCAG fixes into a persisted CSS override, $0 LLM cost
│       ├── provenance/
│       │   └── manifest.js      # Signed KEEL_PROVENANCE.json — see scripts/verify-provenance.mjs
│       ├── sandbox/
│       │   └── deployKillSwitch.js # Hard usage cap enforcement (live deploys only — no preview sandbox anymore)
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
│   ├── image.js                 # Same BYOK-relay pattern, for {{IMAGE:...}} resolution
│   ├── backend/
│   │   └── provision.js         # Executes validated, namespaced backendSql against Postgres
│   └── deploy/
│       └── publish.js           # Live-deploys a generated app to its own Vercel project
├── scripts/
│   └── verify-provenance.mjs    # Zero-dependency, standalone verifier for KEEL_PROVENANCE.json
└── supabase/
    ├── migrations/0001_init.sql # projects table, sandbox_usage ledger, RLS policies
    └── migrations/0002_deploy_usage.sql # deploy_usage ledger for the live-deploy kill-switch
```

Note: `supabase/migrations/0001_init.sql`'s `sandbox_usage` ledger table is
now unused dead schema (there's no sandbox left to meter) — left in place
rather than dropped, since altering a live production schema isn't something
to do casually; it's simply never read from or written to anymore.
`src/lib/sandbox/e2bAdapter.js`, `src/lib/sandbox/killSwitch.js`, and
`api/sandbox/{start,update,usage}.js` are similarly dead (the E2B cloud
sandbox they wrapped is gone) and are marked as deprecated stubs in their own
file headers — nothing in the codebase imports them, and they're kept only
until someone with shell access to the repo deletes them outright.

### Why a relay instead of pure client-side calls

The simplest BYOK design would have the browser call each AI provider directly
with the user's key and no server in the loop at all. That doesn't actually
work uniformly: Google's Gemini API rejects direct browser requests at the CORS
preflight stage, so a pure-client design silently breaks for that provider.
Keel routes all cloud inference through `api/relay.js`, a stateless serverless
function that takes the user's key *per request* (sent as a header, never
written to a database, a file, or a log line) and forwards it to the selected
provider. This keeps the "your server never has custody of anyone's key"
property while working identically across providers regardless of their CORS
policy. On-device generation (see below) never touches this relay at all — it
never leaves the browser.

### In-browser bundling (no cloud sandbox)

Keel previously ran every Vite+React project inside a real E2B cloud VM (npm
install + a live dev server) purely to render a preview and check whether the
code built. That's gone. `src/lib/bundler/clientBundle.js` bundles the exact
same project structure using `esbuild-wasm` — the same bundler, compiled to
WebAssembly, running inside the visitor's own browser tab. Bare imports like
`react` and `react-router-dom` are resolved to `esm.sh` CDN builds and marked
external (esbuild has no npm registry access from inside a browser tab, so
this is the standard technique any in-browser bundler uses); everything else
is resolved against an in-memory virtual file system built from the project's
own `files` array. Tailwind CSS is handled by loading Tailwind's own official
browser-only "Play CDN" script into the preview shell, which JIT-compiles
utility classes from the live DOM — a deliberate tradeoff (documented in the
source) rather than attempting to compile Tailwind's real engine to WASM,
which is its own large, separate undertaking not attempted here.

Self-heal's build-error checking (`selfHeal.js`) now calls this bundler
directly instead of pushing to a network sandbox: `esbuild.build()` throws
with a structured `.errors` array on failure, which maps onto exactly the
same `{ok, errors}` shape the old E2B-based check returned, so the healing
loop itself is unchanged — only *where* the check runs changed, from a
metered cloud VM to a free, zero-network-round-trip in-browser call.

**Verification note:** this bundler's code is written against esbuild-wasm's
documented browser API (`initialize()` with a `wasmURL`, `build()` with a
virtual-fs plugin via `onResolve`/`onLoad`) and was confirmed to actually
bundle and produce output during a real `npx vite build` of this project —
that build succeeded and the shipped bundle was checked to genuinely
reference the CDN wasm URL and the expected APIs, not just compile without
errors. What's unverified: the full round trip of bundling an actual
AI-generated multi-file React+Tailwind project inside a real browser tab, end
to end, including the Tailwind Play CDN rendering correctly against
arbitrary generated class names. Confidence on the bundler's structure and
API usage: high. Confidence on it handling every shape of AI-generated project
without edge cases on the first try: moderate.

### On-device inference (WebLLM)

`src/lib/localInference/webllm.js` adds a generation tier that needs no API
key and makes no cloud call at all: a small quantized code model (default
`Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`, ~1.5GB one-time download, cached by
the browser after that) runs directly in the browser tab via WebGPU, using
MLC's WebLLM engine (`@mlc-ai/web-llm`, OpenAI-compatible chat-completions
API). Toggle it on in the chat panel; it requires a WebGPU-capable browser
(recent Chrome/Edge) and is automatically disabled with an explanation if
`navigator.gpu` isn't available.

**Deliberate scope limit, stated plainly:** on-device generation only ever
targets Instant HTML mode (plain HTML/CSS/JS), never Vite+React. Small
quantized models are meaningfully less reliable than frontier cloud models at
producing correct, complete multi-file React projects — constraining them to
simple static markup plays to their actual capability level instead of past
it, and it means local generation never needs the esbuild bundler at all,
which is one fewer unverified system stacked on top of another for the path
that's already the least production-tested part of this codebase. Output
parsing reuses the same `---FILE:path---` delimited-format fallback parser
Keel already had for non-structured-output providers, since small models
follow that format far more reliably than strict JSON tool-calling.

**What was deliberately not built:** the original design discussion for this
feature also proposed *speculative decoding* to make on-device inference fast
enough to feel responsive. That is not implemented. Speculative decoding is a
substantial piece of inference engineering in its own right (a draft model
plus a verify step, tightly coupled to the serving engine's internals), and
building a version of it I couldn't test on real hardware and would have no
way to verify actually improves anything would be exactly the kind of
unverifiable claim this README is trying not to make. It's left as explicitly
open, not quietly implied to exist.

**Verification note, stated at the confidence level it deserves:** the model
IDs above are real, published entries in WebLLM's prebuilt model list, each
cross-checked against its own Hugging Face model card at the time this was
written, and the API usage (`CreateMLCEngine`, `engine.chat.completions.create`)
matches WebLLM's current documented interface. What is genuinely unverified:
actually running this in a browser with a real GPU. This project was built in
a sandboxed environment with neither a browser nor a GPU available, so
whether the model actually downloads cleanly, whether WebGPU initializes
without issue across different GPUs/drivers, and whether a 1.5B-parameter
model's output quality is actually usable for real generation requests — none
of that has been exercised. Treat this tier as beta until it's been run on
real hardware. This is the single lowest-confidence claim in this README, and
it's flagged here specifically so it doesn't get overstated later.

### Instant HTML mode

For content that doesn't need a framework — a landing page, a portfolio, a
form — Keel can generate plain HTML/CSS/JS and preview it directly via an
inlined `<iframe srcDoc>`. This was originally built as the fallback for
instances without a configured cloud sandbox; now that *no* mode depends on a
cloud sandbox, its value is different but still real: no framework overhead,
no bundler step at all (not even the in-browser one), and it's the only mode
the on-device model tier targets (see above). The tradeoff is unchanged: no
Tailwind, no framework, no build-time error checking — the right choice for a
static or lightly-interactive page, not a stand-in for the React path.

### Local design QA (Verdict)

Keel vendors a check engine adapted from [verdict](https://github.com/pranavkokati/verdict),
a separate MIT-licensed project (same author) for design QA on AI-generated
UIs. verdict's own CLI/MCP server renders pages with Playwright and a real
headless Chromium — that half genuinely can't run inside a browser tab, since
launching a browser process needs a real OS. But verdict's four check
modules (WCAG 2.1 contrast, type-scale consistency, spacing-grid consistency,
heading/landmark hierarchy) never call Playwright at all: they're plain
functions over `document` / `getComputedStyle` / `getBoundingClientRect`
data, which is exactly what verdict's own browser extension already proves
by running the identical logic live in a tab. `src/lib/verdict/engine.js` is
that same proven, dependency-free engine, adapted to run inside whichever
preview is already live — the in-browser-bundled React preview or the
Instant HTML mode `srcDoc` iframe — via a small injected bootstrap script
(`src/lib/verdict/inject.js`) that reports a score back to Keel's parent
window over `postMessage`. No Playwright, no server compute, no LLM call.

Now that the React preview rebuilds reactively on every file change (see "In-
browser bundling" above), re-scoring after an auto-fix is automatic — the
bundling effect reruns, Verdict's bootstrap gets appended fresh, and a new
score comes back — with no separate "probe push to a live sandbox" step the
old E2B-based version needed.

What Keel does with the result matters more than the score itself. Every
contrast failure verdict finds comes with a real, computed replacement hex
color (`suggestAccessibleColor` — walks the HSL lightness axis until the
WCAG ratio is met) and a real CSS selector for the failing element. Rather
than asking a model to guess which Tailwind class or inline style produced
the bad color, `src/lib/verdict/autofix.js` writes a small CSS override
block (`${selector} { color: ${hex} !important; }`) straight from that data
— deterministic, mode-agnostic, and free. Only issues that genuinely need
judgment — a missing `<h1>`, a skipped heading level, no `<main>` landmark —
get surfaced to the user as a chat message with an opt-in "ask AI to fix"
button; nothing escalates to a cloud call silently.

This directly replaces what ensemble ("race") generation used to be the
main defense against — a single provider's sloppy first draft — for the
specific case of objective design defects, at $0 instead of a second full
generation call. Ensemble itself hasn't been removed: it still catches
something Verdict structurally cannot (which provider's code actually
*builds*, and subjective quality differences between providers), and it's
already free under BYOK, so cutting a working, zero-cost, purely additive
feature to simplify the codebase would trade away a real capability for a
smaller diff.

**Verification note:** the ported engine's constants and scoring formula
were checked line-for-line against verdict's own source rather than
reimplemented from memory, and the color-math/contrast/background-resolution
logic was exercised end-to-end against a hand-built synthetic DOM snapshot
with a known low-contrast/high-contrast pair. The injection/autofix modules
are covered by direct unit tests. Confidence on the check math and the
deterministic autofix logic: high; confidence on the live in-browser-bundler
+ postMessage wiring holding up on the first try in production: moderate.

### Runtime QA

`src/lib/verdict/runtimeQa.js` is Keel's answer to the single biggest,
verified gap against frontier tools. Replit Agent 3's headline feature is
that it drives a real browser against its own generated app — clicking
buttons, filling forms, watching what breaks — because a project that
builds cleanly can still have a button that does nothing or a handler that
throws the moment it's clicked, and neither a build check (`selfHeal.js`)
nor a static DOM check (Verdict) will ever catch that. Runtime QA closes
this without any new infrastructure: it runs inside the exact same live
preview iframe Verdict already instruments, dispatches real click events at
every safely-testable interactive element (buttons, in-app links, tabs,
menu items — up to 25 per pass), and captures anything that throws —
uncaught exceptions, unhandled promise rejections, `console.error` calls —
within a short settle window after each click. The result comes back over
the same `postMessage` channel Verdict uses, as `keel-runtime-qa`, and
surfaces in chat with an opt-in "ask AI to fix" action, the same pattern
Verdict's non-auto-fixable issues already use.

**Deliberate, explicitly stated safety limit:** this never submits a
`<form>`. A Keel-generated app can have a real `onSubmit` handler wired to a
live Supabase table (see "Backend auto-provisioning" above) — an automated
QA pass that actually fired those would write real junk rows into a real
database on every single generation, which is an unacceptable side effect
for a feature whose entire point is trust. Forms are checked structurally
only (does a submit control exist, is it disabled, how many required
fields) and never triggered. Real external links (different origin,
`target=_blank`, or anything that isn't a same-page/relative href) are
skipped the same way, for the same reason: this harness should never cause
a real network side effect anywhere, full stop.

**Verification note:** the click-dispatch and error-capture mechanism
(`MouseEvent` dispatch, temporary `window.onerror`/`onunhandledrejection`/
`console.error` interception with restoration afterward) uses standard,
long-stable DOM APIs and was checked against the same synthetic-DOM test
harness used to verify Verdict's engine. What's unverified: real-world
coverage against the full diversity of AI-generated interaction patterns
(custom event delegation, non-standard focus traps, etc.) — this catches a
real and previously-uncaught class of bug, not every possible one.
Confidence on the mechanism: high. Confidence on catching every kind of
runtime bug an AI-generated app could have: moderate, by design (it is
DOM-and-event-driven, not vision-driven the way Replit's is — it can't
"see" that a button visually looks wrong, only that clicking it did or
didn't throw).

### Verifiable provenance

Every other tool in this category — Bolt, Lovable, v0, Replit, bolt.diy,
OpenThorn — shows a preview and asks you to trust it. `src/lib/provenance/manifest.js`
takes the facts Keel already computes during generation (which
provider/model, whether the in-browser build actually succeeded, Verdict's
score, whether Runtime QA found anything broken) and turns them into a
signed, portable `KEEL_PROVENANCE.json`, included in every ZIP download.
It's built from a SHA-256 hash over every file's exact path and content, an
ECDSA P-256 signature over the recorded facts, and the public key needed to
check that signature — all generated with the browser's native Web Crypto
API, no server, no third-party notarization service, no cost.
`scripts/verify-provenance.mjs` is a zero-dependency Node script anyone can
run against an extracted download to get a mechanical PASS/FAIL, without
trusting Keel's UI to tell the truth about its own output.

**Read this before treating a PASS as more than it is, because overclaiming
cryptography is worse than not having it:** a PASS proves the downloaded
files are byte-identical to what was recorded, and that the manifest
hasn't been silently altered since it was signed. It does **not** prove the
named provider/model produced this code as a third-party attestation — the
signing key is generated and held entirely client-side (this browser's
localStorage), so it authenticates "the browser session that ran this
generation," not "Groq" or "Google." What verification actually rules out
is silent tampering by someone who doesn't hold that local key — e.g. a
redistributed ZIP whose contents were quietly modified after the fact. This
is tamper-evidence and self-consistency, not a notarized identity claim,
and the code comments in both `manifest.js` and `verify-provenance.mjs`
repeat this same caveat deliberately, so it can't get overstated later by
accident.

**Verification note:** the hashing/signing mechanism uses standard Web
Crypto primitives (SHA-256, ECDSA P-256) on both the browser and Node side,
and the Node verifier deliberately duplicates rather than imports the
canonicalization logic so it never has to trust Keel's own runtime code
path to check Keel's own claims. Confidence on the cryptographic mechanism
being sound: high (standard primitives, standard APIs, no custom crypto).
Confidence on the browser/Node canonicalization staying byte-identical
across every possible file content (unusual line endings, unicode edge
cases) on the first try in production: moderate — untested against
adversarial inputs, only against normal generated-project text files.

### Launch Kit

`src/lib/generation/launchKit.js` is an opt-in checkbox in the builder header
("Launch kit"). When enabled, after a generation completes it runs one more
BYOK LLM call — using the same relay and the same provider key already
configured, at no extra operator cost — fed the *actual* files that were just
generated, and asks for exactly three new files: `LAUNCH.md` (install/run
instructions derived from the real `package.json` scripts and dependencies
that exist, or a note that there's no build step at all if it's an Instant
HTML project), `QA_CHECKLIST.md` (6-12 manual verification items that each
reference a real heading, button label, or section that actually exists in
the generated page — not generic filler), and `MARKETING.md` (a short launch
blurb grounded in what the app actually does, explicitly told not to invent
metrics like MRR or user counts it has no basis for).

This exists as a direct, named response to a specific pattern seen in
"single-prompt autonomous builder" tools that advertise a full package —
frontend, backend, tests, marketing, deployment — generated from one prompt.
Reading one such tool's own source (Komand Builder) shows that pattern
implemented with **zero LLM calls anywhere**: `server/generator.js` writes
the identical hardcoded React component on every single build (only a title
string and a coarse category tag vary with the prompt text), its "test" step
in `server/orchestrator.js` is a single assertion that two fixed substrings
appear in a schema file, its "marketing copy" is one template literal with
the app name interpolated in, and its "deployment" step mostly constructs a
plausible-looking URL string rather than calling a real hosting API unless
real provider tokens happen to be configured. It's a convincingly staged
6-agent UI wrapped around code that doesn't actually read the prompt beyond
picking a title. Launch Kit is Keel's answer to that specific gap: the same
"give me the whole package" instinct, but every file it emits is a real
model call grounded in the code that was actually generated, and it says so
explicitly in its own UI copy ("real LLM call grounded in your actual code,
never a template") rather than implying more autonomy than exists.

**Explicit scope limit:** Launch Kit does not wire up an automated test
runner. Keel's generated Vite+React projects don't ship with a test
framework in `package.json`, so emitting a "unit test file" nothing would
ever execute would be a worse kind of dishonesty than not having automated
tests at all — a decorative file pretending to be CI. `QA_CHECKLIST.md` is
the deliberately-chosen, honest alternative: a checklist a human (or an
agent with browser tools) can actually act on, for a class of generated
project that has no test runner or CI pipeline of its own. If real automated
testing is wanted, ask Keel in chat to add a real test runner (e.g. Vitest)
to the project first.

**Verification note:** the prompt and file-filtering logic are straightforward
and match the same structured-output contract every other generation call in
this codebase already uses (`schema.js`'s `emit_project` tool), so this reuses
already-verified plumbing rather than adding a new one. What's unverified is
output quality on a live model call, same caveat as every other cloud
generation path in this README. Confidence on the mechanism: high. Confidence
on the QA checklist items always being genuinely specific rather than
occasionally generic: moderate — it depends on model compliance with the
prompt's instruction, same as any other structured-output call.

### BYOK image generation

`{{IMAGE:a short description}}` is a marker convention both generation
prompts are instructed to use instead of inventing a fake image URL or
reaching for a third-party placeholder service. After generation,
`imageGen.js` scans every file for these markers, generates one real image
per distinct prompt (deduplicated), and substitutes the result everywhere
it appears, via `api/image.js` using the same stateless per-request BYOK
relay pattern as `api/relay.js`. If no image-capable key is configured, or a
generation call fails, the marker resolves to a small locally-generated
neutral placeholder SVG.

**Verification note:** the parsing/deduplication logic is pure and unit
tested. The actual network calls to Gemini's/OpenRouter's image endpoints are
built against each provider's documented request/response shape but have
**not** been exercised end-to-end with a live key. Confidence on the
surrounding logic: high. Confidence on the exact wire format holding up on
the first try: moderate.

### The generation engine, and why it isn't delimiter parsing

A frequent failure mode in tools like this is parsing AI output by scanning
streamed text for a marker like `---FILE:path---` and then patching whatever
came out truncated or malformed. Keel's cloud generation path uses each
provider's structured-output / tool-call mode with an explicit JSON schema
(`src/lib/generation/schema.js`) instead. The delimited-format parser still
exists in the codebase (`legacyParser.js`) — not as the primary path, but
because it turned out to be exactly the right format for the on-device model
tier, where a small local model's reliability at strict JSON tool-calling is
much lower than a frontier cloud model's.

## Getting started

```bash
npm install
cp .env.example .env   # fill in Supabase if you want persistence; no sandbox config needed anymore
npm run dev
```

Open http://localhost:5173, open Settings, and paste in a Groq, Gemini, or
OpenRouter key to start generating — or skip that entirely and check
"On-device model" in the chat panel to generate with no key at all (requires
a WebGPU-capable browser). No key on the operator's side is required for AI
generation at all, and there's no sandbox to configure for either generation
mode; only Supabase is operator-provided, and it's optional for a purely
local single-user instance.

## Status

Implemented: generation engine, self-heal loop (now checked against an
in-browser esbuild-wasm bundle instead of a cloud sandbox), ensemble
generation, BYOK relay, Supabase schema, the builder UI, ZIP export, and
email/password auth with save/load projects. A live instance ships with a
real Supabase project's URL and anon key hardcoded as a safe fallback
default in `src/lib/supabase/client.js`, so auth and saved projects work out
of the box on the hosted deployment with no manual environment configuration
required. Self-hosters can override with their own `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY`.

Also implemented: backend auto-provisioning (`api/backend/provision.js`,
`src/lib/generation/backendProvision.js`) that actually creates
namespaced, RLS-enabled tables from AI-generated DDL — with the explicit
caveat that its RLS is table-level isolation, not per-end-user security.
Also implemented: live deploy (`api/deploy/publish.js`) that gives a
generated app a real, permanent Vercel URL under the operator's account.

Also implemented: Instant HTML mode, BYOK image generation, prompt presets
and context-file attachments, a slash-command layer in `ChatPanel.jsx`
(`/download`, `/publish`, `/html`, `/react`, `/help`), local zero-token
design QA adapted from the verdict project including automatic WCAG
contrast correction, an in-browser esbuild-wasm bundler that fully replaces
the former E2B cloud sandbox for both preview and self-heal, an optional
fully on-device generation tier via WebLLM/WebGPU (Instant HTML mode only —
see "On-device inference" above for its real scope and its beta status),
Launch Kit — a real, grounded install-docs/QA-checklist/marketing pass (see
"Launch Kit" above), Runtime QA — click-testing the live preview's real
interactive elements and surfacing what actually throws (see "Runtime QA"
above), and Verifiable provenance — a signed, independently-checkable
`KEEL_PROVENANCE.json` in every ZIP download plus a standalone verifier
script (see "Verifiable provenance" above for exactly what it does and
doesn't prove).

Every operator-side feature degrades gracefully when its secret isn't set:
BYOK generation, both generation modes, on-device generation, image
generation, Launch Kit, Runtime QA, provenance manifests, presets, context
attachments, and slash commands all always work regardless of what the
operator has configured; backend provisioning needs `SUPABASE_DB_URL`; live
deploy needs `VERCEL_API_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` (see "Manual
setup steps" below).

Not yet built (tracked as open issues, contributions welcome under AGPL-3.0):
speculative decoding for the on-device tier (see the explicit non-claim
above), a real automated test runner wired into generated projects (Launch
Kit deliberately emits a manual checklist instead — see its scope-limit
note), vision-driven runtime QA (the current pass is DOM/event-driven, not
screenshot-driven, so it can't catch something that renders wrong but
doesn't throw), per-end-user auth scoping for generated apps' backends,
one-click Netlify deploy as an alternative to Vercel, OAuth sign-in
providers, token-level streaming of generated code as it's produced, and a
Monaco-based code editor in place of the current read-only Code tab. Also
not built: any real-hardware verification of the on-device inference tier —
it's shipped as code that's structurally correct against current documented
APIs, not as a tier that's been confirmed to work end-to-end.

## Manual setup steps for the hosted deployment

Three secrets can't be provisioned automatically and must be set by whoever
operates a given deployment, in Vercel → Project → Settings → Environment
Variables, then redeployed. Every one of these degrades gracefully (a clean
501 with an explanatory message) when unset — nothing crashes, the relevant
feature just isn't available yet:

- **`SUPABASE_SERVICE_ROLE_KEY`** — from the Supabase dashboard for this
  project (ref `xafpxbdarpaygfhqfvrh`): Project Settings → API → `service_role`
  key. Used server-side to enforce the live-deploy kill-switch; must never be
  exposed client-side or committed to the repo.
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
and add `https://keel-two-gamma.vercel.app/**` to **Redirect URLs**.

## License

AGPL-3.0-or-later. See `LICENSE`. If you deploy a modified version of Keel as a
network service, you must offer your users the corresponding modified source.
