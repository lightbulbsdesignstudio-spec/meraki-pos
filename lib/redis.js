import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default redis;

// Key helpers — prefix mk: (Meraki)
export const keys = {
  // Catálogos
  tecnicas:          () => 'mk:tecnicas',
  tecnica:           (id) => `mk:tecnica:${id}`,
  servicios:         () => 'mk:servicios',
  servicio:          (id) => `mk:servicio:${id}`,

  // Clientes
  clientes:          () => 'mk:clientes',
  cliente:           (id) => `mk:cliente:${id}`,

  // Citas
  citas:             () => 'mk:citas',
  cita:              (id) => `mk:cita:${id}`,
  citasFecha:        (fecha) => `mk:citas:fecha:${fecha}`,

  // Waitlist
  waitlist:          (fecha, hora, tecnicaId) => `mk:waitlist:${fecha}:${hora}:${tecnicaId}`,
  waitlistItem:      (id) => `mk:waitlist:item:${id}`,

  // Eventos (log para ecosistema de analytics)
  eventos:           () => 'mk:eventos',
  evento:            (id) => `mk:evento:${id}`,

  // Socios / inversión
  inversion:         () => 'mk:inversion',
  aportaciones:      () => 'mk:aportaciones',
  aportacion:        (id) => `mk:aportacion:${id}`,

  // Auth / usuarios
  usuarios:          () => 'mk:usuarios',
  usuario:           (id) => `mk:usuario:${id}`,
  usuarioByUsername: (u) => `mk:usuario:byusername:${u.toLowerCase()}`,
  session:           (token) => `mk:session:${token}`,

  // Config negocio (CLABE, banco, WhatsApp Brenda, etc.)
  configNegocio:     () => 'mk:config:negocio',

  // Descuentos (auditoría)
  descuentos:        () => 'mk:descuentos',
  descuento:         (id) => `mk:descuento:${id}`,
  descuentosFecha:   (fecha) => `mk:descuentos:fecha:${fecha}`,

  // Observabilidad (errores + auditoría de mutaciones)
  errorLog:          () => 'mk:obs:errors',
  auditLog:          () => 'mk:obs:audit',
  healthMeta:        () => 'mk:obs:health',
};

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
