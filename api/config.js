import redis, { keys, newId } from '../lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const { tipo } = req.method === 'GET' ? req.query : (await parseBody(req));

  try {
    if (req.method === 'GET') {
      if (tipo === 'tecnicas') {
        const ids = await redis.smembers(keys.tecnicas());
        if (!ids.length) return res.json({ ok: true, data: [] });
        const items = await Promise.all(ids.map(id => redis.get(keys.tecnica(id))));
        return res.json({ ok: true, data: items.filter(Boolean) });
      }
      if (tipo === 'servicios') {
        const ids = await redis.smembers(keys.servicios());
        if (!ids.length) return res.json({ ok: true, data: [] });
        const items = await Promise.all(ids.map(id => redis.get(keys.servicio(id))));
        return res.json({ ok: true, data: items.filter(Boolean) });
      }
      return res.status(400).json({ ok: false, error: 'tipo requerido' });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const id = newId();
      if (body.tipo === 'tecnica') {
        const obj = { id, nombre: body.nombre, salonId: body.salonId, tel: body.tel || '', activa: body.activa !== false, comision: Number(body.comision) || 0 };
        await redis.set(keys.tecnica(id), obj);
        await redis.sadd(keys.tecnicas(), id);
        return res.json({ ok: true, data: obj });
      }
      if (body.tipo === 'servicio') {
        const obj = { id, nombre: body.nombre, precio: body.precio, duracion: body.duracion, categoria: body.categoria, desc: body.desc || '' };
        await redis.set(keys.servicio(id), obj);
        await redis.sadd(keys.servicios(), id);
        return res.json({ ok: true, data: obj });
      }
    }

    if (req.method === 'PUT') {
      if (body.tipo === 'tecnica') {
        const existing = await redis.get(keys.tecnica(body.id));
        if (!existing) return res.status(404).json({ ok: false, error: 'No encontrado' });
        const obj = { ...existing, nombre: body.nombre, salonId: body.salonId, tel: body.tel || '', activa: body.activa !== false, comision: Number(body.comision) || 0 };
        await redis.set(keys.tecnica(body.id), obj);
        return res.json({ ok: true, data: obj });
      }
      if (body.tipo === 'servicio') {
        const existing = await redis.get(keys.servicio(body.id));
        if (!existing) return res.status(404).json({ ok: false, error: 'No encontrado' });
        const obj = { ...existing, nombre: body.nombre, precio: body.precio, duracion: body.duracion, categoria: body.categoria, desc: body.desc || '' };
        await redis.set(keys.servicio(body.id), obj);
        return res.json({ ok: true, data: obj });
      }
    }

    if (req.method === 'DELETE') {
      if (body.tipo === 'servicio') {
        await redis.del(keys.servicio(body.id));
        await redis.srem(keys.servicios(), body.id);
        return res.json({ ok: true });
      }
      if (body.tipo === 'tecnica') {
        await redis.del(keys.tecnica(body.id));
        await redis.srem(keys.tecnicas(), body.id);
        return res.json({ ok: true });
      }
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
