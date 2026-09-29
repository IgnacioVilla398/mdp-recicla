/** Rutas de entrega de bolsas: /api/bags */
import { Router } from 'express';
import { asyncHandler, ok, ApiError } from '../utils/http.js';
import { authenticate, adminOnly, clientOnly } from '../middlewares/auth.js';
import * as bags from '../services/bags.service.js';

const router = Router();
router.use(authenticate);

/** GET /api/bags/summary/me — bolsas recibidas por el vecino */
router.get('/summary/me', clientOnly, asyncHandler(async (req, res) => {
  ok(res, bags.bagSummary(req.user.id));
}));

/** GET /api/bags — historial de entregas */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    neighborhoodId: req.query.neighborhood_id,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
  };
  if (req.user.role === 'client') filters.userId = req.user.id;
  else if (req.query.user_id) filters.userId = req.query.user_id;
  ok(res, bags.listBagDeliveries(filters));
}));

/** POST /api/bags — registrar entrega de bolsas (admin) */
router.post('/', adminOnly, asyncHandler(async (req, res) => {
  const { user_id: userId, quantity, delivered_on: deliveredOn, notes } = req.body ?? {};
  ok(res, { delivery: bags.deliverBags({ userId, quantity, deliveredOn, notes }, req.user.id) }, 201);
}));

/** DELETE no implementado: el historial de entregas es solo de lectura */
router.delete('/:id', adminOnly, (req, res, next) => {
  next(ApiError.badRequest('Las entregas no se eliminan; registre una correccion con nota', { id: req.params.id }));
});

export default router;
