/** Validadores minimos sin dependencias externas. */
import { ApiError } from './http.js';

export const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
export const isDateOnly = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const isMonth = (value) => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);

/** Lanza ApiError 400 con la lista de campos invalidos. */
export function assertValid(errors) {
  const entries = Object.entries(errors).filter(([, message]) => Boolean(message));
  if (entries.length > 0) {
    throw ApiError.badRequest('Datos invalidos', Object.fromEntries(entries));
  }
}

/** Convierte un valor a numero positivo; devuelve NaN si no es valido. */
export function toPositiveNumber(value) {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/** Redondea a 2 decimales (dinero). */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Redondea a 3 decimales (kilos/gramos). */
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/** Normaliza strings opcionales: '' -> null. */
export const clean = (value) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

/** Fecha de hoy en formato YYYY-MM-DD (UTC). */
export const today = () => new Date().toISOString().slice(0, 10);

/** Mes actual en formato YYYY-MM. */
export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const WEEKDAY_NAMES = ['', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
