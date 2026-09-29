/** Rutas de usuarios, barrios y recorridos: /api/users, /api/neighborhoods, /api/routes */
import { Router } from 'express';
import { all } from '../db/index.js';
import { asyncHandler, ok } from '../utils/http.js';
import { authenticate, adminOnly } from '../middlewares/auth.js';
import * as users from '../services/users.service.js';
import { WEEKDAY_NAMES, today } from '../utils/validate.js';

export const usersRouter = Router();
usersRouter.use(authenticate, adminOnly);

/** GET /api/users?search=&neighborhood_id=&weekday=&status=&page=&limit= */
usersRouter.get('/', asyncHandler(async (req, res) => {
  const q = req.query;
  ok(res, users.listClients({
    search: q.search,
    neighborhoodId: q.neighborhood_id,
    weekday: q.weekday,
    status: q.status,
    page: q.page,
    limit: q.limit,
  }));
}));

/** POST /api/users — alta de vecino desde el panel */
usersRouter.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, phone, address, neighborhood_id: neighborhoodId } = req.body ?? {};
  ok(res, { user: users.createClient({ name, email, password, phone, address, neighborhoodId }) }, 201);
}));

/** GET /api/users/:id */
usersRouter.get('/:id', asyncHandler(async (req, res) => {
  ok(res, { user: users.getClient(req.params.id) });
}));

/** PATCH /api/users/:id */
usersRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { name, phone, address, neighborhood_id: neighborhoodId, notes, status } = req.body ?? {};
  const user = users.updateClient(req.params.id, { name, phone, address, neighborhoodId, notes });
  ok(res, { user: status ? users.setStatus(req.params.id, status) : user });
}));

export const neighborhoodsRouter = Router();

/** GET /api/neighborhoods — publico: usado en el registro y en el panel */
neighborhoodsRouter.get('/', asyncHandler(async (req, res) => {
  const items = all(
    `SELECT n.id, n.name, n.slug, n.zone, n.weekday, n.is_active,
            COUNT(u.id) AS clients
       FROM neighborhoods n
       LEFT JOIN users u ON u.neighborhood_id = n.id AND u.role = 'client'
      GROUP BY n.id
      ORDER BY n.weekday IS NULL, n.weekday, n.name COLLATE NOCASE`
  ).map((n) => ({ ...n, weekday_name: n.weekday ? WEEKDAY_NAMES[n.weekday] : null }));
  ok(res, { items });
}));

export const routesRouter = Router();
routesRouter.use(authenticate, adminOnly);

/** GET /api/routes/daily?weekday=2&date=YYYY-MM-DD — ruta del dia por barrio */
routesRouter.get('/daily', asyncHandler(async (req, res) => {
  const jsDay = new Date().getUTCDay();          // 0=domingo
  const isoToday = jsDay === 0 ? 7 : jsDay;      // 1=lunes ... 7=domingo
  const weekday = req.query.weekday ?? isoToday;
  ok(res, users.dailyRoute({ weekday, date: req.query.date ?? today() }));
}));

/** GET /api/routes/week — cronograma semanal completo */
routesRouter.get('/week', asyncHandler(async (req, res) => {
  const rows = all(
    `SELECT n.weekday, COUNT(u.id) AS clients
       FROM neighborhoods n
       LEFT JOIN users u ON u.neighborhood_id = n.id AND u.role = 'client' AND u.status = 'active'
      WHERE n.is_active = 1 AND n.weekday IS NOT NULL
      GROUP BY n.weekday`
  );
  const byDay = Object.fromEntries(rows.map((r) => [r.weekday, r.clients]));
  ok(res, {
    week: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ weekday: d, weekday_name: WEEKDAY_NAMES[d], clients: byDay[d] ?? 0 })),
  });
}));

export default { usersRouter, neighborhoodsRouter, routesRouter };
