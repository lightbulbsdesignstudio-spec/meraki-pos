import redis, { keys, newId } from '../lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      const ids = await redis.smembers(keys.clientes());
      if (!ids.length) return res.json({ ok: true, data: [] });
      const items = await Promise.all(ids.map(id => redis.get(keys.cliente(id))));
      return res.json({ ok: true, data: items.filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre)) });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const id = newId();
      const cliente = {
        id,
        nombre: body.nombre,
        tel: body.tel || '',
        email: body.email || '',
        salonFrecuente: body.salonFrecuente || '',
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
      const updated = { ...existing, nombre: body.nombre, tel: body.tel || '', email: body.email || '', salonFrecuente: body.salonFrecuente || '', notas: body.notas || '' };
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

async function parseBody(req) {
  if (req._body) return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}
