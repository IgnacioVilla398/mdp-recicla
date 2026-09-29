/** Errores HTTP tipados y helpers de respuesta. */

export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) { return new ApiError(400, message, details); }
  static unauthorized(message = 'No autenticado') { return new ApiError(401, message); }
  static forbidden(message = 'No tenes permisos para esta accion') { return new ApiError(403, message); }
  static notFound(message = 'Recurso no encontrado') { return new ApiError(404, message); }
  static conflict(message, details) { return new ApiError(409, message, details); }
}

/** Envuelve un handler async para que los errores lleguen al middleware de errores. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Respuesta exitosa estandar. */
export const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
