import redis, { keys, newId } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { requireAuth } from '../lib/auth.js';
import { logError, logAudit } from '../lib/observability.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      const blocked = await requireAuth(req, res);
      if (blocked) return;
      const { fecha, desde, hasta } = req.query;

      let ids = [];
      if (fecha) {
        ids = await redis.smembers(keys.descuentosFecha(fecha));
      } else {
        ids = await redis.smembers(keys.descuentos());
      }
      if (!ids.length) return res.json({ ok: true, data: [] });
      const items = (await Promise.all(ids.map(id => redis.get(keys.descuento(id))))).filter(Boolean);
      let data = items;
      if (desde) data = data.filter(d => d.fecha >= desde);
      if (hasta) data = data.filter(d => d.fecha <= hasta);
      data.sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));
      return res.json({ ok: true, data });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const blocked = await requireAuth(req, res);
      if (blocked) return;
      const requeridos = ['citaId', 'monto', 'razon', 'autorizadoPor', 'via'];
      for (const k of requeridos) {
        if (!body[k] && body[k] !== 0) {
          return res.status(400).json({ ok: false, error: `Campo requerido: ${k}` });
        }
      }
      const id = newId();
      const now = new Date();
      const fecha = (body.fecha || now.toISOString().slice(0, 10));
      const descuento = {
        id,
        citaId: body.citaId,
        clienteId: body.clienteId || '',
        servicioId: body.servicioId || '',
        servicios: body.servicios || [],
        tecnicaId: body.tecnicaId || '',
        montoOriginal: Number(body.montoOriginal) || 0,
        monto: Number(body.monto) || 0, // monto del descuento aplicado
        montoFinal: Number(body.montoFinal) || 0,
        razon: String(body.razon).slice(0, 200),
        autorizadoPor: String(body.autorizadoPor).slice(0, 100),
        via: String(body.via).slice(0, 50), // 'whatsapp' | 'voz' | 'presencial' | 'pendiente'
        capturadoPor: req.user?.username || '',
        capturadoPorNombre: req.user?.nombre || '',
        fecha,
        creadoEn: now.toISOString(),
      };
      await redis.set(keys.descuento(id), descuento);
      await redis.sadd(keys.descuentos(), id);
      await redis.sadd(keys.descuentosFecha(fecha), id);
      await logAudit({ actor: req.user, action: 'descuento.create', resource: 'descuento', resourceId: id, after: descuento });
      return res.json({ ok: true, data: descuento });
    }

    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    await logError('api/descuentos', e, { method: req.method });
    return res.status(500).json({ ok: false, error: e.message });
  }
}
