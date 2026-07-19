import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Group, Separator } from 'react-resizable-panels';
import ChatPanel from '../components/ChatPanel.jsx';
import FileExplorer from '../components/FileExplorer.jsx';
import PreviewPane from '../components/PreviewPane.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import { generateProject, editProject, KeelKeyMissingError } from '../lib/generation/engine.js';
import { generateEnsemble } from '../lib/generation/ensemble.js';
import { selfHeal, pushAndCheck } from '../lib/generation/selfHeal.js';
import { configuredProviders } from '../lib/byok/keyStore.js';
import { downloadProjectZip } from '../lib/downloadZip.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AuthModal from '../components/AuthModal.jsx';
import ProjectSidebar from '../components/ProjectSidebar.jsx';
import { saveProject, loadProject } from '../lib/supabase/projects.js';
import { isPersistenceConfigured } from '../lib/supabase/client.js';
import { validateBackendSql, namespaceBackend, generateProjectSlug } from '../lib/generation/backendProvision.js';
import { buildHtmlPreviewDocument, isHtmlModeProject } from '../lib/generation/htmlPreview.js';
import { hasImageMarkers, resolveImageMarkers } from '../lib/generation/imageGen.js';
import { injectVerdictBootstrap, appendVerdictScript } from '../lib/verdict/inject.js';
import { buildContrastOverrideCss, applyVerdictOverrides } from '../lib/verdict/autofix.js';
import { formatFixListForAgent } from '../lib/verdict/engine.js';
import { formatRuntimeQaForAgent } from '../lib/verdict/runtimeQa.js';
import { generateProjectLocally, editProjectLocally, isWebGpuAvailable, DEFAULT_LOCAL_MODEL } from '../lib/localInference/webllm.js';
import { generateLaunchKit } from '../lib/generation/launchKit.js';

function filesSignature(files) {
  return files.map((f) => `${f.path}:${f.content.length}`).join('|');
}

