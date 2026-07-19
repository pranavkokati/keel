/**
 * Plain-JS duplicate of the fallback constants in src/lib/supabase/client.js.
 *
 * Serverless functions under api/ are NOT processed by Vite, so they can't
 * read `import.meta.env` (that's a Vite build-time replacement that only
 * exists in the browser bundle) — they read `process.env` directly. This
 * file exists so server-side code has the same "safe public default"
 * fallback the client already has, instead of silently treating the
 * project as unconfigured whenever an operator hasn't explicitly set
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY as Vercel environment
 * variables (the anon key is safe to duplicate here — it's public by
 * design and every access through it is gated by the RLS policies in
 * supabase/migrations/*.sql, never by keeping the key secret).
 */

export const DEFAULT_SUPABASE_URL = 'https://xafpxbdarpaygfhqfvrh.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZnB4YmRhcnBheWdmaHFmdnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk4OTAsImV4cCI6MjA5OTk3NTg5MH0.yU3o0x5KGDEhEQ-w-mmmutuLsNFTSgdNazhwXyoJEPc';

export function resolveSupabaseUrl() {
  return process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

export function resolveSupabaseAnonKey() {
  return process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
}
