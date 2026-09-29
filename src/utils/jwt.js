/**
 * JWT HS256 implementado con node:crypto (sin dependencias externas).
 */
import crypto from 'node:crypto';
import config from '../config/env.js';

const b64url = (input) => Buffer.from(input).toString('base64url');
const fromB64url = (input) => Buffer.from(input, 'base64url').toString('utf8');

/** Convierte '7d' | '12h' | '30m' | '45s' | 3600 a segundos. */
export function parseDuration(value, fallbackSeconds = 604800) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const match = /^(\d+)\s*([smhd])?$/i.exec(String(value ?? '').trim());
  if (!match) return fallbackSeconds;
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return amount * factor;
}

/** Firma un token con los claims indicados. */
export function signToken(payload, { secret = config.jwtSecret, expiresIn = config.jwtExpiresIn } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + parseDuration(expiresIn),
  }));
  const data = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/** Verifica firma y expiracion. Devuelve el payload o null. */
export function verifyToken(token, { secret = config.jwtSecret } = {}) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromB64url(body));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export default { signToken, verifyToken, parseDuration };
