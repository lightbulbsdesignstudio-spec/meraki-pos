// seed-demo.js
// Pobla la base con un mes de operación realista para demo a Brenda y socios.
// Borra solo data operativa antes de sembrar (no toca técnicas, servicios, usuarios, config).
// Para resetear a día cero después: node reset-to-day-zero.js

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => n.toString().padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const random = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ─── PERFILES DE CLIENTAS REALISTAS (CDMX) ───────────────────────────
const NOMBRES_FEM = [
  'Andrea Morales','Sofía Ramírez','Valeria Hernández','Camila Torres','Daniela López',
  'Fernanda Ruiz','Regina Castillo','Ximena Ortega','Renata Vázquez','Mariana Flores',
  'Paulina Mendoza','Isabela Rojas','Natalia Cruz','Alejandra Pérez','Gabriela Soto',
  'Karla Romero','Andrea Jiménez','Laura Domínguez','Ana Guzmán','Jimena Aguilar',
  'Vanessa Reyes','Brenda Salinas','Mónica Cervantes','Patricia Núñez','Lourdes Cabrera',
  'María José Téllez','Ana Sofía Garza','Diana Marín','Lucía Vega','Sandra Estrada',
];
const COLONIAS_CDMX = [
  { nombre:'Roma Norte', cp:'06700' }, { nombre:'Condesa', cp:'06140' },
  { nombre:'Polanco', cp:'11560' }, { nombre:'Del Valle', cp:'03100' },
  { nombre:'Narvarte', cp:'03020' }, { nombre:'Coyoacán', cp:'04000' },
  { nombre:'San Ángel', cp:'01000' }, { nombre:'Escandón', cp:'11800' },
  { nombre:'Santa María la Ribera', cp:'06400' }, { nombre:'Juárez', cp:'06600' },
  { nombre:'Anzures', cp:'11590' }, { nombre:'Nápoles', cp:'03810' },
  { nombre:'Roma Sur', cp:'06760' }, { nombre:'Hipódromo', cp:'06100' },
  { nombre:'Mixcoac', cp:'03910' },
];
const CANALES = ['instagram','instagram','instagram','referido','referido','salon','google','facebook'];

const DESCUENTOS_RAZONES = [
  'Cliente frecuente',
  'Compensación por retraso del servicio anterior',
  'Paquete mani + pedi del mes',
  'Promo cumpleaños',
  'Recomendación a 3 amigas',
  'Servicio combinado con extras',
];

// Pesos por día de la semana (0=domingo). Refleja patrón real de salón.
const PESO_DIA = [0.3, 0.4, 0.5, 0.6, 0.8, 1.4, 1.6]; // dom...sab

// Pesos por hora del día
const HORARIOS = [
  { hora: '10:00', peso: 0.8 },
  { hora: '11:00', peso: 1.0 },
  { hora: '12:00', peso: 1.2 },
  { hora: '13:00', peso: 0.7 },
  { hora: '14:00', peso: 0.5 },
  { hora: '15:00', peso: 0.6 },
  { hora: '16:00', peso: 1.1 },
  { hora: '17:00', peso: 1.4 },
  { hora: '18:00', peso: 1.3 },
  { hora: '19:00', peso: 0.9 },
];

function pickHora() {
  const total = HORARIOS.reduce((s, h) => s + h.peso, 0);
  let r = Math.random() * total;
  for (const h of HORARIOS) { if ((r -= h.peso) < 0) return h.hora; }
  return '10:00';
}

function pickServicio(servicios) {
  // Bias hacia los más populares de salón de uñas: gel, manicura gel, mani+pedi
  const pesos = servicios.map(s => {
    const n = (s.nombre || '').toLowerCase();
    if (n.includes('gel') && n.includes('mani')) return 3;
    if (n.includes('mani+pedi')) return 2.5;
    if (n.includes('manicura')) return 2;
    if (n.includes('pedicura')) return 1.6;
    if (n.includes('refuerzo')) return 1.3;
    if (n.includes('extensión') || n.includes('extension')) return 1.2;
    if (n.includes('francés') || n.includes('frances')) return 1;
    if (n.includes('depil') || n.includes('ceja') || n.includes('bozo') || n.includes('patilla') || n.includes('barbilla')) return 0.6;
    return 0.7;
  });
  const total = pesos.reduce((s, x) => s + x, 0);
  let r = Math.random() * total;
  for (let i = 0; i < servicios.length; i++) {
    if ((r -= pesos[i]) < 0) return servicios[i];
  }
  return servicios[0];
}

function pickMetodoPago() {
  const r = Math.random();
  if (r < 0.6) return 'spei';
  if (r < 0.9) return 'efectivo';
  return 'tarjeta';
}

function genTel() {
  return '55' + randInt(10000000, 99999999).toString();
}

