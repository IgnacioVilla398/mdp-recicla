/** Rutas de materiales y precios: /api/materials */
import { Router } from 'express';
import { asyncHandler, ok } from '../utils/http.js';
import { authenticate, adminOnly, optionalAuth } from '../middlewares/auth.js';
import * as materials from '../services/materials.service.js';

const router = Router();

/** GET /api/materials?include_inactive=1 — precio vigente por kilo */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const includeInactive = req.user?.role === 'admin' && ['1', 'true'].includes(String(req.query.include_inactive));
  ok(res, { items: materials.listMaterials({ includeInactive }) });
}));

/** GET /api/materials/:id */
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  ok(res, { material: materials.getMaterial(req.params.id) });
}));

/** GET /api/materials/:id/history — historial de precios */
router.get('/:id/history', authenticate, adminOnly, asyncHandler(async (req, res) => {
  ok(res, { items: materials.priceHistory(req.params.id) });
}));

/** POST /api/materials — crear material (admin) */
router.post('/', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { name, category, unit, price_per_kg: pricePerKg, description } = req.body ?? {};
  ok(res, { material: materials.createMaterial({ name, category, unit, pricePerKg, description }, req.user.id) }, 201);
}));

/** PATCH /api/materials/:id — actualizar precio/datos (admin) */
router.patch('/:id', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { name, category, unit, price_per_kg: pricePerKg, description, is_active: isActive } = req.body ?? {};
  ok(res, { material: materials.updateMaterial(req.params.id, { name, category, unit, pricePerKg, description, isActive }, req.user.id) });
}));

export default router;
