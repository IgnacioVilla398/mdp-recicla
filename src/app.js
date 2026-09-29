/**
 * Aplicacion Express: middlewares globales, API y frontend estatico.
 * Paso 2: autenticacion y gestion de materiales/pesajes.
 */
import path from 'node:path';
import express from 'express';
import config from './config/env.js';
import api from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use('/api', api);
  app.use('/api', notFoundHandler);

  app.use(express.static(path.join(config.rootDir, 'public')));

  app.use(errorHandler);

  return app;
}

export default createApp;
