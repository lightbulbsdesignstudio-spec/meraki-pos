import Anthropic from '@anthropic-ai/sdk';
import redis, { keys, newId } from '../lib/redis.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Función para enviar mensaje por WhatsApp via Twilio ─────────────────────
async function enviarWhatsApp(to, mensaje) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return { ok: false, error: 'Twilio no configurado' };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams({ From: TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886', To: `whatsapp:${to}`, Body: mensaje });
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64') }, body });
  const data = await resp.json();
  return resp.ok ? { ok: true } : { ok: false, error: data.message };
}

// ─── Clasificar mensaje con Claude ──────────────────────────────────────────
async function clasificarMensaje(texto, tieneImagen, servicios, historial, contexto) {
  const { tecnicas = [], citasHoy = [], fechaHoy = '' } = contexto || {};

  const ocupadas = citasHoy.map(c => {
    const tec = tecnicas.find(t => t.id === c.tecnicaId);
    return c.hora + (tec ? ` (${tec.nombre})` : '');
  }).join(', ') || 'ninguna aún';

  const systemPrompt = `Eres el asistente de "N de Nails", salón de uñas en CDMX. Dos sucursales: Vicente Suárez y Juan de la Barrera.

TONO — así habla el salón realmente (copia este estilo, no lo inventes):
- "Claro, ¿para cuándo?"
- "Sí tenemos espacio, te esperamos a las 6:30 💅"
- "¿Es retoque o servicio nuevo?"
- "Con gusto, tenemos disponibilidad. ¿Con quién quieres tu cita?"
- "Hola, en cuanto lleguen las niñas te decimos precio"
Regla: máximo 2 oraciones. Nunca digas "N de Nails" al final. Cero despedidas formales.

SERVICIOS (nombres reales que usan las clientas):
- Calcio / Reyeno de calcio / Retoque de calcio: ~$350
- Gel color / Manicura gel: desde $250
- Paquete manos y pies gel básico: $400
- Diseños especiales: $100–$500 según complejidad
${servicios.length ? servicios.map(s => `- ${s.nombre}: $${s.precio}`).join('\n') : ''}

TÉCNICAS DEL SALÓN:
${tecnicas.length ? tecnicas.map(t => `- ${t.nombre}`).join('\n') : '(sin datos)'}

DISPONIBILIDAD HOY (${fechaHoy}):
Citas ocupadas: ${ocupadas}
Para otros días: dile que confirmará disponibilidad un asesor.

CATEGORÍAS:
- "cita": quiere agendar, reagendar, cancelar, o pregunta si hay espacio/horario
- "precio": pregunta por precios o qué servicios hay
- "diseno": manda imagen para cotización (SOLO si hay imagen adjunta)
- "confirmacion": está confirmando su cita
- "otro": saludo, agradecimiento, mensaje genérico

REGLAS CRÍTICAS:
- Si mencionan a una técnica por nombre → verifica si está en la lista y confirma
- Si preguntan disponibilidad hoy → usa los datos de arriba para responder con seguridad
- Si hay imagen → clasifica como "diseno", NO cotices precio, di solo que la recibiste
- Para "diseno": { "categoria": "diseno" } sin campo respuesta

RESPONDE SIEMPRE en JSON:
{ "categoria": "cita|precio|diseno|confirmacion|otro", "respuesta": "texto" }
Solo diseño: { "categoria": "diseno" }`;

  const historialMsgs = (historial || []).slice(-6).map(m => ({
    role: m.tipo === 'in' ? 'user' : 'assistant',
    content: m.texto || ''
  })).filter(m => m.content);

  const content = [];
  if (tieneImagen) content.push({ type: 'text', text: '[La clienta mandó imagen(es) de diseño de uñas]' });
  if (texto) content.push({ type: 'text', text: texto });
  if (!content.length) content.push({ type: 'text', text: '[mensaje vacío]' });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: systemPrompt,
    messages: [...historialMsgs, { role: 'user', content }],
  });

  try {
    const raw = response.content[0].text.trim();
    return JSON.parse(raw);
  } catch {
    return { categoria: 'otro', respuesta: 'Hola! Gracias por escribirnos. ¿En qué te podemos ayudar? 💅' };
  }
}