async function main() {
  console.log('=== Meraki Demo Seed — Mes de operación sintética ===\n');

  // 1. Limpiar solo data operativa
  console.log('Limpiando data operativa previa...');
  await limpiarOperativa();

  // 2. Cargar técnicas y servicios existentes
  const tecIds = await redis.smembers('mk:tecnicas');
  const tecs = (await Promise.all(tecIds.map(id => redis.get(`mk:tecnica:${id}`)))).filter(Boolean);
  if (!tecs.length) { console.error('No hay técnicas. Corre seed.js primero.'); return; }

  const svcIds = await redis.smembers('mk:servicios');
  const svcs = (await Promise.all(svcIds.map(id => redis.get(`mk:servicio:${id}`)))).filter(Boolean);
  if (!svcs.length) { console.error('No hay servicios. Corre seed.js primero.'); return; }

  console.log(`✓ ${tecs.length} técnicas y ${svcs.length} servicios cargados.\n`);

  // 3. Crear ~30 clientas
  console.log('Creando 30 clientas...');
  const clientes = [];
  const nombresShuffled = [...NOMBRES_FEM].sort(() => Math.random() - 0.5).slice(0, 30);
  for (let i = 0; i < nombresShuffled.length; i++) {
    const id = newId();
    const colonia = random(COLONIAS_CDMX);
    const canal = random(CANALES);
    const cli = {
      id,
      nombre: nombresShuffled[i],
      tel: genTel(),
      email: nombresShuffled[i].toLowerCase().replace(/\s/g, '.').replace(/í/g,'i').replace(/á/g,'a').replace(/é/g,'e').replace(/ó/g,'o').replace(/ú/g,'u').replace(/ñ/g,'n') + '@gmail.com',
      colonia: colonia.nombre,
      cp: colonia.cp,
      canalOrigen: canal,
      referidoPor: '',
      notas: '',
      creadoEn: new Date(Date.now() - randInt(15, 45) * 86400000).toISOString(),
    };
    await redis.set(`mk:cliente:${id}`, cli);
    await redis.sadd('mk:clientes', id);
    clientes.push(cli);
  }
  console.log(`✓ ${clientes.length} clientas creadas.\n`);

  // 4. Generar 30 días de citas
  const HOY = new Date();
  const INICIO = new Date(HOY); INICIO.setDate(HOY.getDate() - 29);

  let totalCitas = 0;
  let totalCompletadas = 0;
  let totalDescuentos = 0;
  const visitsByCliente = {};

  console.log('Generando 30 días de citas...');
  for (let d = 0; d < 30; d++) {
    const fecha = new Date(INICIO);
    fecha.setDate(INICIO.getDate() + d);
    const fechaStr = fmtDate(fecha);
    const peso = PESO_DIA[fecha.getDay()];
    const numCitas = Math.round(peso * randInt(3, 6)); // 1 a 10 citas por día según patrón

    for (let c = 0; c < numCitas; c++) {
      const id = newId();
      const cliente = random(clientes);
      const tecnica = random(tecs);
      const servicio = pickServicio(svcs);
      const hora = pickHora();
      const esFutura = fecha > HOY;

      // Estado:
      // - Futuras: pendiente/confirmada
      // - Pasadas: 88% completada, 6% cancelada, 6% no_asistio (modelado como cancelada)
      let estado;
      if (esFutura) {
        estado = Math.random() < 0.7 ? 'confirmada' : 'pendiente';
      } else {
        const r = Math.random();
        estado = r < 0.88 ? 'completada' : 'cancelada';
      }

      const canalAgenda = Math.random() < 0.55 ? 'salon'
        : Math.random() < 0.7 ? 'whatsapp'
        : Math.random() < 0.85 ? 'instagram'
        : 'salon';

      const cita = {
        id,
        fecha: fechaStr,
        hora,
        clienteId: cliente.id,
        tecnicaId: tecnica.id,
        servicioId: servicio.id,
        estado,
        notas: Math.random() < 0.2 ? random(['Color rojo','Diseño francés','Decoración floral','Color nude','Mismo del mes pasado','Glitter dorado']) : '',
        canalAgenda,
        campana: '',
        creadoEn: new Date(fecha.getTime() - randInt(1, 6) * 86400000).toISOString(),
      };

      // Si completada: agregar datos de cobro
      if (estado === 'completada') {
        const montoBase = Number(servicio.precio);
        const tieneExtras = Math.random() < 0.18;
        const extras = tieneExtras ? [{ desc: random(['Diseño extra','Glitter','Stickers']), precio: randInt(50, 150) }] : [];
        const totalExtras = extras.reduce((s,e) => s + e.precio, 0);

        const tienePropina = Math.random() < 0.45;
        const propina = tienePropina ? Math.round((montoBase + totalExtras) * (0.05 + Math.random() * 0.15)) : 0;

        const tieneDescuento = Math.random() < 0.08; // ~8% de citas con descuento
        let descMonto = 0, descRazon = '', descAutPor = '', descVia = '';
        if (tieneDescuento) {
          descMonto = Math.round((montoBase + totalExtras) * (0.10 + Math.random() * 0.15));
          descRazon = random(DESCUENTOS_RAZONES);
          descAutPor = 'Brenda';
          descVia = random(['whatsapp','whatsapp','whatsapp','voz','presencial']);
          totalDescuentos++;
        }

        cita.metodoPago = pickMetodoPago();
        cita.montoBase = montoBase;
        cita.extras = extras;
        cita.propina = propina;
        cita.descuento = descMonto;
        cita.descuentoRazon = descRazon;
        cita.descuentoAutorizadoPor = descAutPor;
        cita.totalCobrado = Math.max(0, montoBase + totalExtras - descMonto) + propina;

        totalCompletadas++;
        visitsByCliente[cliente.id] = (visitsByCliente[cliente.id] || 0) + 1;

        // Crear evento
        const eventoId = newId();
        const evento = {
          id: eventoId,
          tipo: 'cobro',
          fecha: fechaStr,
          hora,
          clienteId: cliente.id,
          servicioId: servicio.id,
          servicioNombre: servicio.nombre,
          tecnicaId: tecnica.id,
          monto: cita.totalCobrado,
          metodoPago: cita.metodoPago,
          propina,
          extras: totalExtras,
          canalAgenda,
          campana: '',
          creadoEn: cita.creadoEn,
        };
        await redis.set(`mk:evento:${eventoId}`, evento);
        await redis.sadd('mk:eventos', eventoId);

        // Crear registro de descuento si aplica
        if (tieneDescuento) {
          const descId = newId();
          const desc = {
            id: descId,
            citaId: id,
            clienteId: cliente.id,
            servicioId: servicio.id,
            tecnicaId: tecnica.id,
            montoOriginal: montoBase + totalExtras,
            monto: descMonto,
            montoFinal: cita.totalCobrado,
            montoFinalSinPropina: Math.max(0, montoBase + totalExtras - descMonto),
            razon: descRazon,
            autorizadoPor: descAutPor,
            via: descVia,
            capturadoPor: random(['brenda','moni_demo','sofi_demo']),
            capturadoPorNombre: random(['Brenda','Moni','Sofi']),
            fecha: fechaStr,
            creadoEn: cita.creadoEn,
          };
          await redis.set(`mk:descuento:${descId}`, desc);
          await redis.sadd('mk:descuentos', descId);
          await redis.sadd(`mk:descuentos:fecha:${fechaStr}`, descId);
        }
      }

      await redis.set(`mk:cita:${id}`, cita);
      await redis.sadd('mk:citas', id);
      await redis.sadd(`mk:citas:fecha:${fechaStr}`, id);
      totalCitas++;
    }

    if ((d + 1) % 5 === 0) console.log(`  ${d+1}/30 días procesados...`);
  }

  console.log(`\n✓ ${totalCitas} citas generadas (${totalCompletadas} completadas, ${totalDescuentos} con descuento)`);

  // Resumen de lealtad
  const vips = Object.values(visitsByCliente).filter(v => v >= 5).length;
  const premios = Object.values(visitsByCliente).filter(v => v >= 10).length;
  console.log(`✓ Clientas VIP (5+ visitas): ${vips}`);
  console.log(`✓ Clientas con premio lealtad (10+ visitas): ${premios}`);

  console.log('\n=== Demo seed completo ===');
  console.log('El sistema ahora muestra un mes de operación realista.');
  console.log('Cuando Brenda y socios autoricen, corre: node reset-to-day-zero.js');
}

