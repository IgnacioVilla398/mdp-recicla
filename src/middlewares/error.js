/** Manejo central de errores y 404 de la API. */
import { ApiError } from '../utils/http.js';
import config from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: `Endpoint no encontrado: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const status = error instanceof ApiError ? error.status : 500;
  if (status >= 500) console.error('[api-error]', error);

  res.status(status).json({
    ok: false,
    error: status >= 500 && config.env === 'production' ? 'Error interno del servidor' : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}
