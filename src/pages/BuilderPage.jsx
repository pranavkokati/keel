import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Group, Separator } from 'react-resizable-panels';
// Note: react-resizable-panels v4 renamed its API from the older
// PanelGroup/PanelResizeHandle naming to Group/Separator (Panel is
// unchanged) — see https://react-resizable-panels.vercel.app/.
import ChatPanel from '../components/ChatPanel.jsx';
import FileExplorer from '../components/FileExplorer.jsx';
import PreviewPane from '../components/PreviewPane.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import { generateProject, editProject, KeelKeyMissingError } from '../lib/generation/engine.js';
import { generateEnsemble } from '../lib/generation/ensemble.js';
import { selfHeal } from '../lib/generation/selfHeal.js';
import { configuredProviders } from '../lib/byok/keyStore.js';
import { downloadProjectZip } from '../lib/downloadZip.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AuthModal from '../components/AuthModal.jsx';
import ProjectSidebar from '../components/ProjectSidebar.jsx';
import { saveProject, loadProject } from '../lib/supabase/projects.js';
import { isPersistenceConfigured } from '../lib/supabase/client.js';
import { validateBackendSql, namespaceBackend, generateProjectSlug } from '../lib/generation/backendProvision.js';

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
  const [sandboxId, setSandboxId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [healStatus, setHealStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ensembleEnabled, setEnsembleEnabled] = useState(false);
  const [error, setError] = useState(null);
  const [sandboxUnavailable, setSandboxUnavailable] = useState(false);
  const [pendingBackendSql, setPendingBackendSql] = useState(null);
  const [backendSlug, setBackendSlug] = useState(null);
  const [hasProvisionedBackend, setHasProvisionedBackend] = useState(false);
  const [publishStatus, setPublishStatus] = useState(null);

  const providers = configuredProviders();
  const ensembleAvailable = providers.length >= 2;
  const selectedFile = useMemo(() => files.find((f) => f.path === selectedPath), [files, selectedPath]);

  async function judgeWithSandbox(candidateFiles) {
    const res = await fetch('/api/sandbox/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: candidateFiles }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, errors: [json.error || 'sandbox start failed'] };
    const checkRes = await fetch('/api/sandbox/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sandboxId: json.id, files: candidateFiles }),
    });
    return checkRes.json();
  }

  async function handleSend(prompt) {
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: prompt }]);

    try {
      let result;
      let candidates;
      let winnerProviderId;

      if (ensembleEnabled && ensembleAvailable) {
        const ensembleResult = await generateEnsemble({ prompt, judgeWithSandbox });
        result = ensembleResult.winner;
        candidates = ensembleResult.candidates;
        winnerProviderId = ensembleResult.winner.providerId;
      } else if (files.length === 0) {
        result = await generateProject({ prompt, providerId: providers[0] });
      } else {
        result = await editProject({ instruction: prompt, providerId: providers[0], currentFiles: files });
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

      setFiles(finalFiles);

      // Push to the sandbox and run the self-heal loop so what the user
      // sees has actually been verified to build, not just generated. This
      // is best-effort: if no sandbox provider is configured (no
      // E2B_API_KEY set by whoever is running this instance), we still want
      // the generated files and the chat response to land — the user just
      // won't get a live preview or self-healing on this instance until
      // it's configured. Fail soft here, never swallow the generation
      // result itself.
      let sandboxNote = null;
      try {
        let sandbox = sandboxId;
        if (!sandbox) {
          const startRes = await fetch('/api/sandbox/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: finalFiles }),
          });
          const startJson = await startRes.json();
          if (!startRes.ok) throw new Error(startJson.error);
          sandbox = startJson.id;
          setSandboxId(sandbox);
          setPreviewUrl(startJson.previewUrl);
        }

        const healed = await selfHeal({
          files: finalFiles,
          sandboxId: sandbox,
          providerId: providers[0],
          onAttempt: (attempt, status) => setHealStatus({ attempts: attempt, ok: status.ok, healed: attempt > 1 }),
        });
        setFiles(healed.files);
        setHealStatus({ attempts: healed.attempts, ok: healed.healed || healed.attempts === 1, healed: healed.healed });
        setSandboxUnavailable(false);
      } catch (sandboxError) {
        setSandboxUnavailable(true);
        sandboxNote = `Live preview isn't available on this instance right now (${sandboxError.message}). Showing generated files in the Code tab — ask whoever runs this deployment to configure E2B_API_KEY for sandbox previews.`;
      }

      setMessages((m) => [
        ...m,
        { role: 'assistant', content: result.summary || 'Done.', candidates, winnerProviderId },
        ...(sandboxNote ? [{ role: 'assistant', content: sandboxNote }] : []),
      ]);
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
    } catch (e) {
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
      setCurrentProjectId(project.id);
      setSandboxId(null);
      setPreviewUrl(null);
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
          <button onClick={onToggleTheme} className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => downloadProjectZip(files)}
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

      {providers.length === 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Add a free API key to start building — Keel is bring-your-own-key, so nothing generates until you configure one.</span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="shrink-0 rounded-lg bg-amber-900 px-3 py-1 text-xs font-medium text-white dark:bg-amber-200 dark:text-amber-950"
          >
            Add a key →
          </button>
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
            />
          </Panel>
          <Separator className="w-px bg-neutral-200 dark:bg-neutral-800" />
          <Panel defaultSize={18} minSize={12}>
            <FileExplorer files={files} selectedPath={selectedPath} onSelect={setSelectedPath} />
          </Panel>
          <Separator className="w-px bg-neutral-200 dark:bg-neutral-800" />
          <Panel defaultSize={52} minSize={30}>
            <PreviewPane previewUrl={previewUrl} selectedFile={selectedFile} healStatus={healStatus} />
          </Panel>
        </Group>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
