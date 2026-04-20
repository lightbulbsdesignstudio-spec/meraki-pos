import redis, { keys, newId } from '../lib/redis.js';

async function notificarWaitlist(cita) {
  try {
    const ids = await redis.smembers(keys.waitlist(cita.fecha, cita.hora, cita.tecnicaId));
    if (!ids.length) return;
    const items = await Promise.all(ids.map(id => redis.get(keys.waitlistItem(id))));
    const sorted = items.filter(Boolean).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    const primero = sorted[0];
    if (!primero?.clienteTel) return;
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER } = process.env;
    if (!TWILIO_ACCOUNT_SID) return;
    const hora12 = (() => {
      const [h, m] = cita.hora.split(':');
      const hr = parseInt(h);
      return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'pm' : 'am'}`;
    })();
    const msg = `Hola ${primero.clienteNombre?.split(' ')[0] || ''}! 💅 Se liberó un lugar para el ${cita.fecha} a las ${hora12}. ¿Quieres tu cita? Responde SÍ para apartar tu lugar. — N de Nails`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const body = new URLSearchParams({ From: TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886', To: `whatsapp:${primero.clienteTel}`, Body: msg });
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64') }, body });
  } catch (e) {
    console.error('Error notificando waitlist:', e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      const { fecha, all, salon, tecnicaId } = req.query;

      if (all === '1') {
        // Todas las citas (para reportes y clientes)
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
        if (salon) data = data.filter(c => c.salonId === salon);
        if (tecnicaId) data = data.filter(c => c.tecnicaId === tecnicaId);
        return res.json({ ok: true, data });
      }

      return res.status(400).json({ ok: false, error: 'Parámetro fecha requerido' });
    }

    const body = await parseBody(req);

    if (req.method === 'POST') {
      const id = newId();
      const cita = {
        id,
        fecha: body.fecha,
        hora: body.hora,
        clienteId: body.clienteId,
        tecnicaId: body.tecnicaId,
        servicioId: body.servicioId,
        salonId: body.salonId,
        estado: body.estado || 'pendiente',
        notas: body.notas || '',
        creadoEn: new Date().toISOString(),
      };
      await redis.set(keys.cita(id), cita);
      await redis.sadd(keys.citas(), id);
      await redis.sadd(keys.citasFecha(cita.fecha), id);
      return res.json({ ok: true, data: cita });
    }

    if (req.method === 'PUT') {
      const existing = await redis.get(keys.cita(body.id));
      if (!existing) return res.status(404).json({ ok: false, error: 'Cita no encontrada' });

      // Si cambió la fecha, actualizar índices
      if (existing.fecha !== body.fecha) {
        await redis.srem(keys.citasFecha(existing.fecha), body.id);
        await redis.sadd(keys.citasFecha(body.fecha), body.id);
      }

      const updated = { ...existing, ...body, id: body.id };
      await redis.set(keys.cita(body.id), updated);
      // Si se canceló, notificar al primero en waitlist
      if (body.estado === 'cancelada' && existing.estado !== 'cancelada') {
        notificarWaitlist(existing).catch(() => {});
      }
      return res.json({ ok: true, data: updated });
    }

    if (req.method === 'DELETE') {
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

async function parseBody(req) {
  if (req._body) return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}
