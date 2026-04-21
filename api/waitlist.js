import redis, { keys, newId } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      const { fecha, hora, tecnicaId } = req.query;
      if (!fecha || !hora || !tecnicaId) return res.status(400).json({ ok: false, error: 'fecha, hora y tecnicaId requeridos' });
      const ids = await redis.smembers(keys.waitlist(fecha, hora, tecnicaId));
      if (!ids.length) return res.json({ ok: true, data: [] });
      const items = await Promise.all(ids.map(id => redis.get(keys.waitlistItem(id))));
      const sorted = items.filter(Boolean).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
      return res.json({ ok: true, data: sorted });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const { fecha, hora, clienteId, clienteNombre, clienteTel, servicioId } = body;
      const tecnicaId = body.tecnicaId || 'cualquiera';
      if (!fecha || !hora || !clienteId) return res.status(400).json({ ok: false, error: 'Campos requeridos faltantes' });
      const id = newId();
      const item = { id, fecha, hora, tecnicaId, clienteId, clienteNombre, clienteTel, servicioId, creadoEn: new Date().toISOString() };
      await redis.set(keys.waitlistItem(id), item);
      await redis.sadd(keys.waitlist(fecha, hora, tecnicaId), id);
      return res.json({ ok: true, data: item });
    }

    if (req.method === 'DELETE') {
      const { id, fecha, hora } = body;
      const tecnicaId = body.tecnicaId || 'cualquiera';
      await redis.del(keys.waitlistItem(id));
      await redis.srem(keys.waitlist(fecha, hora, tecnicaId), id);
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}

