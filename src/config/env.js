/**
 * Configuracion central del proyecto.
 * Lee variables desde el archivo .env (sin dependencias externas).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Carga .env en process.env (no sobreescribe variables ya definidas). */
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const resolveFromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT_DIR, p));

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  rootDir: ROOT_DIR,
  dbFile: resolveFromRoot(process.env.DB_FILE ?? 'db/mdp-recicla.sqlite'),
  schemaFile: path.join(ROOT_DIR, 'src', 'db', 'schema.sql'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-no-usar-en-produccion',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  minPayoutAmount: Number(process.env.MIN_PAYOUT_AMOUNT ?? 2000),
};

export default config;
