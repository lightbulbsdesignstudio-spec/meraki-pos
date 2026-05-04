import bcrypt from 'bcryptjs';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const username = 'brenda';
const password = 'meraki2026';
const nombre = 'Brenda';

async function main() {
  console.log('=== Seed usuario admin Brenda ===\n');

  const existing = await redis.get(`mk:usuario:byusername:${username}`);
  if (existing) {
    console.log(`✓ Usuario "${username}" ya existe (id ${existing}). Skip.`);
    return;
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const user = {
    id,
    username,
    nombre,
    rol: 'admin',
    email: '',
    tel: '5541806736',
    activo: true,
    passwordHash: await bcrypt.hash(password, 10),
    creadoEn: new Date().toISOString(),
  };

  await redis.set(`mk:usuario:${id}`, user);
  await redis.set(`mk:usuario:byusername:${username}`, id);
  await redis.sadd('mk:usuarios', id);

  console.log(`✓ Usuario admin creado:`);
  console.log(`  username: ${username}`);
  console.log(`  password: ${password}`);
  console.log(`  rol: admin`);
  console.log(`\nBrenda puede entrar a /login.html y cambiar la contraseña en cualquier momento.`);

  // Config de negocio inicial: vacío salvo el WhatsApp de Brenda
  const cfgKey = 'mk:config:negocio';
  const cfgExisting = await redis.get(cfgKey);
  if (!cfgExisting) {
    await redis.set(cfgKey, {
      clabe: '',
      banco: '',
      titular: '',
      whatsappBrenda: '525541806736', // formato wa.me (con código país)
      nombreNegocio: 'Meraki Nails',
      actualizadoEn: new Date().toISOString(),
    });
    console.log(`✓ Config de negocio inicializado (CLABE vacía — Brenda la captura desde Config)`);
  } else {
    console.log(`✓ Config de negocio ya existía. Skip.`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
