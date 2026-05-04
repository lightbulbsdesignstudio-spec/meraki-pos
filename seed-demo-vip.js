// Asegura que haya 1 clienta con 10+ visitas para mostrar el feature de premio lealtad.
import { Redis } from '@upstash/redis';
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => n.toString().padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const random = arr => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  const cliIds = await redis.smembers('mk:clientes');
  const cliRaw = await Promise.all(cliIds.map(id => redis.get(`mk:cliente:${id}`)));
  const clientes = cliRaw.filter(Boolean);
  if (!clientes.length) { console.error('Sin clientas'); return; }

  const tecIds = await redis.smembers('mk:tecnicas');
  const tecs = (await Promise.all(tecIds.map(id => redis.get(`mk:tecnica:${id}`)))).filter(Boolean);
  const svcIds = await redis.smembers('mk:servicios');
  const svcs = (await Promise.all(svcIds.map(id => redis.get(`mk:servicio:${id}`)))).filter(Boolean);

  // Buscar la clienta con más visitas y darle más
  const todasCitasIds = await redis.smembers('mk:citas');
  const todasCitas = (await Promise.all(todasCitasIds.map(id => redis.get(`mk:cita:${id}`)))).filter(Boolean);
  const counts = {};
  todasCitas.forEach(c => { if (c.estado === 'completada') counts[c.clienteId] = (counts[c.clienteId]||0) + 1; });

  // Tomar la top, forzarla a tener 10+
  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const [topId, topCount] = sorted[0] || [clientes[0].id, 0];
  const topCli = clientes.find(c => c.id === topId);
  const aAgregar = Math.max(0, 10 - topCount);
  console.log(`Cliente VIP: ${topCli.nombre} tiene ${topCount} visitas, agregando ${aAgregar} más para llegar a 10`);

  const HOY = new Date();
  for (let i = 0; i < aAgregar; i++) {
    const fecha = new Date(HOY); fecha.setDate(HOY.getDate() - (60 + i * 3));
    const fechaStr = fmt(fecha);
    const tec = random(tecs);
    const svc = random(svcs.filter(s => /gel|manicura|pedicura/i.test(s.nombre || '')));
    const id = newId();
    const cita = {
      id, fecha: fechaStr, hora: '11:00',
      clienteId: topId, tecnicaId: tec.id, servicioId: svc.id,
      estado: 'completada', notas: '', canalAgenda: 'salon', campana: '',
      metodoPago: 'spei',
      montoBase: Number(svc.precio),
      extras: [],
      propina: 50,
      descuento: 0,
      totalCobrado: Number(svc.precio) + 50,
      creadoEn: new Date(fecha.getTime() - 86400000).toISOString(),
    };
    await redis.set(`mk:cita:${id}`, cita);
    await redis.sadd('mk:citas', id);
    await redis.sadd(`mk:citas:fecha:${fechaStr}`, id);

    const evtId = newId();
    await redis.set(`mk:evento:${evtId}`, {
      id: evtId, tipo:'cobro', fecha:fechaStr, hora:'11:00', clienteId: topId,
      servicioId: svc.id, servicioNombre: svc.nombre, tecnicaId: tec.id,
      monto: cita.totalCobrado, metodoPago:'spei', propina:50, extras:0,
      canalAgenda:'salon', campana:'', creadoEn: cita.creadoEn,
    });
    await redis.sadd('mk:eventos', evtId);
  }
  console.log(`✓ ${topCli.nombre} ahora tiene 10+ visitas — VIP con premio lealtad activo`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
