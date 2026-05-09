import bcrypt from 'bcryptjs';
import redis, { keys } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { newToken, setSessionCookie, clearSessionCookie, getSessionUser } from '../lib/auth.js';
import { logError } from '../lib/observability.js';

const SESSION_TTL = 60 * 60 * 12;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const url = req.url || '';
    const action = url.includes('action=login') ? 'login'
      : url.includes('action=logout') ? 'logout'
      : url.includes('action=me') ? 'me'
      : url.includes('action=change-password') ? 'change-password'
      : null;

    if (action === 'me') {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'No autenticado' });
      return res.json({ ok: true, data: user });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' });
    }

    const body = await parseBody(req);

    if (action === 'login') {
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!username || !password) {
        return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos' });
      }

      // Rate limit: 8 intentos por usuario cada 15 min
      const attemptsKey = `mk:loginattempts:${username}`;
      const attempts = Number(await redis.get(attemptsKey)) || 0;
      if (attempts >= 8) {
        return res.status(429).json({ ok: false, error: 'Demasiados intentos. Intenta en 15 minutos o pídele a Brenda que reinicie tu contraseña.' });
      }

      const userId = await redis.get(keys.usuarioByUsername(username));
      // Hash dummy para uniformar timing si el usuario no existe (mitiga enumeration)
      const FAKE_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8RxEGz0Y3yA2hCJ3kF2EXAMPLEhash00';

      let user = null;
      let ok = false;
      if (userId) {
        user = await redis.get(keys.usuario(userId));
        if (user && user.activo) {
          ok = await bcrypt.compare(password, user.passwordHash);
        } else {
          await bcrypt.compare(password, FAKE_HASH); // mismo timing
        }
      } else {
        await bcrypt.compare(password, FAKE_HASH);
      }

      if (!ok) {
        // Incrementar contador con TTL 15min
        const newAttempts = await redis.incr(attemptsKey);
        if (newAttempts === 1) await redis.expire(attemptsKey, 60 * 15);
        return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
      }

      // Éxito: limpiar contador
      await redis.del(attemptsKey);

      const token = newToken();
      await redis.set(keys.session(token), user.id, { ex: SESSION_TTL });
      // Trackear sesiones del usuario (para invalidación masiva al cambiar pass)
      await redis.sadd(`mk:user:sessions:${user.id}`, token);
      setSessionCookie(res, token);
      const { passwordHash, ...safe } = user;
      return res.json({ ok: true, data: safe });
    }

    if (action === 'logout') {
      const cookies = (req.headers.cookie || '').split(';').reduce((a, p) => {
        const [k, v] = p.trim().split('='); if (k) a[k] = v; return a;
      }, {});
      const token = cookies['mk_session'];
      if (token) await redis.del(keys.session(token));
      clearSessionCookie(res);
      return res.json({ ok: true });
    }

    if (action === 'change-password') {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'No autenticado' });
      const { actual, nueva } = body;
      if (!actual || !nueva || String(nueva).length < 6) {
        return res.status(400).json({ ok: false, error: 'Contraseña nueva inválida (mínimo 6 caracteres)' });
      }
      const full = await redis.get(keys.usuario(user.id));
      const ok = await bcrypt.compare(actual, full.passwordHash);
      if (!ok) return res.status(400).json({ ok: false, error: 'Contraseña actual incorrecta' });
      full.passwordHash = await bcrypt.hash(nueva, 10);
      await redis.set(keys.usuario(user.id), full);

      // Invalidar todas las demás sesiones del usuario (la actual sigue siendo válida)
      const cookies = (req.headers.cookie || '').split(';').reduce((a, p) => {
        const [k, v] = p.trim().split('='); if (k) a[k] = v; return a;
      }, {});
      const currentToken = cookies['mk_session'];
      const sessionsKey = `mk:user:sessions:${user.id}`;
      const tokens = await redis.smembers(sessionsKey);
      for (const t of tokens) {
        if (t !== currentToken) {
          await redis.del(keys.session(t));
          await redis.srem(sessionsKey, t);
        }
      }

      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Acción no especificada (?action=login|logout|me|change-password)' });
  } catch (e) {
    await logError('api/auth', e, { method: req.method, url: req.url });
    return res.status(500).json({ ok: false, error: e.message });
  }
}
