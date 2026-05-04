import crypto from 'crypto';
import redis, { keys } from './redis.js';

const COOKIE_NAME = 'mk_session';
const SESSION_TTL = 60 * 60 * 12; // 12h

export function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  });
  return out;
}

export function setSessionCookie(res, token) {
  const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const userId = await redis.get(keys.session(token));
  if (!userId) return null;
  const user = await redis.get(keys.usuario(userId));
  // Si el usuario fue desactivado o borrado, invalidar la sesión inmediatamente
  if (!user || user.activo === false) {
    await redis.del(keys.session(token));
    return null;
  }
  await redis.expire(keys.session(token), SESSION_TTL);
  const { passwordHash, ...safe } = user;
  return safe;
}

/**
 * Middleware. Devuelve null si autorizado, o un response object para retornar.
 * Uso: const guard = await requireAuth(req, res, ['admin','socio']); if (guard) return;
 */
export async function requireAuth(req, res, allowedRoles = null) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'No autenticado' });
    return true;
  }
  if (allowedRoles && !allowedRoles.includes(user.rol)) {
    res.status(403).json({ ok: false, error: 'Sin permiso' });
    return true;
  }
  req.user = user;
  return false;
}

export const ROLES = ['admin', 'socio', 'empleada'];
