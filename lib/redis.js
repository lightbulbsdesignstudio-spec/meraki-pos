import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default redis;

// Key helpers
export const keys = {
  // Catálogos
  salones:           () => 'nn:salones',
  tecnicas:          () => 'nn:tecnicas',
  tecnica:           (id) => `nn:tecnica:${id}`,
  servicios:         () => 'nn:servicios',
  servicio:          (id) => `nn:servicio:${id}`,

  // Clientes
  clientes:          () => 'nn:clientes',
  cliente:           (id) => `nn:cliente:${id}`,

  // Citas
  citas:             () => 'nn:citas',
  cita:              (id) => `nn:cita:${id}`,
  citasFecha:        (fecha) => `nn:citas:fecha:${fecha}`,

  // WhatsApp
  waQueue:           () => 'nn:wa:queue',
  waItem:            (id) => `nn:wa:item:${id}`,
  waSession:         (phone) => `nn:wa:session:${phone}`,

  // Waitlist
  waitlist:          (fecha, hora, tecnicaId) => `nn:waitlist:${fecha}:${hora}:${tecnicaId}`,
  waitlistItem:      (id) => `nn:waitlist:item:${id}`,
};

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
