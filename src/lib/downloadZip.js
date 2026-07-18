import JSZip from 'jszip';

/**
 * Bundles the current generated project into a ZIP and triggers a browser
 * download. Runs entirely client-side — no server involvement, no cost.
 * @param {Array<{path: string, content: string}>} files
 * @param {string} projectName
 */
export async function downloadProjectZip(files, projectName = 'keel-project') {
  if (!files?.length) return;
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitize(projectName)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitize(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'keel-project';
}
