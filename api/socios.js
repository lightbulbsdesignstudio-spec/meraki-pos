import redis, { keys, newId } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  // Lectura: solo admin y socios (no empleadas — datos financieros sensibles). Mutaciones: solo admin.
  const blocked = await requireAuth(req, res, req.method === 'GET' ? ['admin','socio'] : ['admin']);
  if (blocked) return;

  try {
    if (req.method === 'GET') {
      const [config, citaIds, servicioIds] = await Promise.all([
        redis.get(keys.inversion()),
        redis.smembers(keys.citas()),
        redis.smembers(keys.servicios()),
      ]);

      const [citasRaw, serviciosRaw] = await Promise.all([
        citaIds.length ? Promise.all(citaIds.map(id => redis.get(keys.cita(id)))) : [],
        servicioIds.length ? Promise.all(servicioIds.map(id => redis.get(keys.servicio(id)))) : [],
      ]);

      const citas = citasRaw.filter(Boolean);
      const servicios = serviciosRaw.filter(Boolean);
      const completadas = citas.filter(c => c.estado === 'completada');

      const getIngreso = (c) => {
        if (c.totalCobrado != null) return Number(c.totalCobrado);
        const citaServicios = c.servicios || (c.servicioId ? [{id: c.servicioId}] : []);
        const monto = citaServicios.reduce((sum, s) => {
          const svc = servicios.find(x => x.id === s.id);
          return sum + (svc ? Number(svc.precio) : 0);
        }, 0);
        return monto;
      };

      const ingresoTotal = completadas.reduce((s, c) => s + getIngreso(c), 0);
      const inversionTotal = config?.total || 0;
      const recuperado = Math.min(ingresoTotal, inversionTotal);
      const pendiente = Math.max(inversionTotal - ingresoTotal, 0);
      const pctRecuperado = inversionTotal > 0 ? Math.round((ingresoTotal / inversionTotal) * 100) : 0;

      // Costos fijos mensuales
      const costosFijos = config?.costosFijos || {};
      const rentaMensual = costosFijos.renta || 0;
      const sueldosMensual = (costosFijos.sueldosSemana || 0) * 4.33;
      const insumosMensual = costosFijos.insumos || 0;
      const costoFijoMensual = rentaMensual + sueldosMensual + insumosMensual;

      // Ingresos por mes
      const pad = n => n.toString().padStart(2, '0');
      const ingresosPorMes = {};
      completadas.forEach(c => {
        const mes = c.fecha?.slice(0, 7);
        if (mes) ingresosPorMes[mes] = (ingresosPorMes[mes] || 0) + getIngreso(c);
      });

      // Proyección de recuperación
      const mesesConData = Object.keys(ingresosPorMes).sort();
      const avgMensual = mesesConData.length > 0
        ? Object.values(ingresosPorMes).reduce((s, v) => s + v, 0) / mesesConData.length
        : 0;
      const utilidadNeta = avgMensual - costoFijoMensual;
      const mesesRestantes = utilidadNeta > 0 && pendiente > 0
        ? Math.ceil(pendiente / utilidadNeta)
        : null;

      return res.json({
        ok: true,
        data: {
          inversion: {
            total: inversionTotal,
            recuperado: ingresoTotal,
            pendiente,
            pctRecuperado,
            fechaInicio: config?.fecha,
            socios: config?.socios || [],
          },
          costosFijos: {
            rentaMensual,
            sueldosMensual: Math.round(sueldosMensual),
            insumosMensual,
            total: Math.round(costoFijoMensual),
          },
          operacion: {
            citasCompletadas: completadas.length,
            ingresoTotal,
            avgMensual: Math.round(avgMensual),
            utilidadNetaMensual: Math.round(utilidadNeta),
            mesesParaRecuperar: mesesRestantes,
          },
          ingresosPorMes,
        }
      });
    }

    // PUT — actualizar configuración de inversión
    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const existing = await redis.get(keys.inversion()) || {};
      const updated = { ...existing, ...body };
      await redis.set(keys.inversion(), updated);
      return res.json({ ok: true, data: updated });
    }

    // POST — registrar aportación adicional
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const id = newId();
      const aportacion = {
        id,
        fecha: body.fecha || new Date().toISOString().slice(0, 10),
        monto: Number(body.monto),
        concepto: body.concepto || 'Aportación adicional',
        socio: body.socio || '',
        creadoEn: new Date().toISOString(),
      };
      await redis.set(keys.aportacion(id), aportacion);
      await redis.sadd(keys.aportaciones(), id);
      return res.json({ ok: true, data: aportacion });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