// ─── Analizar imagen de diseño con Claude Vision ─────────────────────────────
async function analizarDiseno(mediaUrl, servicios) {
  try {
    // Descargar la imagen como base64
    const imgResp = await fetch(mediaUrl);
    const buffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';

    // Calcular rango de precios según servicios disponibles
    const precioBase = servicios.reduce((s, x) => s + Number(x.precio), 0) / (servicios.length || 1);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: contentType, data: base64 }
          },
          {
            type: 'text',
            text: `Analiza este diseño de uñas para cotizarlo. Responde SOLO en JSON:
{
  "descripcion": "descripción breve del diseño en español (20-30 palabras)",
  "complejidad": "baja|media|alta|muy alta",
  "elementos": ["elemento1", "elemento2"],
  "precioMin": número,
  "precioMax": número,
  "notas": "observaciones para la técnica"
}

Precios de referencia del salón:
${servicios.map(s => `- ${s.nombre}: $${s.precio}`).join('\n')}

Base de precio promedio: $${Math.round(precioBase)}
Para complejidad baja: precio base x0.8
Para complejidad media: precio base x1.0 a 1.3
Para complejidad alta: precio base x1.5 a 2.0
Para complejidad muy alta: precio base x2.0 a 3.0`
          }
        ]
      }]
    });

    const raw = response.content[0].text.trim();
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      descripcion: parsed.descripcion,
      complejidad: parsed.complejidad,
      elementos: parsed.elementos || [],
      precioMin: parsed.precioMin,
      precioMax: parsed.precioMax,
      notas: parsed.notas || '',
    };
  } catch (e) {
    console.error('Error analizando diseño:', e);
    return { ok: false, descripcion: 'Diseño recibido', complejidad: 'media', precioMin: 300, precioMax: 600, notas: '' };
  }
}

// ─── HANDLER PRINCIPAL ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    // ── GET: listar conversaciones / cola ─────────────────────────────────
    if (req.method === 'GET') {
      const { tipo } = req.query;
      if (tipo === 'queue') {
        const ids = await redis.smembers(keys.waQueue());
        if (!ids.length) return res.json({ ok: true, data: [] });
        const items = await Promise.all(ids.map(id => redis.get(keys.waItem(id))));
        const data = items.filter(Boolean).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return res.json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: 'tipo requerido' });
    }

    const body = await parseBody(req);

    // ── POST: webhook Twilio ─────────────────────────────────────────────
    if (req.method === 'POST' && !body.accion) {
      return handleTwilioWebhook(req, res, body);
    }

    // ── POST: acciones internas (cotizar, responder, leer) ────────────────
    if (req.method === 'POST' && body.accion) {
      const item = await redis.get(keys.waItem(body.id));
      if (!item) return res.status(404).json({ ok: false, error: 'Conversación no encontrada' });

      if (body.accion === 'cotizar') {
        const msgCotiz = body.mensaje || `Tu diseño queda en $${body.precio}. ¿Te agendamos? 💅`;
        // Enviar por WhatsApp
        await enviarWhatsApp(item.phone, msgCotiz);
        // Agregar mensaje al historial
        const updated = {
          ...item,
          estado: 'respondido',
          mensajes: [...(item.mensajes || []), { tipo: 'out', texto: msgCotiz, timestamp: Date.now() }],
          precioCotizado: body.precio,
        };
        await redis.set(keys.waItem(body.id), updated);
        return res.json({ ok: true });
      }

      if (body.accion === 'responder') {
        await enviarWhatsApp(item.phone, body.mensaje);
        const updated = {
          ...item,
          ultimoMensaje: body.mensaje,
          mensajes: [...(item.mensajes || []), { tipo: 'out', texto: body.mensaje, timestamp: Date.now() }],
        };
        await redis.set(keys.waItem(body.id), updated);
        return res.json({ ok: true });
      }

      if (body.accion === 'leer') {
        await redis.set(keys.waItem(body.id), { ...item, leido: true });
        return res.json({ ok: true });
      }
    }

    // ── PUT: actualizar item ──────────────────────────────────────────────
    if (req.method === 'PUT') {
      const item = await redis.get(keys.waItem(body.id));
      if (!item) return res.status(404).json({ ok: false, error: 'No encontrado' });
      await redis.set(keys.waItem(body.id), { ...item, ...body });
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}

