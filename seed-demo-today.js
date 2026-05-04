// Asegura que HOY, AYER y MAÑANA tengan agenda visualmente activa (5-8 citas cada uno).
import { Redis } from '@upstash/redis';
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => n.toString().padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const random = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

async function main() {
  const cliIds = await redis.smembers('mk:clientes');
  const clientes = (await Promise.all(cliIds.map(id => redis.get(`mk:cliente:${id}`)))).filter(Boolean);
  const tecIds = await redis.smembers('mk:tecnicas');
  const tecs = (await Promise.all(tecIds.map(id => redis.get(`mk:tecnica:${id}`)))).filter(Boolean);
  const svcIds = await redis.smembers('mk:servicios');
  const svcs = (await Promise.all(svcIds.map(id => redis.get(`mk:servicio:${id}`)))).filter(Boolean);

  // Servicios populares para demo realista
  const populares = svcs.filter(s => /manicura gel|mani \+ pedi|pedicura gel|gel manos|francés deco/i.test(s.nombre));
  const pickSvc = () => populares.length ? random(populares) : random(svcs);

  const HOY = new Date();
  const AYER = new Date(HOY); AYER.setDate(HOY.getDate() - 1);
  const MANANA = new Date(HOY); MANANA.setDate(HOY.getDate() + 1);

  const dias = [
    { fecha: AYER, label: 'ayer', objetivo: 6 },
    { fecha: HOY, label: 'hoy', objetivo: 7 },
    { fecha: MANANA, label: 'mañana', objetivo: 5 },
  ];

  // Horarios distribuidos a lo largo del día
  const horariosBase = ['10:00','10:00','11:00','12:00','13:00','15:00','16:00','17:00','18:00','19:00'];

  for (const d of dias) {
    const fechaStr = fmt(d.fecha);
    const existing = await redis.smembers(`mk:citas:fecha:${fechaStr}`);
    const necesarias = Math.max(0, d.objetivo - existing.length);
    if (!necesarias) { console.log(`${d.label}: ya tiene ${existing.length}, sin agregar`); continue; }

    const usadas = new Set();
    const horarios = [...horariosBase].sort(() => Math.random() - 0.5);
    let agregadas = 0;
    for (let i = 0; i < horarios.length && agregadas < necesarias; i++) {
      const hora = horarios[i];
      const tec = random(tecs);
      const slot = `${tec.id}|${hora}`;
      if (usadas.has(slot)) continue;
      usadas.add(slot);

      const cliente = random(clientes);
      const servicio = pickSvc();
      const id = newId();
      const esFutura = d.fecha > HOY;
      const estado = esFutura ? (Math.random() < 0.7 ? 'confirmada' : 'pendiente')
                              : (Math.random() < 0.92 ? 'completada' : 'cancelada');

      const cita = {
        id, fecha: fechaStr, hora,
        clienteId: cliente.id, tecnicaId: tec.id, servicioId: servicio.id,
        estado, notas: '',
        canalAgenda: random(['salon','salon','whatsapp','instagram']),
        campana: '',
        creadoEn: new Date(d.fecha.getTime() - 86400000).toISOString(),
      };

      if (estado === 'completada') {
        const base = Number(servicio.precio);
        const propina = Math.random() < 0.5 ? Math.round(base * (0.05 + Math.random() * 0.12)) : 0;
        cita.metodoPago = Math.random() < 0.6 ? 'spei' : Math.random() < 0.85 ? 'efectivo' : 'tarjeta';
        cita.montoBase = base;
        cita.extras = [];
        cita.propina = propina;
        cita.descuento = 0;
        cita.totalCobrado = base + propina;

        const evtId = newId();
        await redis.set(`mk:evento:${evtId}`, {
          id: evtId, tipo:'cobro', fecha: fechaStr, hora,
          clienteId: cliente.id, servicioId: servicio.id, servicioNombre: servicio.nombre,
          tecnicaId: tec.id, monto: cita.totalCobrado, metodoPago: cita.metodoPago,
          propina, extras: 0, canalAgenda: cita.canalAgenda, campana: '',
          creadoEn: cita.creadoEn,
        });
        await redis.sadd('mk:eventos', evtId);
      }

      await redis.set(`mk:cita:${id}`, cita);
      await redis.sadd('mk:citas', id);
      await redis.sadd(`mk:citas:fecha:${fechaStr}`, id);
      agregadas++;
    }
    console.log(`${d.label} (${fechaStr}): tenía ${existing.length}, agregadas ${agregadas}, total ${existing.length + agregadas}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
