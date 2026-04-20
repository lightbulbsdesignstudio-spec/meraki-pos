import redis, { keys } from '../lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });

  const { periodo = 'mes' } = req.query;

  try {
    // Cargar datos
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

    // Filtrar por período
    const { desde, hasta, label } = getPeriodo(periodo);
    const citas = todasCitas.filter(c => c.fecha >= desde && c.fecha <= hasta);

    const completadas = citas.filter(c => c.estado === 'completada');
    const canceladas = citas.filter(c => c.estado === 'cancelada');
    const pendientes = citas.filter(c => c.estado === 'pendiente' || c.estado === 'confirmada');

    // Ingresos reales (totalCobrado si existe, sino precio del servicio)
    const getIngreso = (c) => {
      if (c.totalCobrado != null) return Number(c.totalCobrado);
      const svc = servicios.find(s => s.id === c.servicioId);
      return svc ? Number(svc.precio) : 0;
    };
    const ingresos = completadas.reduce((sum, c) => sum + getIngreso(c), 0);

    const ticketPromedio = completadas.length ? Math.round(ingresos / completadas.length) : 0;

    // Clientas nuevas en el período
    const clientasNuevas = clientes.filter(c => c.creadoEn && c.creadoEn >= desde).length;

    // Por salón
    const vsCompletadas = completadas.filter(c => c.salonId === 'vs');
    const jbCompletadas = completadas.filter(c => c.salonId === 'jb');
    const vsIngresos = vsCompletadas.reduce((s, c) => s + getIngreso(c), 0);
    const jbIngresos = jbCompletadas.reduce((s, c) => s + getIngreso(c), 0);
    const maxSalon = Math.max(vsIngresos, jbIngresos) || 1;
    const salonesData = [
      { id: 'vs', nombre: 'Vicente Suárez', citas: vsCompletadas.length, ingresos: vsIngresos, pct: Math.round(vsIngresos / maxSalon * 100) },
      { id: 'jb', nombre: 'Juan de la Barrera', citas: jbCompletadas.length, ingresos: jbIngresos, pct: Math.round(jbIngresos / maxSalon * 100) },
    ].filter(s => s.citas > 0);

    // Por técnica con comisión
    const tecnicasData = tecnicas.map(t => {
      const citasTec = completadas.filter(c => c.tecnicaId === t.id);
      const ing = citasTec.reduce((s, c) => s + getIngreso(c), 0);
      const comisionPct = t.comision || 0;
      const comisionMonto = Math.round(ing * comisionPct / 100);
      return { nombre: t.nombre, salonId: t.salonId, citas: citasTec.length, ingresos: ing, comisionPct, comisionMonto };
    }).filter(t => t.citas > 0).sort((a, b) => b.ingresos - a.ingresos);

    // Servicios top
    const svcCount = {};
    completadas.forEach(c => { svcCount[c.servicioId] = (svcCount[c.servicioId] || 0) + 1; });
    const serviciosData = Object.entries(svcCount)
      .map(([id, count]) => { const s = servicios.find(x => x.id === id); return s ? { nombre: s.nombre, count, precio: s.precio } : null; })
      .filter(Boolean).sort((a, b) => b.count - a.count).slice(0, 6);

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
      return { nombre: cli?.nombre || 'Desconocido', visitas: cits.length, gasto, ultimoServicio: ultimoSvc?.nombre || '—', salon: ultima?.salonId };
    }).sort((a, b) => b.visitas - a.visitas).slice(0, 10);

    // Desglose por método de pago
    const pagosContados = completadas.filter(c => c.metodoPago);
    const pagoEfectivo = pagosContados.filter(c => c.metodoPago === 'efectivo').reduce((s, c) => s + getIngreso(c), 0);
    const pagoTransferencia = pagosContados.filter(c => c.metodoPago === 'transferencia').reduce((s, c) => s + getIngreso(c), 0);
    const pagoTarjeta = pagosContados.filter(c => c.metodoPago === 'tarjeta').reduce((s, c) => s + getIngreso(c), 0);
    const sinRegistro = completadas.filter(c => !c.metodoPago).reduce((s, c) => s + getIngreso(c), 0);

    res.json({
      ok: true,
      data: {
        kpis: { citasCompletadas: completadas.length, ingresos, ticketPromedio, clientasNuevas, periodoLabel: label },
        salones: salonesData,
        tecnicas: tecnicasData,
        servicios: serviciosData,
        ocupacion: { completadas: completadas.length, canceladas: canceladas.length, pendientes: pendientes.length, total: citas.length },
        clientes: clientesData,
        pagos: { efectivo: pagoEfectivo, transferencia: pagoTransferencia, tarjeta: pagoTarjeta, sinRegistro },
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

  if (periodo === 'semana') {
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { desde: fmt(lunes), hasta: fmt(domingo), label: 'Esta semana' };
  }
  if (periodo === 'mes') {
    const desde = `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-01`;
    const hasta = fmt(hoy);
    return { desde, hasta, label: 'Este mes' };
  }
  if (periodo === 'mes_anterior') {
    const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { desde: fmt(mesAnt), hasta: fmt(ultimoDia), label: 'Mes anterior' };
  }
  // total
  return { desde: '2020-01-01', hasta: '2099-12-31', label: 'Todo el tiempo' };
}
