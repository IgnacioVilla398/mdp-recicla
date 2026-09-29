/** Rutas de solicitudes de cobro: /api/payouts */
import { Router } from 'express';
import { asyncHandler, ok, ApiError } from '../utils/http.js';
import { authenticate, adminOnly, clientOnly } from '../middlewares/auth.js';
import * as payouts from '../services/payouts.service.js';
import config from '../config/env.js';

const router = Router();
router.use(authenticate);

/** GET /api/payouts/config — reglas visibles para el vecino */
router.get('/config', (req, res) => {
  ok(res, { min_payout_amount: config.minPayoutAmount });
});

/** GET /api/payouts — el vecino ve las propias; el admin filtra por estado */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    offset: req.query.offset,
  };
  if (req.user.role === 'client') filters.userId = req.user.id;
  else if (req.query.user_id) filters.userId = req.query.user_id;
  ok(res, payouts.listPayouts(filters));
}));

/** GET /api/payouts/overview — panel de cobros (admin) */
router.get('/overview', adminOnly, asyncHandler(async (req, res) => {
  ok(res, payouts.payoutsOverview());
}));

/** POST /api/payouts — el vecino solicita el cobro de su saldo */
router.post('/', clientOnly, asyncHandler(async (req, res) => {
  const { amount, payout_method: method, payout_value: value, payout_holder: holder, period_month: periodMonth } = req.body ?? {};
  ok(res, { payout: payouts.createPayoutRequest(req.user.id, { amount, method, value, holder, periodMonth }) }, 201);
}));

/** GET /api/payouts/:id */
router.get('/:id', asyncHandler(async (req, res) => {
  const payout = payouts.getPayout(req.params.id);
  if (req.user.role === 'client' && payout.user_id !== req.user.id) throw ApiError.forbidden('Esa solicitud no te pertenece');
  ok(res, { payout });
}));

/** POST /api/payouts/:id/cancel — el vecino cancela su solicitud pendiente */
router.post('/:id/cancel', clientOnly, asyncHandler(async (req, res) => {
  ok(res, { payout: payouts.cancelPayout(req.params.id, req.user.id) });
}));

/** PATCH /api/payouts/:id — el admin aprueba, rechaza o marca como pagada */
router.patch('/:id', adminOnly, asyncHandler(async (req, res) => {
  const { action, admin_notes: adminNotes, receipt_url: receiptUrl } = req.body ?? {};
  ok(res, { payout: payouts.reviewPayout(req.params.id, { action, adminNotes, receiptUrl }, req.user.id) });
}));

export default router;