// ─── Manejar webhook entrante de Twilio ──────────────────────────────────────
async function handleTwilioWebhook(req, res, body) {
  // Twilio envía form-encoded; si viene como string, parsear
  let data = body;
  if (typeof body === 'string') {
    data = Object.fromEntries(new URLSearchParams(body));
  }

  const phone = (data.From || '').replace('whatsapp:', '');
  const texto = data.Body || '';
  const nombre = data.ProfileName || phone;

  // Recolectar todas las imágenes que Twilio envía (MediaUrl0, MediaUrl1, ...)
  const mediaUrls = [];
  for (let i = 0; data[`MediaUrl${i}`]; i++) mediaUrls.push(data[`MediaUrl${i}`]);
  const mediaUrl = mediaUrls[0] || null;
  const tieneImagen = mediaUrls.length > 0;

  if (!phone) return res.status(400).json({ ok: false, error: 'Sin número' });

  // Cargar o crear sesión
  const sessionKey = keys.waSession(phone);
  const session = (await redis.get(sessionKey)) || { phone, nombre, mensajes: [] };

  // Agregar mensaje entrante al historial
  const msgEntrada = { tipo: 'in', texto, mediaUrl, timestamp: Date.now() };
  session.mensajes = [...(session.mensajes || []).slice(-20), msgEntrada];

  // Cargar catálogos para contexto de la IA
  const [svcIds, tecnicaIds] = await Promise.all([
    redis.smembers(keys.servicios()),
    redis.smembers(keys.tecnicas()),
  ]);
  const [svcItems, tecnicaItems] = await Promise.all([
    svcIds.length ? Promise.all(svcIds.map(id => redis.get(keys.servicio(id)))) : [],
    tecnicaIds.length ? Promise.all(tecnicaIds.map(id => redis.get(keys.tecnica(id)))) : [],
  ]);
  const servicios = svcItems.filter(Boolean);
  const tecnicas = tecnicaItems.filter(t => t && t.activa !== false);

  // Disponibilidad del día actual
  const fechaHoy = new Date().toISOString().split('T')[0];
  const citasHoyIds = await redis.smembers(keys.citasFecha(fechaHoy));
  const citasHoyItems = citasHoyIds.length ? await Promise.all(citasHoyIds.map(id => redis.get(keys.cita(id)))) : [];
  const citasHoy = citasHoyItems.filter(c => c && c.estado !== 'cancelada');

  // Clasificar con Claude (con contexto de disponibilidad)
  const clasificacion = await clasificarMensaje(texto, tieneImagen, servicios, session.mensajes, { tecnicas, citasHoy, fechaHoy });

  if (clasificacion.categoria === 'diseno') {
    // ── FLUJO DISEÑO: enqueue para Cha ──────────────────────────────────
    let analisis = { ok: false, descripcion: 'Diseño recibido', precioMin: 300, precioMax: 600 };
    if (mediaUrl) {
      analisis = await analizarDiseno(mediaUrl, servicios);
    }

    const itemId = newId();
    const item = {
      id: itemId,
      phone,
      nombre,
      tipo: 'diseno',
      estado: 'pendiente',
      leido: false,
      timestamp: Date.now(),
      ultimoMensaje: `📸 ${mediaUrls.length > 1 ? mediaUrls.length + ' diseños' : 'Diseño especial'}`,
      mensajes: [msgEntrada],
      analisisIA: `${analisis.descripcion} · Complejidad: ${analisis.complejidad}${analisis.notas ? ' · ' + analisis.notas : ''}`,
      precioSugerido: `$${analisis.precioMin}–$${analisis.precioMax}`,
      mediaUrl,
      mediaUrls,
    };
    await redis.set(keys.waItem(itemId), item);
    await redis.sadd(keys.waQueue(), itemId);

    // Confirmar recepción a la clienta
    const confirmacion = 'Hola! Recibimos tu diseño 💅 Lo revisamos y en unos minutos te enviamos el precio. ¡Gracias por elegirnos!';
    await enviarWhatsApp(phone, confirmacion);
    session.mensajes.push({ tipo: 'bot', texto: confirmacion, timestamp: Date.now() });

  } else {
    // ── FLUJO AUTOMÁTICO: responder con IA ──────────────────────────────
    const respuesta = clasificacion.respuesta || 'Gracias por contactarnos. En breve te atendemos. 💅';
    await enviarWhatsApp(phone, respuesta);
    session.mensajes.push({ tipo: 'bot', texto: respuesta, timestamp: Date.now() });

    // Actualizar o crear item en cola
    const existingIds = await redis.smembers(keys.waQueue());
    let existingId = null;
    for (const id of existingIds) {
      const item = await redis.get(keys.waItem(id));
      if (item && item.phone === phone && item.tipo !== 'diseno') { existingId = id; break; }
    }

    if (existingId) {
      const existing = await redis.get(keys.waItem(existingId));
      await redis.set(keys.waItem(existingId), {
        ...existing,
        ultimoMensaje: texto,
        leido: false,
        timestamp: Date.now(),
        mensajes: [...(existing.mensajes || []).slice(-30), msgEntrada, { tipo: 'bot', texto: respuesta, timestamp: Date.now() }],
      });
    } else {
      const itemId = newId();
      await redis.set(keys.waItem(itemId), {
        id: itemId, phone, nombre,
        tipo: clasificacion.categoria || 'otro',
        estado: 'activo', leido: false,
        timestamp: Date.now(), ultimoMensaje: texto,
        mensajes: [msgEntrada, { tipo: 'bot', texto: respuesta, timestamp: Date.now() }],
      });
      await redis.sadd(keys.waQueue(), itemId);
    }
  }

  // Guardar sesión actualizada
  await redis.set(sessionKey, session, { ex: 86400 * 7 }); // 7 días

  // Twilio espera XML o 200 vacío
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

async function parseBody(req) {
  if (req._body) return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch {
        try { resolve(Object.fromEntries(new URLSearchParams(data))); }
        catch { resolve({}); }
      }
    });
  });
}