export default function BuilderPage({ theme, onToggleTheme }) {
  const { user, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectsRefreshKey, setProjectsRefreshKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [healStatus, setHealStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ensembleEnabled, setEnsembleEnabled] = useState(false);
  const [error, setError] = useState(null);
  const [pendingBackendSql, setPendingBackendSql] = useState(null);
  const [backendSlug, setBackendSlug] = useState(null);
  const [hasProvisionedBackend, setHasProvisionedBackend] = useState(false);
  const [publishStatus, setPublishStatus] = useState(null);
  const [mode, setMode] = useState('react');
  const [verdictResult, setVerdictResult] = useState(null);
  const [verdictTick, setVerdictTick] = useState(0);
  const [runtimeQaResult, setRuntimeQaResult] = useState(null);
  const runtimeQaShownForRef = useRef(null);
  const [useLocalModel, setUseLocalModel] = useState(false);
  const [localModelProgress, setLocalModelProgress] = useState(null);
  const [generationSource, setGenerationSource] = useState(null);
  const [bundling, setBundling] = useState(false);
  const [bundleErrors, setBundleErrors] = useState([]);
  const [reactPreviewHtml, setReactPreviewHtml] = useState(null);
  const [launchKitEnabled, setLaunchKitEnabled] = useState(false);
  const [launchKitStatus, setLaunchKitStatus] = useState(null);
  const [lastGenerationMeta, setLastGenerationMeta] = useState(null);

  const autoFixSignatureRef = useRef(null);
  const chatFixListShownForRef = useRef(null);
  const [webGpuAvailable] = useState(() => isWebGpuAvailable());

  const providers = configuredProviders();
  // Ensemble races cloud providers against each other and judges the
  // result with a real build check — meaningful for Vite+React mode (the
  // in-browser bundler can actually check it) and meaningless for both
  // Instant HTML mode (no build step at all) and the local on-device model
  // (there's only ever one model to race against itself).
  const ensembleAvailable = providers.length >= 2 && mode !== 'html' && !useLocalModel;
  const selectedFile = useMemo(() => files.find((f) => f.path === selectedPath), [files, selectedPath]);

  const htmlPreviewDoc = useMemo(
    () => (mode === 'html' ? buildHtmlPreviewDocument(injectVerdictBootstrap(files)) : null),
    [mode, files]
  );

  // Vite+React mode has no server sandbox to preview against anymore —
  // this effect bundles the current files entirely in-browser (esbuild-wasm,
  // see src/lib/bundler/clientBundle.js) every time they change, and Verdict's
  // check-engine script gets appended fresh to whatever HTML comes out.
  // Because this reruns on every `files` change, it also naturally re-scores
  // after the auto-fix effect below rewrites `files` — no separate "probe
  // push" step is needed the way the old E2B-sandbox version required.
  useEffect(() => {
    if (mode !== 'react' || files.length === 0) {
      setReactPreviewHtml(null);
      setBundleErrors([]);
      return undefined;
    }
    let cancelled = false;
    setBundling(true);
    pushAndCheck(files)
      .then((result) => {
        if (cancelled) return;
        setBundling(false);
        if (result.ok) {
          setBundleErrors([]);
          setReactPreviewHtml(appendVerdictScript(result.previewHtml));
        } else {
          setBundleErrors(result.errors);
          setReactPreviewHtml(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setBundling(false);
        setBundleErrors([`In-browser bundler failed to run: ${err.message}`]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, files]);

  const previewDoc = mode === 'html' ? htmlPreviewDoc : reactPreviewHtml;

  // Listens for the `keel-verdict` postMessage the injected check engine
  // sends once it finishes scoring a live preview (the bundled React
  // preview or the Instant HTML mode srcDoc iframe) — see
  // src/lib/verdict/inject.js. No origin check: the srcDoc iframe has an
  // opaque origin, so we authenticate the message by its own `source` tag
  // instead, same as any other same-tab postMessage channel with a single,
  // Keel-controlled sender.
  useEffect(() => {
    function onMessage(event) {
      const data = event.data;
      if (!data) return;
      if (data.source === 'keel-verdict' && data.result) {
        setVerdictResult(data.result);
        setVerdictTick((t) => t + 1);
      } else if (data.source === 'keel-runtime-qa' && data.result) {
        setRuntimeQaResult(data.result);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Runtime QA — did any interactive element actually throw when clicked?
  // (see src/lib/verdict/runtimeQa.js). Surfaced separately from Verdict's
  // auto-fix loop above because a thrown click handler isn't something a
  // deterministic script can safely patch (unlike a contrast color) — it
  // needs real code judgment, so this always routes through an opt-in
  // "ask AI to fix" action rather than auto-applying anything.
  useEffect(() => {
    if (!runtimeQaResult || runtimeQaResult.brokenCount === 0 || files.length === 0) return;
    const sig = filesSignature(files);
    if (runtimeQaShownForRef.current === sig) return;
    runtimeQaShownForRef.current = sig;
    const reportText = formatRuntimeQaForAgent(runtimeQaResult);
    setMessages((m) => [
      ...m,
      {
        role: 'assistant',
        content: `Runtime QA: ${runtimeQaResult.brokenCount} of ${runtimeQaResult.testedCount} tested interactions threw an error when actually clicked (build succeeded, but the app breaks at runtime).`,
        action: {
          label: 'Ask AI to fix broken interactions',
          onClick: () => handleSend(`Fix these runtime errors, found by actually clicking through the live app:\n\n${reportText}`),
        },
      },
    ]);
  }, [runtimeQaResult]);

  // Local, zero-token design-QA reaction: runs after every verdict score
  // update. Applies deterministic contrast auto-fixes (real WCAG-computed
  // replacement colors, no LLM call) at most once per distinct file
  // snapshot, then surfaces whatever's left (non-auto-fixable issues like
  // missing <main> or heading structure) as a chat message with an opt-in
  // "ask AI to fix" action, so nothing escalates to a cloud call silently.
  useEffect(() => {
    if (!verdictResult || files.length === 0) return;
    const sig = filesSignature(files);
    if (autoFixSignatureRef.current !== sig) {
      const css = buildContrastOverrideCss(verdictResult);
      if (css) {
        const fixedFiles = applyVerdictOverrides(files, css);
        autoFixSignatureRef.current = filesSignature(fixedFiles);
        setFiles(fixedFiles);
      } else {
        autoFixSignatureRef.current = sig;
      }
    }

    const remaining = verdictResult.issues.filter((i) => !(i.checkId === 'contrast' && i.fixHex));
    if (remaining.length > 0 && chatFixListShownForRef.current !== sig) {
      chatFixListShownForRef.current = sig;
      const fixListText = formatFixListForAgent({ ...verdictResult, issues: remaining });
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Verdict design QA: ${verdictResult.score}/100. ${remaining.length} issue(s) need more than a color fix to resolve (structure/markup, not something a local script should guess at).`,
          action: {
            label: 'Ask AI to fix remaining design issues',
            onClick: () => handleSend(`Fix these design QA issues, reported by Verdict:\n\n${fixListText}`),
          },
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictTick]);

  function toggleLocalModel() {
    setUseLocalModel((v) => {
      const next = !v;
      if (next) {
        setMode('html'); // local models only target Instant HTML mode — see webllm.js
        setEnsembleEnabled(false);
      }
      return next;
    });
  }

  async function judgeWithBundler(candidateFiles) {
    return pushAndCheck(candidateFiles);
  }

  async function handleSend(prompt, contextFiles = []) {
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: prompt }]);
    setVerdictResult(null);
    setRuntimeQaResult(null);

    try {
      let result;
      let candidates;
      let winnerProviderId;

      if (useLocalModel) {
        setGenerationSource('local');
        const onProgress = (p) => setLocalModelProgress(p.text || `${Math.round((p.fraction || 0) * 100)}%`);
        result =
          files.length === 0
            ? await generateProjectLocally({ prompt, modelId: DEFAULT_LOCAL_MODEL, onProgress })
            : await editProjectLocally({ instruction: prompt, currentFiles: files, modelId: DEFAULT_LOCAL_MODEL, onProgress });
        setLocalModelProgress(null);
      } else if (ensembleEnabled && ensembleAvailable) {
        setGenerationSource('cloud');
        const ensembleResult = await generateEnsemble({ prompt, contextFiles, judgeWithSandbox: judgeWithBundler });
        result = ensembleResult.winner;
        candidates = ensembleResult.candidates;
        winnerProviderId = ensembleResult.winner.providerId;
      } else {
        setGenerationSource('cloud');
        result =
          files.length === 0
            ? await generateProject({ prompt, providerId: providers[0], contextFiles, mode })
            : await editProject({ instruction: prompt, providerId: providers[0], currentFiles: files, mode });
      }

      let finalFiles = result.files;
      let namespacedBackendSql = null;
      if (result.needsBackend && result.backendSql) {
        const validation = validateBackendSql(result.backendSql);
        if (validation.ok) {
          const slug = backendSlug || generateProjectSlug();
          if (!backendSlug) setBackendSlug(slug);
          const namespaced = namespaceBackend({ backendSql: result.backendSql, files: result.files, slug });
          finalFiles = namespaced.files;
          namespacedBackendSql = namespaced.backendSql;
          setPendingBackendSql(namespaced.backendSql);
          setHasProvisionedBackend(false);
        }
      }

      // Resolve {{IMAGE:prompt}} markers (see prompts.js) into real images
      // via whichever image-capable BYOK key is configured, before this
      // reaches self-heal or the preview. Skipped entirely for local
      // generation, which has no image-generation key to call.
      if (!useLocalModel && hasImageMarkers(finalFiles)) {
        setMessages((m) => [...m, { role: 'assistant', content: 'Generating images…' }]);
        finalFiles = await resolveImageMarkers(finalFiles);
      }

      setFiles(finalFiles);
      autoFixSignatureRef.current = null;
      chatFixListShownForRef.current = null;
      setLastGenerationMeta({
        prompt,
        providerId: useLocalModel ? 'local-webllm' : winnerProviderId || providers[0] || null,
        model: useLocalModel ? DEFAULT_LOCAL_MODEL : undefined,
      });

      if (mode === 'html' || useLocalModel) {
        // Instant HTML mode (and local-model generation, which always
        // produces Instant HTML mode output) has no build step — nothing
        // to self-heal, the preview effects above render it directly.
        setHealStatus(null);
      } else {
        try {
          const healed = await selfHeal({
            files: finalFiles,
            providerId: providers[0],
            onAttempt: (attempt, status) => setHealStatus({ attempts: attempt, ok: status.ok, healed: attempt > 1 }),
          });
          setFiles(healed.files);
          setHealStatus({ attempts: healed.attempts, ok: healed.healed || healed.attempts === 1, healed: healed.healed });
          finalFiles = healed.files;
        } catch (bundlerError) {
          setHealStatus(null);
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: `Couldn't verify the build in your browser (${bundlerError.message}). Showing the generated files in the Code tab.` },
          ]);
        }
      }

      setMessages((m) => [...m, { role: 'assistant', content: result.summary || 'Done.', candidates, winnerProviderId }]);
      if (result.needsBackend) {
        setMessages((m) => [
          ...m,
          namespacedBackendSql
            ? {
                role: 'assistant',
                content: "This app needs persistent storage. I generated a schema for it — note it's prototype-grade: row-level security is enabled, but rows aren't scoped per end-user of the generated app yet (see README's Status section). Click below to actually create the tables.",
                action: { label: 'Set up database', onClick: () => handleProvisionBackend(namespacedBackendSql) },
              }
            : {
                role: 'assistant',
                content: "This looks like it needs persistent data/auth, but I couldn't generate a safe schema for it this time. Describe the data model more explicitly and try again, or set it up manually.",
              },
        ]);
      }

      // Launch Kit: an opt-in, honestly-labeled real LLM pass (never a
      // template) that emits install docs, a grounded manual QA checklist
      // derived from what was actually generated, and a short marketing
      // blurb — see src/lib/generation/launchKit.js for why this exists
      // and exactly what it does and doesn't do.
      if (launchKitEnabled && !useLocalModel && providers.length > 0) {
        setLaunchKitStatus('generating');
        try {
          const kit = await generateLaunchKit({ providerId: providers[0], projectFiles: finalFiles, originalPrompt: prompt });
          setFiles((cur) => mergeLaunchKitFiles(cur, kit.files));
          setLaunchKitStatus('done');
          setMessages((m) => [...m, { role: 'assistant', content: kit.summary || 'Launch kit added: install docs, a manual QA checklist, and launch copy — all grounded in the code that was actually generated.' }]);
        } catch (kitError) {
          setLaunchKitStatus(null);
          setMessages((m) => [...m, { role: 'assistant', content: `Launch kit generation failed: ${kitError.message}` }]);
        }
      }
    } catch (e) {
      setLocalModelProgress(null);
      if (e instanceof KeelKeyMissingError) {
        setError(e.message);
        setSettingsOpen(true);
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function mergeLaunchKitFiles(currentFiles, kitFiles) {
    const byPath = new Map(currentFiles.map((f) => [f.path, f]));
    for (const f of kitFiles) byPath.set(f.path, f);
    return [...byPath.values()];
  }

  function currentProvenanceContext() {
    return {
      prompt: lastGenerationMeta?.prompt || '',
      providerId: lastGenerationMeta?.providerId || null,
      model: lastGenerationMeta?.model || null,
      generationSource,
      buildOk: mode === 'html' || useLocalModel ? true : bundleErrors.length === 0,
      buildErrorCount: bundleErrors.length,
      verdictResult,
      runtimeQaResult,
    };
  }

  function downloadWithProvenance() {
    downloadProjectZip(files, 'keel-project', files.length ? currentProvenanceContext() : null);
  }

  async function handleProvisionBackend(sql) {
    setMessages((m) => [...m, { role: 'assistant', content: 'Setting up database…' }]);
    try {
      const res = await fetch('/api/backend/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Provisioning failed');
      setHasProvisionedBackend(true);
      setMessages((m) => [...m, { role: 'assistant', content: `Database ready — ${json.tablesCreated} table(s) created.` }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Couldn't set up the database: ${e.message}` }]);
    }
  }

  async function handlePublish() {
    if (files.length === 0) return;
    const name = window.prompt('Project name for the live URL', 'my-keel-app');
    if (!name) return;
    setPublishStatus('publishing');
    try {
      const res = await fetch('/api/deploy/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, projectName: name, hasBackend: Boolean(pendingBackendSql) && hasProvisionedBackend }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Publish failed');
      setPublishStatus('published');
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Published: ${json.url} — ${json.note || 'may take a minute to finish building.'}` },
      ]);
      setTimeout(() => setPublishStatus(null), 4000);
    } catch (e) {
      setError(`Publish failed: ${e.message}`);
      setPublishStatus(null);
    }
  }

  async function handleSave() {
    if (!user || files.length === 0) return;
    setSaveStatus('saving');
    try {
      const name = window.prompt('Project name', 'Untitled project');
      if (!name) {
        setSaveStatus(null);
        return;
      }
      const saved = await saveProject({ id: currentProjectId, userId: user.id, name, files, needsBackend: false });
      setCurrentProjectId(saved.id);
      setSaveStatus('saved');
      setProjectsRefreshKey((k) => k + 1);
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
      setSaveStatus(null);
    }
  }

  async function handleLoadProject(id) {
    try {
      const project = await loadProject(id);
      setFiles(project.files);
      setMode(isHtmlModeProject(project.files) ? 'html' : 'react');
      setVerdictResult(null);
      setRuntimeQaResult(null);
      runtimeQaShownForRef.current = null;
      setGenerationSource(null);
      autoFixSignatureRef.current = null;
      chatFixListShownForRef.current = null;
      setMessages((m) => [...m, { role: 'assistant', content: `Loaded "${project.name}".` }]);
    } catch (e) {
      setError(`Load failed: ${e.message}`);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <Link to="/" className="font-semibold">Keel</Link>
        <div className="flex items-center gap-2">
          {error && <span className="max-w-sm truncate text-xs text-red-600 dark:text-red-400">{error}</span>}
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400" title="Adds install docs, a grounded manual QA checklist, and launch copy — all from a real LLM call grounded in your actual code, never a template">
            <input type="checkbox" checked={launchKitEnabled} onChange={(e) => setLaunchKitEnabled(e.target.checked)} />
            Launch kit{launchKitStatus === 'generating' ? '…' : ''}
          </label>
          <button onClick={onToggleTheme} className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={downloadWithProvenance}
            disabled={files.length === 0}
            className="rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
          >
            Download ZIP
          </button>
          <button
            onClick={handlePublish}
            disabled={files.length === 0 || publishStatus === 'publishing'}
            className="rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
          >
            {publishStatus === 'published' ? 'Published ✓' : publishStatus === 'publishing' ? 'Publishing…' : 'Publish live'}
          </button>
          <button onClick={() => setSettingsOpen(true)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Settings {providers.length > 0 ? `(${providers.length} key${providers.length > 1 ? 's' : ''})` : ''}
          </button>
          {isPersistenceConfigured() && (
            <>
              {user ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={files.length === 0 || saveStatus === 'saving'}
                    className="rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
                  >
                    {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'saving' ? 'Saving…' : 'Save project'}
                  </button>
                  <ProjectSidebar userId={user.id} onLoad={handleLoadProject} refreshKey={projectsRefreshKey} />
                  <button onClick={signOut} className="rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    Sign out
                  </button>
                </>
              ) : (
                <button onClick={() => setAuthModalOpen(true)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  Sign in
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {providers.length === 0 && !useLocalModel && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            Add a free API key to start building, or check "On-device model" below to generate with no key at all (runs a small
            model in your browser).
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="shrink-0 rounded-lg bg-amber-900 px-3 py-1 text-xs font-medium text-white dark:bg-amber-200 dark:text-amber-950"
          >
            Add a key →
          </button>
        </div>
      )}

      {localModelProgress && (
        <div className="border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-200">
          On-device model: {localModelProgress}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal">
          <Panel defaultSize={30} minSize={20}>
            <ChatPanel
              messages={messages}
              busy={busy}
              onSend={handleSend}
              ensembleAvailable={ensembleAvailable}
              ensembleEnabled={ensembleEnabled}
              onToggleEnsemble={() => setEnsembleEnabled((v) => !v)}
              mode={mode}
              onSetMode={setMode}
              onDownload={downloadWithProvenance}
              onPublish={handlePublish}
              useLocalModel={useLocalModel}
              onToggleLocalModel={toggleLocalModel}
              webGpuAvailable={webGpuAvailable}
            />
          </Panel>
          <Separator className="w-px bg-neutral-200 dark:bg-neutral-800" />
          <Panel defaultSize={18} minSize={12}>
            <FileExplorer files={files} selectedPath={selectedPath} onSelect={setSelectedPath} />
          </Panel>
          <Separator className="w-px bg-neutral-200 dark:bg-neutral-800" />
          <Panel defaultSize={52} minSize={30}>
            <PreviewPane
              htmlDoc={previewDoc}
              bundling={bundling}
              bundleErrors={bundleErrors}
              selectedFile={selectedFile}
              healStatus={healStatus}
              verdictResult={verdictResult}
              runtimeQaResult={runtimeQaResult}
              generationSource={generationSource}
            />
          </Panel>
        </Group>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
