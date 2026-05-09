import redis, { keys } from '../lib/redis.js';
import { requireAuth } from '../lib/auth.js';
import { logError } from '../lib/observability.js';

// Endpoint para el ecosistema Claude de Meraki
// Devuelve datos ricos para análisis de marketing, geoespacial y social ROI
// Acceso por sesión (admin/socios) o por API key futura (cuando exista el ecosistema)
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });

  // Bypass futuro: header x-api-key === process.env.ANALYTICS_API_KEY (cuando el ecosistema lo necesite)
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.ANALYTICS_API_KEY;
  if (!(expectedKey && apiKey && apiKey === expectedKey)) {
    const blocked = await requireAuth(req, res, ['admin', 'socio']);
    if (blocked) return;
  }

  const { desde, hasta, limit = '100' } = req.query;

  try {
    const [citaIds, clienteIds, tecnicaIds, servicioIds, eventoIds] = await Promise.all([
      redis.smembers(keys.citas()),
      redis.smembers(keys.clientes()),
      redis.smembers(keys.tecnicas()),
      redis.smembers(keys.servicios()),
      redis.smembers(keys.eventos()),
    ]);

    const [citasRaw, clientesRaw, tecnicasRaw, serviciosRaw, eventosRaw] = await Promise.all([
      citaIds.length ? Promise.all(citaIds.map(id => redis.get(keys.cita(id)))) : [],
      clienteIds.length ? Promise.all(clienteIds.map(id => redis.get(keys.cliente(id)))) : [],
      tecnicaIds.length ? Promise.all(tecnicaIds.map(id => redis.get(keys.tecnica(id)))) : [],
      servicioIds.length ? Promise.all(servicioIds.map(id => redis.get(keys.servicio(id)))) : [],
      eventoIds.length ? Promise.all(eventoIds.map(id => redis.get(keys.evento(id)))) : [],
    ]);

    const citas = citasRaw.filter(Boolean);
    const clientes = clientesRaw.filter(Boolean);
    const tecnicas = tecnicasRaw.filter(Boolean);
    const servicios = serviciosRaw.filter(Boolean);
    let eventos = eventosRaw.filter(Boolean).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

    // Filtro de fecha si se especifica
    if (desde) eventos = eventos.filter(e => e.fecha >= desde);
    if (hasta) eventos = eventos.filter(e => e.fecha <= hasta);
    const eventosSlice = eventos.slice(0, Number(limit));

    // Perfil de clientes enriquecido
    const clientesCitas = {};
    citas.filter(c => c.estado === 'completada').forEach(c => {
      if (!clientesCitas[c.clienteId]) clientesCitas[c.clienteId] = [];
      clientesCitas[c.clienteId].push(c);
    });

    const clientesPerfil = clientes.map(cli => {
      const historial = clientesCitas[cli.id] || [];
      const gasto = historial.reduce((s, c) => s + (c.totalCobrado ?? 0), 0);
      const ultimaVisita = historial.length
        ? historial.sort((a, b) => b.fecha.localeCompare(a.fecha))[0].fecha
        : null;
      const diasSinVisita = ultimaVisita
        ? Math.floor((Date.now() - new Date(ultimaVisita).getTime()) / 86400000)
        : null;
      return {
        id: cli.id,
        nombre: cli.nombre,
        tel: cli.tel,
        colonia: cli.colonia || '',
        cp: cli.cp || '',
        canalOrigen: cli.canalOrigen || 'salon',
        referidoPor: cli.referidoPor || '',
        visitas: historial.length,
        ltv: gasto,
        ultimaVisita,
        diasSinVisita,
        enRiesgo: diasSinVisita != null && diasSinVisita > 60,
        esVip: historial.length >= 5,
        creadoEn: cli.creadoEn,
      };
    });

    // Breakdown por canal de origen (para ROI de marketing)
    const canalesOrigen = {};
    clientes.forEach(c => {
      const canal = c.canalOrigen || 'salon';
      canalesOrigen[canal] = (canalesOrigen[canal] || 0) + 1;
    });

    // Breakdown por colonia (para geoespacial)
    const colonias = {};
    clientes.filter(c => c.colonia).forEach(c => {
      colonias[c.colonia] = (colonias[c.colonia] || 0) + 1;
    });

    // Tendencia diaria de ingresos (últimos 30 días)
    const hoy = new Date();
    const tendencia = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(hoy); d.setDate(hoy.getDate() - i);
      const key = d.toISOString().slice(0,10);
      tendencia[key] = { fecha: key, ingresos: 0, citas: 0 };
    }
    citas.filter(c => c.estado === 'completada' && tendencia[c.fecha]).forEach(c => {
      tendencia[c.fecha].ingresos += c.totalCobrado ?? 0;
      tendencia[c.fecha].citas += 1;
    });

    res.json({
      ok: true,
      data: {
        resumen: {
          totalClientes: clientes.length,
          totalCitas: citas.length,
          totalEventos: eventos.length,
          totalTecnicas: tecnicas.length,
          totalServicios: servicios.length,
        },
        clientes: clientesPerfil,
        tecnicas,
        servicios,
        eventos: eventosSlice,
        canalesOrigen,
        colonias,
        tendencia30dias: Object.values(tendencia).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      }
    });
  } catch (e) {
    await logError('api/analytics', e, { method: req.method, query: req.query });
    res.status(500).json({ ok: false, error: e.message });
  }
}
