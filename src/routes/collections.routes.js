/** Rutas de pesajes: /api/collections */
import { Router } from 'express';
import { asyncHandler, ok, ApiError } from '../utils/http.js';
import { authenticate, adminOnly, clientOnly } from '../middlewares/auth.js';
import * as collections from '../services/collections.service.js';

const router = Router();
router.use(authenticate);

/** GET /api/collections — el vecino ve solo lo suyo; el admin puede filtrar todo */
router.get('/', asyncHandler(async (req, res) => {
  const q = req.query;
  const filters = {
    materialId: q.material_id,
    neighborhoodId: q.neighborhood_id,
    from: q.from,
    to: q.to,
    month: q.month,
    limit: q.limit,
    offset: q.offset,
    order: q.order,
  };

  if (req.user.role === 'client') {
    filters.userId = req.user.id;
  } else if (q.user_id) {
    filters.userId = q.user_id;
  }

  ok(res, collections.listCollections(filters));
}));

/** GET /api/collections/summary/me — resumen del vecino autenticado */
router.get('/summary/me', clientOnly, asyncHandler(async (req, res) => {
  ok(res, collections.clientSummary(req.user.id, req.query.month));
}));

/** GET /api/collections/overview — metricas globales (admin) */
router.get('/overview', adminOnly, asyncHandler(async (req, res) => {
  ok(res, collections.adminOverview());
}));

/** POST /api/collections/batch — varios materiales en una sola visita (admin) */
router.post('/batch', adminOnly, asyncHandler(async (req, res) => {
  const { user_id: userId, collected_on: collectedOn, route_date: routeDate, notes, items } = req.body ?? {};
  const payload = (items ?? []).map((item) => ({
    userId,
    materialId: item.material_id,
    weightKg: item.weight_kg,
    collectedOn,
    routeDate,
    notes: item.notes ?? notes,
  }));
  ok(res, { items: collections.createBatch(payload, req.user.id) }, 201);
}));

/** POST /api/collections — carga rapida de un pesaje (admin) */
router.post('/', adminOnly, asyncHandler(async (req, res) => {
  const { user_id: userId, material_id: materialId, weight_kg: weightKg, collected_on: collectedOn, route_date: routeDate, notes } = req.body ?? {};
  ok(res, { collection: collections.createCollection({ userId, materialId, weightKg, collectedOn, routeDate, notes }, req.user.id) }, 201);
}));

/** GET /api/collections/:id */
router.get('/:id', asyncHandler(async (req, res) => {
  const row = collections.getCollection(req.params.id);
  if (req.user.role === 'client' && row.user_id !== req.user.id) throw ApiError.forbidden('Ese pesaje no te pertenece');
  ok(res, { collection: row });
}));

/** PATCH /api/collections/:id — corregir un pesaje (admin) */
router.patch('/:id', adminOnly, asyncHandler(async (req, res) => {
  const { weight_kg: weightKg, material_id: materialId, collected_on: collectedOn, notes } = req.body ?? {};
  ok(res, { collection: collections.updateCollection(req.params.id, { weightKg, materialId, collectedOn, notes }) });
}));

/** DELETE /api/collections/:id (admin) */
router.delete('/:id', adminOnly, asyncHandler(async (req, res) => {
  ok(res, collections.deleteCollection(req.params.id));
}));

export default router;
