/**
 * Migrador simple: aplica src/db/schema.sql y registra la version.
 * Usar: npm run db:migrate
 */
import { getDb, applySchema } from './index.js';
import config from '../config/env.js';
import { isMain } from '../utils/cli.js';

const SCHEMA_VERSION = 1;

function ensureMigrationsTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

export function migrate() {
  const db = getDb();
  ensureMigrationsTable();

  const current = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()?.v ?? 0;
  if (current >= SCHEMA_VERSION) {
    console.log(`[migrate] Base de datos ya en version ${current}. Nada que aplicar.`);
    return { applied: false, version: current };
  }

  console.log(`[migrate] Aplicando esquema v${SCHEMA_VERSION} en ${config.dbFile} ...`);
  applySchema();
  db.prepare('INSERT OR REPLACE INTO schema_migrations (version, name) VALUES (?, ?)')
    .run(SCHEMA_VERSION, 'esquema-inicial');
  console.log(`[migrate] OK. Version ${SCHEMA_VERSION} aplicada.`);
  return { applied: true, version: SCHEMA_VERSION };
}

if (isMain(import.meta.url)) migrate();
