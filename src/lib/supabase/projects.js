import { supabase } from './client.js';

/**
 * Save (create or overwrite) the current project for a signed-in user.
 * @param {{id?: string, userId: string, name: string, files: Array, needsBackend: boolean}} args
 */
export async function saveProject({ id, userId, name, files, needsBackend }) {
  const row = { user_id: userId, name, files, needs_backend: needsBackend, updated_at: new Date().toISOString() };
  if (id) row.id = id;
  const { data, error } = await supabase.from('projects').upsert(row).select().single();
  if (error) throw error;
  return data;
}

/** @param {string} userId */
export async function listProjects(userId) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at, needs_backend')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** @param {string} id */
export async function loadProject(id) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/** @param {string} id */
export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