async function limpiarOperativa() {
  // Citas
  const citaIds = await redis.smembers('mk:citas');
  for (const id of citaIds) {
    const c = await redis.get(`mk:cita:${id}`);
    if (c?.fecha) await redis.del(`mk:citas:fecha:${c.fecha}`);
    await redis.del(`mk:cita:${id}`);
  }
  await redis.del('mk:citas');

  // Eventos
  const evtIds = await redis.smembers('mk:eventos');
  for (const id of evtIds) await redis.del(`mk:evento:${id}`);
  await redis.del('mk:eventos');

  // Descuentos
  const dscIds = await redis.smembers('mk:descuentos');
  for (const id of dscIds) {
    const d = await redis.get(`mk:descuento:${id}`);
    if (d?.fecha) await redis.del(`mk:descuentos:fecha:${d.fecha}`);
    await redis.del(`mk:descuento:${id}`);
  }
  await redis.del('mk:descuentos');

  // Clientes
  const cliIds = await redis.smembers('mk:clientes');
  for (const id of cliIds) await redis.del(`mk:cliente:${id}`);
  await redis.del('mk:clientes');

  console.log(`  Limpiada data operativa (${citaIds.length} citas, ${evtIds.length} eventos, ${dscIds.length} descuentos, ${cliIds.length} clientas)`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
