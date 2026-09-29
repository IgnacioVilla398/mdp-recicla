/** Rutas de autenticacion: /api/auth */
import { Router } from 'express';
import { asyncHandler, ok } from '../utils/http.js';
import { authenticate } from '../middlewares/auth.js';
import config from '../config/env.js';
import * as authService from '../services/auth.service.js';

const router = Router();
const COOKIE_NAME = 'mdp_token';

function setSessionCookie(res, token) {
  const maxAge = 7 * 24 * 3600;
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (config.env === 'production') attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

/** POST /api/auth/register — alta de vecino (autorregistro) */
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, phone, address, neighborhood_id: neighborhoodId } = req.body ?? {};
  const { user, token } = authService.register({ name, email, password, phone, address, neighborhoodId });
  setSessionCookie(res, token);
  ok(res, { user, token }, 201);
}));

/** POST /api/auth/login */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  const { user, token } = authService.login({ email, password });
  setSessionCookie(res, token);
  ok(res, { user, token });
}));

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  res.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  ok(res, { logged_out: true });
});

/** GET /api/auth/me */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  ok(res, { user: authService.serializeUser(req.user) });
}));

/** PATCH /api/auth/me — actualizar perfil y datos de cobro */
router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const { name, phone, address, neighborhood_id, payout } = req.body ?? {};
  ok(res, { user: authService.updateProfile(req.user.id, { name, phone, address, neighborhoodId: neighborhood_id, payout }) });
}));

/** POST /api/auth/change-password */
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { current_password: currentPassword, new_password: newPassword } = req.body ?? {};
  ok(res, authService.changePassword(req.user.id, { currentPassword, newPassword }));
}));

export default router;
