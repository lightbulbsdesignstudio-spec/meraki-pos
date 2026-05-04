// seed.js — Cargar catálogos iniciales de Meraki Nails
// Uso: node seed.js
// Requiere: UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en variables de entorno

import { Redis } from '@upstash/redis';
import { keys, newId } from './lib/redis.js';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TECNICAS = [
  { nombre: 'Brenda',    tel: '', color: '#C17E5A', comision: 40 },
  { nombre: 'Técnica 2', tel: '', color: '#8A7E72', comision: 40 },
  { nombre: 'Técnica 3', tel: '', color: '#7A9E7E', comision: 40 },
  { nombre: 'Técnica 4', tel: '', color: '#9E7A8A', comision: 40 },
];

const SERVICIOS = [
  // ─── Retirados ───────────────────────────────────────────────────────────
  { nombre: 'Retiro de gel',                     precio: 100,  duracion: 30,  categoria: 'Retiro',    desc: 'Retiro de esmalte semipermanente, forma a uñas, aceite de cutícula, crema hidratante' },
  { nombre: 'Retiro soft gel / acrílico',         precio: 160,  duracion: 45,  categoria: 'Retiro',    desc: 'Retiro de soft gel, acrílico, rubber, polígel o calcio; forma a uñas, aceite de cutícula, crema hidratante' },

  // ─── Esmalte regular ─────────────────────────────────────────────────────
  { nombre: 'Esmalte regular manos',              precio: 150,  duracion: 45,  categoria: 'Esmalte',   desc: 'Forma a uñas, empujar cutícula, esmalte regular, crema hidratante y aceite cutícula' },
  { nombre: 'Esmalte regular pies',               precio: 150,  duracion: 45,  categoria: 'Esmalte',   desc: 'Forma a uñas, empujar cutícula, esmalte regular, crema hidratante y aceite cutícula' },

  // ─── Gel ─────────────────────────────────────────────────────────────────
  { nombre: 'Gel manos',                          precio: 280,  duracion: 60,  categoria: 'Gel',       desc: 'Forma a uñas, empujar cutícula, gel manos liso, crema hidratante y aceite cutícula. Incluye retiro de gel aplicado en Meraki' },
  { nombre: 'Gel pies',                           precio: 300,  duracion: 60,  categoria: 'Gel',       desc: 'Forma a uñas, empujar cutícula, gel pies liso, crema hidratante y aceite cutícula. Incluye retiro de gel aplicado en Meraki' },

  // ─── Manicura ────────────────────────────────────────────────────────────
  { nombre: 'Manicura regular',                   precio: 350,  duracion: 75,  categoria: 'Manicura',  desc: 'Forma a uñas, limpieza y/o corte de laterales y/o cutícula, exfoliante, esmalte regular liso, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura gel',                        precio: 480,  duracion: 90,  categoria: 'Manicura',  desc: 'Forma a uñas, limpieza y/o corte de laterales y/o cutícula, exfoliante, gel liso, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura spa regular',               precio: 450,  duracion: 120, categoria: 'Manicura',  desc: 'Forma a uñas, limpieza y/o corte de laterales y/o cutícula, exfoliante, mascarilla 5 min, masaje, esmalte regular, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura rubber',                    precio: 500,  duracion: 120, categoria: 'Manicura',  desc: 'Uñas cortas y/o convexas. Forma a uñas, limpieza y/o corte, nivelación con rubber traslucido, exfoliante, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura rubber + gel color',        precio: 630,  duracion: 150, categoria: 'Manicura',  desc: 'Forma a uñas, limpieza y/o corte, exfoliante, nivelación con rubber + color gel liso, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura gel de construcción',       precio: 500,  duracion: 120, categoria: 'Manicura',  desc: 'Forma a uñas, limpieza y/o corte, nivelación con rubber traslucido, exfoliante, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura refuerzo acrílico',         precio: 650,  duracion: 120, categoria: 'Manicura',  desc: 'Forma a uñas, limpieza y/o corte, aplicación de acrílico de color, exfoliante, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura refuerzo acrílico + gel',   precio: 750,  duracion: 135, categoria: 'Manicura',  desc: 'Forma a uñas, limpieza y/o corte, aplicación de acrílico + gel liso, exfoliante, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura extensión de acrílico',     precio: 700,  duracion: 150, categoria: 'Manicura',  desc: 'Hasta #2. Forma a uñas, limpieza y/o corte, aplicación de acrílico cover, exfoliante, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura extensión acrílico + gel',  precio: 850,  duracion: 150, categoria: 'Manicura',  desc: 'Hasta #2. Forma a uñas, limpieza y/o corte, aplicación de acrílico + gel liso, exfoliante, crema hidratante y aceite cutícula' },
  { nombre: 'Manicura kids',                      precio: 250,  duracion: 45,  categoria: 'Manicura',  desc: 'Niñas hasta 12 años. Forma a uñas, exfoliante, hidratación, esmalte regular' },

  // ─── Pedicura ────────────────────────────────────────────────────────────
  { nombre: 'Pedicura regular',                   precio: 450,  duracion: 75,  categoria: 'Pedicura',  desc: 'Forma a uñas, limpieza y/o corte de laterales y/o cutícula, exfoliante, esmalte regular liso, crema hidratante y aceite cutícula' },
  { nombre: 'Pedicura gel',                        precio: 580,  duracion: 90,  categoria: 'Pedicura',  desc: 'Forma a uñas, limpieza y/o corte de laterales y/o cutícula, exfoliante, gel liso, crema hidratante y aceite cutícula' },
  { nombre: 'Pedicura spa regular',               precio: 550,  duracion: 120, categoria: 'Pedicura',  desc: 'Forma a uñas, limpieza y/o corte, exfoliante, mascarilla 5 min, masaje, esmalte regular, crema hidratante y aceite cutícula' },
  { nombre: 'Pedicura kids',                      precio: 300,  duracion: 45,  categoria: 'Pedicura',  desc: 'Niñas hasta 12 años. Forma a uñas, exfoliante, hidratación, esmalte regular' },

  // ─── Paquetes ────────────────────────────────────────────────────────────
  { nombre: 'Mani + Pedi regular',                precio: 750,  duracion: 150, categoria: 'Paquete',   desc: 'Manicura y pedicura completos con esmalte regular' },
  { nombre: 'Mani + Pedi gel',                    precio: 980,  duracion: 180, categoria: 'Paquete',   desc: 'Manicura y pedicura completos con esmalte en gel' },

  // ─── Refuerzos ───────────────────────────────────────────────────────────
  { nombre: 'Refuerzo con rubber',                precio: 300,  duracion: 90,  categoria: 'Refuerzo',  desc: 'Uñas cortas y/o convexas. Forma a uñas, empujar cutícula, nivelación con rubber traslucido, crema hidratante y aceite cutícula' },
  { nombre: 'Refuerzo gel de construcción',       precio: 300,  duracion: 90,  categoria: 'Refuerzo',  desc: 'Sobre largo natural. Forma a uñas, empujar cutícula, nivelación con gel de construcción traslucido, crema hidratante y aceite cutícula' },
  { nombre: 'Refuerzo acrílico',                  precio: 400,  duracion: 110, categoria: 'Refuerzo',  desc: 'Sobre largo natural. Forma a uñas, empujar cutícula, aplicación de acrílico de color, crema hidratante y aceite cutícula' },
  { nombre: 'Refuerzo acrílico + gel',            precio: 550,  duracion: 110, categoria: 'Refuerzo',  desc: 'Sobre largo natural. Forma a uñas, empujar cutícula, aplicación de acrílico + gel de color, crema hidratante y aceite cutícula' },

  // ─── Extensiones ─────────────────────────────────────────────────────────
  { nombre: 'Extensión de acrílico cover',        precio: 600,  duracion: 120, categoria: 'Extensión', desc: 'Hasta #2. Forma a uñas, empujar cutícula, extensión de acrílico cover, crema hidratante y aceite cutícula' },
  { nombre: 'Extensión de acrílico + gel',        precio: 700,  duracion: 120, categoria: 'Extensión', desc: 'Hasta #2. Forma a uñas, empujar cutícula, extensión de acrílico #2 + gel liso, crema hidratante y aceite cutícula' },
  { nombre: 'Extensión acrílica (reposición)',    precio: 60,   duracion: 20,  categoria: 'Extensión', desc: 'Reposición para alargar' },

  // ─── Extras / Arte ───────────────────────────────────────────────────────
  { nombre: 'Parche o recubrimiento',             precio: 35,   duracion: 15,  categoria: 'Extra',     desc: 'Sobre el largo de la uña para reforzar o por fisura' },
  { nombre: 'Efecto polvo',                       precio: 130,  duracion: 20,  categoria: 'Extra',     desc: 'Efecto espejo, aurora o azúcar' },
  { nombre: 'Efecto ojo de gato',                 precio: 130,  duracion: 15,  categoria: 'Extra',     desc: 'Efecto ojo de gato' },
  { nombre: 'Francés',                            precio: 80,   duracion: 30,  categoria: 'Extra',     desc: 'Francés tradicional recto o con sonrisa' },
  { nombre: 'Francés deco',                       precio: 150,  duracion: 30,  categoria: 'Extra',     desc: 'Francés doble' },
  { nombre: 'Baby boomer',                        precio: 150,  duracion: 30,  categoria: 'Extra',     desc: 'Difuminado con painting gel' },
  { nombre: 'Baby glam',                          precio: 150,  duracion: 15,  categoria: 'Extra',     desc: 'Difuminado con glitter' },
  { nombre: 'Jelly spa',                          precio: 130,  duracion: 15,  categoria: 'Extra',     desc: 'Agregar jelly spa a algún servicio' },
  { nombre: 'Limpieza express',                   precio: 180,  duracion: 20,  categoria: 'Extra',     desc: 'Con drill, 1 punta' },
  { nombre: 'Mano alzada',                        precio: 150,  duracion: 30,  categoria: 'Arte',      desc: 'Precio desde $150. Se requiere cotización' },

  // ─── Depilaciones ────────────────────────────────────────────────────────
  { nombre: 'Ceja limpieza',                      precio: 250,  duracion: 30,  categoria: 'Depilación', desc: 'Limpieza de cejas con cera o hilo' },
  { nombre: 'Diseño de ceja',                     precio: 350,  duracion: 45,  categoria: 'Depilación', desc: 'Diseño completo de cejas con cera o hilo' },
  { nombre: 'Planchado + depilación ceja',        precio: 500,  duracion: 60,  categoria: 'Depilación', desc: 'Planchado + depilación de cejas' },
  { nombre: 'Bozo',                               precio: 200,  duracion: 20,  categoria: 'Depilación', desc: '' },
  { nombre: 'Patilla',                            precio: 200,  duracion: 15,  categoria: 'Depilación', desc: '' },
  { nombre: 'Barbilla',                           precio: 130,  duracion: 15,  categoria: 'Depilación', desc: '' },
  { nombre: 'Cara completa',                      precio: 600,  duracion: 60,  categoria: 'Depilación', desc: 'Depilación cara completa' },
];

