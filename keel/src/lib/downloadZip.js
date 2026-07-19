import JSZip from 'jszip';
import { buildProvenanceManifest, attachProvenanceFile } from './provenance/manifest.js';

/**
 * Bundles the current generated project into a ZIP and triggers a browser
 * download. Runs entirely client-side — no server involvement, no cost.
 * @param {Array<{path: string, content: string}>} files
 * @param {string} projectName
 * @param {object|null} provenanceContext - if provided, a KEEL_PROVENANCE.json
 *   signed manifest is generated and included in the ZIP. See
 *   src/lib/provenance/manifest.js for exactly what it does and doesn't prove.
 */
export async function downloadProjectZip(files, projectName = 'keel-project', provenanceContext = null) {
  if (!files?.length) return;
  let filesToZip = files;
  if (provenanceContext) {
    try {
      const manifest = await buildProvenanceManifest({ ...provenanceContext, files });
      filesToZip = attachProvenanceFile(files, manifest);
    } catch {
      // Provenance is a bonus, not a requirement — never block a download over it.
    }
  }
  const zip = new JSZip();
  for (const f of filesToZip) zip.file(f.path, f.content);
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
