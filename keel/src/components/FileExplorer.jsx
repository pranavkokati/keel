import { useState } from 'react';

/** File tree for the currently generated project. Click a file to view its content in the preview pane's "Code" tab. */
export default function FileExplorer({ files, selectedPath, onSelect }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const tree = buildTree(files || []);

  return (
    <div className="h-full overflow-y-auto p-2 text-sm">
      {files?.length === 0 && (
        <p className="p-3 text-neutral-400 dark:text-neutral-500">No files yet — describe an app to generate one.</p>
      )}
      <TreeNode
        node={tree}
        path=""
        depth={0}
        collapsed={collapsed}
        onToggle={(p) =>
          setCollapsed((c) => {
            const next = new Set(c);
            next.has(p) ? next.delete(p) : next.add(p);
            return next;
          })
        }
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </div>
  );
}

function buildTree(files) {
  const root = { dirs: {}, files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      node.dirs[parts[i]] ??= { dirs: {}, files: [] };
      node = node.dirs[parts[i]];
    }
    node.files.push({ name: parts[parts.length - 1], path: f.path });
  }
  return root;
}

function TreeNode({ node, path, depth, collapsed, onToggle, selectedPath, onSelect }) {
  return (
    <div>
      {Object.entries(node.dirs).map(([name, child]) => {
        const dirPath = path ? `${path}/${name}` : name;
        const isCollapsed = collapsed.has(dirPath);
        return (
          <div key={dirPath}>
            <button
              onClick={() => onToggle(dirPath)}
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              style={{ paddingLeft: depth * 12 + 8 }}
            >
              <span className="w-3 text-[10px]">{isCollapsed ? '▸' : '▾'}</span>
              {name}
            </button>
            {!isCollapsed && (
              <TreeNode node={child} path={dirPath} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} selectedPath={selectedPath} onSelect={onSelect} />
            )}
          </div>
        );
      })}
      {node.files.map((f) => (
        <button
          key={f.path}
          onClick={() => onSelect(f.path)}
          className={
            'block w-full truncate rounded px-2 py-1 text-left ' +
            (f.path === selectedPath
              ? 'bg-neutral-200 font-medium dark:bg-neutral-800'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800')
          }
          style={{ paddingLeft: depth * 12 + 20 }}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}
