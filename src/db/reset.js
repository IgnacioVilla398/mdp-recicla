/**
 * Borra el archivo SQLite y lo reconstruye con datos de prueba.
 * Usar: npm run db:reset
 */
import fs from 'node:fs';
import config from '../config/env.js';
import { closeDb } from './index.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

closeDb();
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  const file = `${config.dbFile}${suffix}`;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`[reset] Eliminado ${file}`);
  }
}

migrate();
seed({ force: true });
console.log('[reset] Base de datos reconstruida.');
