import redis, { keys, newId } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const blocked = await requireAuth(req, res);
  if (blocked) return;

  try {
    if (req.method === 'GET') {
      const ids = await redis.smembers(keys.clientes());
      if (!ids.length) return res.json({ ok: true, data: [] });
      const items = await Promise.all(ids.map(id => redis.get(keys.cliente(id))));
      return res.json({ ok: true, data: items.filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const id = newId();
      const cliente = {
        id,
        nombre: body.nombre,
        tel: body.tel || '',
        email: body.email || '',
        colonia: body.colonia || '',        // geospatial/marketing
        cp: body.cp || '',                  // geospatial/marketing
        canalOrigen: body.canalOrigen || 'salon', // salon/instagram/facebook/referido/google
        referidoPor: body.referidoPor || '',       // clienteId quien refirió
        notas: body.notas || '',
        creadoEn: new Date().toISOString(),
      };
      await redis.set(keys.cliente(id), cliente);
      await redis.sadd(keys.clientes(), id);
      return res.json({ ok: true, data: cliente });
    }

    if (req.method === 'PUT') {
      const existing = await redis.get(keys.cliente(body.id));
      if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
      const updated = {
        ...existing,
        nombre: body.nombre,
        tel: body.tel || '',
        email: body.email || '',
        colonia: body.colonia || existing.colonia || '',
        cp: body.cp || existing.cp || '',
        canalOrigen: body.canalOrigen || existing.canalOrigen || 'salon',
        referidoPor: body.referidoPor || existing.referidoPor || '',
        notas: body.notas || '',
      };
      await redis.set(keys.cliente(body.id), updated);
      return res.json({ ok: true, data: updated });
    }

    if (req.method === 'DELETE') {
      await redis.del(keys.cliente(body.id));
      await redis.srem(keys.clientes(), body.id);
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
