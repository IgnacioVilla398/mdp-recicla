/** Punto de entrada: levanta el servidor HTTP. */
import { createApp } from './app.js';
import config from './config/env.js';
import { applySchema } from './db/index.js';

applySchema();

const app = createApp();

app.listen(config.port, () => {
  console.log('----------------------------------------------------');
  console.log('  MdP Recicla - API (Pasos 1-2: esquema + auth y pesajes)');
  console.log(`  Entorno : ${config.env}`);
  console.log(`  URL     : http://localhost:${config.port}`);
  console.log(`  Salud   : http://localhost:${config.port}/api/health`);
  console.log(`  SQLite  : ${config.dbFile}`);
  console.log('----------------------------------------------------');
});