async function seed() {
  console.log('=== Meraki Nails — Seed de catálogos ===\n');

  // Técnicas
  console.log('Cargando técnicas...');
  for (const t of TECNICAS) {
    const id = newId();
    const obj = { id, nombre: t.nombre, tel: t.tel, color: t.color, activa: true, comision: t.comision };
    await redis.set(keys.tecnica(id), obj);
    await redis.sadd(keys.tecnicas(), id);
    console.log(`  ✓ ${t.nombre}`);
  }

  // Servicios
  console.log('\nCargando servicios...');
  for (const s of SERVICIOS) {
    const id = newId();
    const obj = { id, nombre: s.nombre, precio: s.precio, duracion: s.duracion, categoria: s.categoria, desc: s.desc };
    await redis.set(keys.servicio(id), obj);
    await redis.sadd(keys.servicios(), id);
    console.log(`  ✓ ${s.nombre} — $${s.precio}`);
  }

  // Config inicial de inversión para Socios
  await redis.set(keys.inversion(), {
    total: 300000,
    fecha: '2026-04-25',
    socios: [
      { nombre: 'Socio 1', porcentaje: 50 },
      { nombre: 'Socio 2', porcentaje: 50 },
    ],
    costosFijos: {
      renta: 33500,
      sueldosSemana: 6000,
      insumos: 1000,
    },
    notaInicial: 'Apertura Meraki Nails CDMX',
  });

  console.log('\n=== Seed completo ===');
  console.log(`  ${TECNICAS.length} técnicas cargadas`);
  console.log(`  ${SERVICIOS.length} servicios cargados`);
  console.log('  Config de inversión cargada ($300,000 MXN)');
  console.log('\nPróximo paso: actualizar nombres de técnicas en /config del POS');
}

seed().catch(console.error);
