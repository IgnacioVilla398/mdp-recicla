/**
 * Aplicacion Express. En el Paso 1 solo expone salud del sistema y un
 * resumen de la base de datos; las rutas de negocio llegan en el Paso 2.
 */
import path from 'node:path';
import express from 'express';
import config from './config/env.js';
import { get } from './db/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(config.rootDir, 'public')));

  // --- Salud del servicio ---
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'mdp-recicla-api',
      version: '0.1.0',
      env: config.env,
      step: 'paso-1-esquema-bd',
      time: new Date().toISOString(),
    });
  });

  // --- Verificacion del esquema (util en desarrollo) ---
  app.get('/api/db/status', (req, res, next) => {
    try {
      const tables = ['neighborhoods', 'users', 'materials', 'material_price_history', 'collections', 'bag_deliveries', 'payouts'];
      const counts = Object.fromEntries(
        tables.map((t) => [t, get(`SELECT COUNT(*) AS c FROM ${t}`)?.c ?? 0])
      );
      res.json({ ok: true, db_file: config.dbFile, counts });
    } catch (error) {
      next(error);
    }
  });

  // --- 404 API ---
  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint no encontrado' });
  });

  // --- Manejo de errores ---
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error('[error]', error);
    res.status(500).json({ ok: false, error: config.env === 'production' ? 'Error interno' : String(error.message ?? error) });
  });

  return app;
}

export default createApp;
