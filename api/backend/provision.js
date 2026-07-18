import pg from 'pg';
import { validateBackendSql } from '../../src/lib/generation/backendProvision.js';

export const config = { runtime: 'nodejs' };

/**
 * Executes an already-namespaced backendSql string against the operator's
 * Postgres database. Requires SUPABASE_DB_URL — the direct Postgres
 * connection string from Supabase dashboard -> Project Settings -> Database
 * -> Connection string (NOT the same thing as SUPABASE_SERVICE_ROLE_KEY,
 * which only grants PostgREST access and cannot run DDL like CREATE TABLE).
 *
 * validateBackendSql() runs again here, server-side, even though the client
 * already validated before namespacing — never trust validation that
 * happened somewhere else. All statements run inside a single transaction:
 * either the whole schema lands or none of it does.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  if (!process.env.SUPABASE_DB_URL) {
    res.status(501).json({
      error: 'Backend auto-provisioning is not configured on this deployment (missing SUPABASE_DB_URL). The generated app\'s files are still yours — you can wire up storage manually, or ask whoever runs this instance to configure it.',
    });
    return;
  }

  const { sql } = req.body || {};
  if (typeof sql !== 'string') {
    res.status(400).json({ error: 'Body must include { sql: string }' });
    return;
  }

  const validation = validateBackendSql(sql);
  if (!validation.ok) {
    res.status(400).json({ error: `Rejected backendSql: ${validation.error}` });
    return;
  }

  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await client.query('BEGIN');
    for (const statement of validation.statements) {
      await client.query(statement);
    }
    await client.query('COMMIT');
    res.status(200).json({ ok: true, tablesCreated: validation.statements.filter((s) => /^CREATE TABLE/i.test(s)).length });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // best-effort rollback
    }
    res.status(502).json({ error: `Backend provisioning failed, no changes were committed: ${e.message}` });
  } finally {
    await client.end().catch(() => {});
  }
}
