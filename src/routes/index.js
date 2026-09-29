/** Router raiz de la API (/api). */
import { Router } from 'express';
import authRouter from './auth.routes.js';
import materialsRouter from './materials.routes.js';
import collectionsRouter from './collections.routes.js';
import payoutsRouter from './payouts.routes.js';
import bagsRouter from './bags.routes.js';
import { usersRouter, neighborhoodsRouter, routesRouter } from './users.routes.js';
import { all } from '../db/index.js';
import { asyncHandler, ok } from '../utils/http.js';
import config from '../config/env.js';

const api = Router();

api.get('/health', (req, res) => {
  ok(res, { service: 'mdp-recicla-api', version: '0.3.0', step: 'paso-3-frontend-cliente', env: config.env, time: new Date().toISOString() });
});

api.get('/db/status', asyncHandler(async (req, res) => {
  const tables = ['neighborhoods', 'users', 'materials', 'material_price_history', 'collections', 'bag_deliveries', 'payouts'];
  const counts = Object.fromEntries(tables.map((t) => [t, all(`SELECT COUNT(*) AS c FROM ${t}`)[0].c]));
  ok(res, { db_file: config.dbFile, counts });
}));

api.use('/auth', authRouter);
api.use('/materials', materialsRouter);
api.use('/collections', collectionsRouter);
api.use('/payouts', payoutsRouter);
api.use('/bags', bagsRouter);
api.use('/users', usersRouter);
api.use('/neighborhoods', neighborhoodsRouter);
api.use('/routes', routesRouter);

export default api;
