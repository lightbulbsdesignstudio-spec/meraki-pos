import bcrypt from 'bcryptjs';
import redis, { keys, newId } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { requireAuth, ROLES } from '../lib/auth.js';

function sanitize(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      // Listado: solo admin
      const blocked = await requireAuth(req, res, ['admin']);
      if (blocked) return;
      const ids = await redis.smembers(keys.usuarios());
      if (!ids.length) return res.json({ ok: true, data: [] });
      const items = await Promise.all(ids.map(id => redis.get(keys.usuario(id))));
      return res.json({ ok: true, data: items.filter(Boolean).map(sanitize) });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const blocked = await requireAuth(req, res, ['admin']);
      if (blocked) return;
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const nombre = String(body.nombre || '').trim();
      const rol = String(body.rol || '').trim();

      if (!username || !password || !nombre || !rol) {
        return res.status(400).json({ ok: false, error: 'Faltan campos: username, password, nombre, rol' });
      }
      if (!ROLES.includes(rol)) return res.status(400).json({ ok: false, error: 'Rol inválido' });
      if (password.length < 6) return res.status(400).json({ ok: false, error: 'Contraseña mínimo 6 caracteres' });

      const existing = await redis.get(keys.usuarioByUsername(username));
      if (existing) return res.status(400).json({ ok: false, error: 'Username ya existe' });

      const id = newId();
      const user = {
        id,
        username,
        nombre,
        rol,
        email: body.email || '',
        tel: body.tel || '',
        activo: true,
        passwordHash: await bcrypt.hash(password, 10),
        creadoEn: new Date().toISOString(),
      };
      await redis.set(keys.usuario(id), user);
      await redis.set(keys.usuarioByUsername(username), id);
      await redis.sadd(keys.usuarios(), id);
      return res.json({ ok: true, data: sanitize(user) });
    }

    if (req.method === 'PUT') {
      const blocked = await requireAuth(req, res, ['admin']);
      if (blocked) return;
      if (!body.id) return res.status(400).json({ ok: false, error: 'id requerido' });
      const existing = await redis.get(keys.usuario(body.id));
      if (!existing) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

      const editable = ['nombre', 'rol', 'email', 'tel', 'activo'];
      const patch = {};
      for (const k of editable) if (k in body) patch[k] = body[k];
      if (patch.rol && !ROLES.includes(patch.rol)) {
        return res.status(400).json({ ok: false, error: 'Rol inválido' });
      }

      const updated = { ...existing, ...patch };

      if (body.password && String(body.password).length >= 6) {
        updated.passwordHash = await bcrypt.hash(String(body.password), 10);
      }

      await redis.set(keys.usuario(body.id), updated);
      return res.json({ ok: true, data: sanitize(updated) });
    }

    if (req.method === 'DELETE') {
      const blocked = await requireAuth(req, res, ['admin']);
      if (blocked) return;
      if (!body.id) return res.status(400).json({ ok: false, error: 'id requerido' });
      if (req.user && req.user.id === body.id) {
        return res.status(400).json({ ok: false, error: 'No puedes borrarte a ti mismo' });
      }
      const existing = await redis.get(keys.usuario(body.id));
      if (existing) {
        await redis.del(keys.usuario(body.id));
        await redis.del(keys.usuarioByUsername(existing.username));
        await redis.srem(keys.usuarios(), body.id);
      }
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
