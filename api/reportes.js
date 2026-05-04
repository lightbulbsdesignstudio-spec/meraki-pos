import redis, { keys } from '../lib/redis.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  const blocked = await requireAuth(req, res);
  if (blocked) return;

  const { periodo = 'mes' } = req.query;

  try {
    const [citaIds, clienteIds, tecnicaIds, servicioIds] = await Promise.all([
      redis.smembers(keys.citas()),
      redis.smembers(keys.clientes()),
      redis.smembers(keys.tecnicas()),
      redis.smembers(keys.servicios()),
    ]);

    const [citasRaw, clientesRaw, tecnicasRaw, serviciosRaw] = await Promise.all([
      citaIds.length ? Promise.all(citaIds.map(id => redis.get(keys.cita(id)))) : [],
      clienteIds.length ? Promise.all(clienteIds.map(id => redis.get(keys.cliente(id)))) : [],
      tecnicaIds.length ? Promise.all(tecnicaIds.map(id => redis.get(keys.tecnica(id)))) : [],
      servicioIds.length ? Promise.all(servicioIds.map(id => redis.get(keys.servicio(id)))) : [],
    ]);

    const todasCitas = citasRaw.filter(Boolean);
    const clientes = clientesRaw.filter(Boolean);
    const tecnicas = tecnicasRaw.filter(Boolean);
    const servicios = serviciosRaw.filter(Boolean);

    const { desde, hasta, label } = getPeriodo(periodo);
    const citas = todasCitas.filter(c => c.fecha >= desde && c.fecha <= hasta);

    const completadas = citas.filter(c => c.estado === 'completada');
    const canceladas = citas.filter(c => c.estado === 'cancelada');
    const pendientes = citas.filter(c => c.estado === 'pendiente' || c.estado === 'confirmada');

    const getIngreso = (c) => {
      if (c.totalCobrado != null) return Number(c.totalCobrado);
      const svc = servicios.find(s => s.id === c.servicioId);
      return svc ? Number(svc.precio) : 0;
    };
    const ingresos = completadas.reduce((sum, c) => sum + getIngreso(c), 0);
    const ticketPromedio = completadas.length ? Math.round(ingresos / completadas.length) : 0;

    const clientasNuevas = clientes.filter(c => c.creadoEn && c.creadoEn >= desde).length;

    // Por técnica con comisión
    const tecnicasData = tecnicas.map(t => {
      const citasTec = completadas.filter(c => c.tecnicaId === t.id);
      const ing = citasTec.reduce((s, c) => s + getIngreso(c), 0);
      const comisionPct = t.comision || 0;
      const comisionMonto = Math.round(ing * comisionPct / 100);
      return { nombre: t.nombre, citas: citasTec.length, ingresos: ing, comisionPct, comisionMonto };
    }).filter(t => t.citas > 0).sort((a, b) => b.ingresos - a.ingresos);

    // Servicios top
    const svcCount = {};
    completadas.forEach(c => { svcCount[c.servicioId] = (svcCount[c.servicioId] || 0) + 1; });
    const serviciosData = Object.entries(svcCount)
      .map(([id, count]) => { const s = servicios.find(x => x.id === id); return s ? { nombre: s.nombre, count, precio: s.precio } : null; })
      .filter(Boolean).sort((a, b) => b.count - a.count).slice(0, 8);

    // Clientes top
    const clientesCitas = {};
    completadas.forEach(c => {
      if (!clientesCitas[c.clienteId]) clientesCitas[c.clienteId] = [];
      clientesCitas[c.clienteId].push(c);
    });
    const clientesData = Object.entries(clientesCitas).map(([id, cits]) => {
      const cli = clientes.find(x => x.id === id);
      const gasto = cits.reduce((s, c) => s + getIngreso(c), 0);
      const ultima = cits.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      const ultimoSvc = servicios.find(s => s.id === ultima?.servicioId);
      return { nombre: cli?.nombre || 'Desconocido', visitas: cits.length, gasto, ultimoServicio: ultimoSvc?.nombre || '—' };
    }).sort((a, b) => b.visitas - a.visitas).slice(0, 10);

    // Desglose por método de pago
    const pagoEfectivo = completadas.filter(c => c.metodoPago === 'efectivo').reduce((s, c) => s + getIngreso(c), 0);
    const pagoTransferencia = completadas.filter(c => c.metodoPago === 'transferencia').reduce((s, c) => s + getIngreso(c), 0);
    const pagoTarjeta = completadas.filter(c => c.metodoPago === 'tarjeta').reduce((s, c) => s + getIngreso(c), 0);
    const sinRegistro = completadas.filter(c => !c.metodoPago).reduce((s, c) => s + getIngreso(c), 0);

    // Canal de agenda (para ecosistema marketing)
    const canalSalon = completadas.filter(c => !c.canalAgenda || c.canalAgenda === 'salon').length;
    const canalWhatsapp = completadas.filter(c => c.canalAgenda === 'whatsapp').length;
    const canalInstagram = completadas.filter(c => c.canalAgenda === 'instagram').length;
    const canalOtro = completadas.filter(c => c.canalAgenda && !['salon','whatsapp','instagram'].includes(c.canalAgenda)).length;

    res.json({
      ok: true,
      data: {
        kpis: { citasCompletadas: completadas.length, ingresos, ticketPromedio, clientasNuevas, periodoLabel: label, desde, hasta },
        tecnicas: tecnicasData,
        servicios: serviciosData,
        ocupacion: { completadas: completadas.length, canceladas: canceladas.length, pendientes: pendientes.length, total: citas.length },
        clientes: clientesData,
        pagos: { efectivo: pagoEfectivo, transferencia: pagoTransferencia, tarjeta: pagoTarjeta, sinRegistro },
        canales: { salon: canalSalon, whatsapp: canalWhatsapp, instagram: canalInstagram, otro: canalOtro },
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}

function getPeriodo(periodo) {
  const hoy = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (periodo === 'dia' || periodo === 'hoy') {
    return { desde: fmt(hoy), hasta: fmt(hoy), label: 'Hoy' };
  }
  if (periodo === 'ayer') {
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    return { desde: fmt(ayer), hasta: fmt(ayer), label: 'Ayer' };
  }
  if (periodo === 'semana') {
    const diasDesdeL = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1;
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - diasDesdeL);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { desde: fmt(lunes), hasta: fmt(domingo), label: 'Esta semana' };
  }
  if (periodo === 'mes') {
    const desde = `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-01`;
    return { desde, hasta: fmt(hoy), label: 'Este mes' };
  }
  if (periodo === 'mes_anterior') {
    const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { desde: fmt(mesAnt), hasta: fmt(ultimoDia), label: 'Mes anterior' };
  }
  if (periodo === 'anio' || periodo === 'año' || periodo === 'year') {
    const desde = `${hoy.getFullYear()}-01-01`;
    return { desde, hasta: fmt(hoy), label: `Año ${hoy.getFullYear()}` };
  }
  return { desde: '2020-01-01', hasta: '2099-12-31', label: 'Todo el tiempo' };
}
