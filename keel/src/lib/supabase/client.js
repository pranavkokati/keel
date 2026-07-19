import { createClient } from '@supabase/supabase-js';

// Default: the maintainer's own free-tier Supabase project for the hosted
// keel-two-gamma.vercel.app instance. This is intentionally committed —
// a Supabase anon key is designed to be public (every Supabase app ships it
// in the client bundle); it grants nothing beyond what the RLS policies in
// supabase/migrations/0001_init.sql allow. Self-hosters should override both
// with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY pointing at their own
// project so their users' data doesn't land in the maintainer's database.
const DEFAULT_SUPABASE_URL = 'https://xafpxbdarpaygfhqfvrh.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZnB4YmRhcnBheWdmaHFmdnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk4OTAsImV4cCI6MjA5OTk3NTg5MH0.yU3o0x5KGDEhEQ-w-mmmutuLsNFTSgdNazhwXyoJEPc';

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

/**
 * Client-side Supabase client using the public anon key (safe to expose —
 * unlike a model API key, this is designed to be public and is constrained
 * entirely by the RLS policies in supabase/migrations/0001_init.sql).
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export function isPersistenceConfigured() {
  return Boolean(supabase);
}
