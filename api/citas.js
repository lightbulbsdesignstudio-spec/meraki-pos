import redis, { keys, newId } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { requireAuth } from '../lib/auth.js';

async function logEvento(cita, servicios) {
  try {
    const id = newId();
    const citaServicios = cita.servicios || (cita.servicioId ? [{ id: cita.servicioId }] : []);
    const svcObjs = citaServicios.map(s => servicios?.find(svc => svc.id === s.id)).filter(Boolean);
    const montoServicios = svcObjs.reduce((sum, s) => sum + Number(s.precio || 0), 0);
    const evento = {
      id,
      tipo: 'cobro',
      fecha: cita.fecha,
      hora: cita.hora,
      clienteId: cita.clienteId,
      servicios: citaServicios,
      servicioNombre: svcObjs.map(s => s.nombre).join(', '),
      tecnicaId: cita.tecnicaId,
      monto: cita.totalCobrado ?? montoServicios,
      metodoPago: cita.metodoPago || '',
      propina: cita.propina || 0,
      extras: cita.extras || 0,
      canalAgenda: cita.canalAgenda || 'salon',
      campana: cita.campana || '',
      creadoEn: new Date().toISOString(),
    };
    await redis.set(keys.evento(id), evento);
    await redis.sadd(keys.eventos(), id);
  } catch (e) {
    console.error('Error logging evento:', e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  // Borrado de cita: solo admin/socio (evita que una empleada borre cita ajena).
  const rolesRequeridos = req.method === 'DELETE' ? ['admin','socio'] : null;
  const blocked = await requireAuth(req, res, rolesRequeridos);
  if (blocked) return;

  try {
    if (req.method === 'GET') {
      const { fecha, all, tecnicaId } = req.query;

      if (all === '1') {
        const ids = await redis.smembers(keys.citas());
        if (!ids.length) return res.json({ ok: true, data: [] });
        const items = await Promise.all(ids.map(id => redis.get(keys.cita(id))));
        return res.json({ ok: true, data: items.filter(Boolean) });
      }

      if (fecha) {
        const ids = await redis.smembers(keys.citasFecha(fecha));
        if (!ids.length) return res.json({ ok: true, data: [] });
        const items = await Promise.all(ids.map(id => redis.get(keys.cita(id))));
        let data = items.filter(Boolean);
        if (tecnicaId) data = data.filter(c => c.tecnicaId === tecnicaId);
        return res.json({ ok: true, data });
      }

      return res.status(400).json({ ok: false, error: 'Parámetro fecha requerido' });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const servicios = body.servicios || (body.servicioId ? [{ id: body.servicioId }] : []);
      if (!body.fecha || !body.hora || !body.clienteId || !body.tecnicaId || servicios.length === 0) {
        return res.status(400).json({ ok: false, error: 'Faltan campos: fecha, hora, clienteId, tecnicaId, servicios (array con al menos 1 item)' });
      }
      const id = newId();
      const cita = {
        id,
        fecha: body.fecha,
        hora: body.hora,
        clienteId: body.clienteId,
        tecnicaId: body.tecnicaId,
        servicios,
        estado: body.estado || 'pendiente',
        notas: body.notas || '',
        canalAgenda: body.canalAgenda || 'salon',
        campana: body.campana || '',
        creadoEn: new Date().toISOString(),
      };
      await redis.set(keys.cita(id), cita);
      await redis.sadd(keys.citas(), id);
      await redis.sadd(keys.citasFecha(cita.fecha), id);
      return res.json({ ok: true, data: cita });
    }

    if (req.method === 'PUT') {
      if (!body.id) return res.status(400).json({ ok: false, error: 'id requerido' });
      const existing = await redis.get(keys.cita(body.id));
      if (!existing) return res.status(404).json({ ok: false, error: 'Cita no encontrada' });

      const editable = ['fecha','hora','clienteId','tecnicaId','servicios','servicioId','estado','notas',
        'canalAgenda','campana','totalCobrado','metodoPago','propina','extras','montoBase',
        'descuento','descuentoRazon','descuentoAutorizadoPor','descuentoLogPendiente'];
      const patch = {};
      for (const k of editable) if (k in body) patch[k] = body[k];

      if (patch.fecha && existing.fecha !== patch.fecha) {
        await redis.srem(keys.citasFecha(existing.fecha), body.id);
        await redis.sadd(keys.citasFecha(patch.fecha), body.id);
      }

      const updated = { ...existing, ...patch, id: existing.id, creadoEn: existing.creadoEn };
      await redis.set(keys.cita(body.id), updated);

      // Cliente devuelve total visitas completadas para loyalty check (visita 10/20/30)
      let totalVisitasCliente = null;
      if (patch.estado === 'completada' && existing.estado !== 'completada') {
        const servicioIds = await redis.smembers(keys.servicios());
        const servicios = servicioIds.length
          ? (await Promise.all(servicioIds.map(id => redis.get(keys.servicio(id))))).filter(Boolean)
          : [];
        await logEvento(updated, servicios);

        if (updated.clienteId) {
          const allIds = await redis.smembers(keys.citas());
          const items = allIds.length
            ? (await Promise.all(allIds.map(id => redis.get(keys.cita(id))))).filter(Boolean)
            : [];
          totalVisitasCliente = items.filter(c => c.clienteId === updated.clienteId && c.estado === 'completada').length;
        }
      }

      return res.json({ ok: true, data: updated, totalVisitasCliente });
    }

    if (req.method === 'DELETE') {
      if (!body.id) return res.status(400).json({ ok: false, error: 'id requerido' });
      const existing = await redis.get(keys.cita(body.id));
      if (existing) {
        await redis.srem(keys.citasFecha(existing.fecha), body.id);
        await redis.srem(keys.citas(), body.id);
        await redis.del(keys.cita(body.id));
      }
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
