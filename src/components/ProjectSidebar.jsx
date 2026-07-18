import { useEffect, useState } from 'react';
import { listProjects, deleteProject } from '../lib/supabase/projects.js';

/** Dropdown of the signed-in user's saved projects — load or delete. */
export default function ProjectSidebar({ userId, onLoad, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    listProjects(userId)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open, userId, refreshKey]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        My projects
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          {loading && <div className="px-3 py-2 text-xs text-neutral-400">Loading…</div>}
          {!loading && projects.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-400">No saved projects yet.</div>
          )}
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <button
                onClick={() => {
                  onLoad(p.id);
                  setOpen(false);
                }}
                className="flex-1 truncate text-left text-sm"
              >
                {p.name}
              </button>
              <button
                onClick={async () => {
                  await deleteProject(p.id);
                  setProjects((cur) => cur.filter((x) => x.id !== p.id));
                }}
                className="ml-2 text-xs text-neutral-400 hover:text-red-500"
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
