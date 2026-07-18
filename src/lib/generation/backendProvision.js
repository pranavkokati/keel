/**
 * Backend auto-provisioning: turns the `backendSql` a model emits (see
 * schema.js / prompts.js) into an actually-executed Postgres schema, wired
 * to the generated app's own files.
 *
 * Two problems this module solves:
 *
 * 1. ISOLATION. A single Keel instance shares one Supabase project across
 *    every project anyone generates on it. If two people both ask for a
 *    "todos" table, their SQL can't collide. Every table the model creates
 *    is required (by the prompt) to start with the literal prefix "app_";
 *    this module rewrites that to a per-project prefix ("app_<slug>_") in
 *    both the SQL and any generated file that references a table name,
 *    before anything is sent to a real database.
 *
 * 2. SAFETY. backendSql is model output, and Keel is open-source software
 *    other people will self-host and point real users at. Executing
 *    arbitrary AI-generated DDL against a real Postgres connection with an
 *    elevated role is a real risk (a manipulated prompt could try to smuggle
 *    a DROP TABLE or a grant). validateBackendSql() is a deliberately strict
 *    allowlist — not a general-purpose SQL sandbox — that only accepts a
 *    narrow set of statement shapes and rejects everything else outright.
 *    Operators who want defense in depth beyond this should point
 *    SUPABASE_DB_URL at a scoped Postgres role rather than the project's
 *    postgres superuser connection string (documented in README).
 */

const ALLOWED_STATEMENT_PATTERN =
  /^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE .+ ENABLE ROW LEVEL SECURITY|CREATE POLICY|COMMENT ON)/i;

const FORBIDDEN_KEYWORDS = [
  'DROP ',
  'DELETE ',
  'TRUNCATE',
  'GRANT ',
  'REVOKE ',
  'ALTER ROLE',
  'ALTER SYSTEM',
  'ALTER DATABASE',
  '\\COPY',
  'COPY ',
  'PG_READ',
  'PG_WRITE',
  'PG_EXECUTE',
];

const PROTECTED_TABLE_NAMES = ['projects', 'sandbox_usage', 'deploy_usage', 'auth.users', 'auth.'];

/**
 * Splits on statement-terminating semicolons that are not inside a quoted
 * string. Good enough for the narrow, model-authored DDL this handles —
 * not a general SQL parser.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" && !inDollarQuote) inSingleQuote = !inSingleQuote;
    if (sql.slice(i, i + 2) === '$$' && !inSingleQuote) inDollarQuote = !inDollarQuote;
    current += ch;
    if (ch === ';' && !inSingleQuote && !inDollarQuote) {
      statements.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

/**
 * @param {string} sql
 * @returns {{ok: boolean, statements: string[], error?: string}}
 */
export function validateBackendSql(sql) {
  if (!sql || !sql.trim()) {
    return { ok: false, statements: [], error: 'No backendSql provided.' };
  }

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    return { ok: false, statements: [], error: 'backendSql contained no statements.' };
  }

  for (const statement of statements) {
    const upper = statement.toUpperCase();

    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (upper.includes(keyword)) {
        return { ok: false, statements: [], error: `Statement contains forbidden keyword "${keyword.trim()}": ${statement.slice(0, 120)}` };
      }
    }

    if (!ALLOWED_STATEMENT_PATTERN.test(statement)) {
      return { ok: false, statements: [], error: `Statement does not match the allowed set (CREATE TABLE / CREATE INDEX / ENABLE ROW LEVEL SECURITY / CREATE POLICY / COMMENT ON): ${statement.slice(0, 120)}` };
    }

    for (const protectedName of PROTECTED_TABLE_NAMES) {
      if (upper.includes(protectedName.toUpperCase())) {
        return { ok: false, statements: [], error: `Statement references a protected table/schema ("${protectedName}"): ${statement.slice(0, 120)}` };
      }
    }

    // Every CREATE TABLE must target an app_-prefixed name (checked here,
    // pre-namespacing — namespaceBackend() below rewrites app_ -> app_<slug>_
    // afterwards, so this check runs against the model's original output).
    if (/^CREATE TABLE/i.test(statement)) {
      const match = statement.match(/CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?(\w+)["`]?/i);
      const tableName = match?.[2];
      if (!tableName || !tableName.toLowerCase().startsWith('app_')) {
        return { ok: false, statements: [], error: `CREATE TABLE must target a table name prefixed with "app_": ${statement.slice(0, 120)}` };
      }
    }
  }

  return { ok: true, statements };
}

/** Generates a short, URL-safe, collision-resistant per-project slug. */
export function generateProjectSlug() {
  return Array.from({ length: 8 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join('');
}

/**
 * Rewrites every whole-word occurrence of the literal "app_" table prefix to
 * a project-scoped "app_<slug>_" prefix, across both the SQL and any
 * generated file content that references those table names (e.g. calls like
 * `.from('app_todos')` in src/lib/supabaseClient.js-consuming components).
 *
 * @param {{backendSql: string, files: Array<{path: string, content: string}>, slug: string}} args
 */
export function namespaceBackend({ backendSql, files, slug }) {
  const pattern = /\bapp_/g;
  const replacement = `app_${slug}_`;

  const namespacedSql = backendSql.replace(pattern, replacement);
  const namespacedFiles = files.map((f) => ({ ...f, content: f.content.replace(pattern, replacement) }));

  return { backendSql: namespacedSql, files: namespacedFiles };
}
