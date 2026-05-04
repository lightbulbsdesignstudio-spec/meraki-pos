import redis, { keys } from '../lib/redis.js';
import parseBody from '../lib/parseBody.js';
import { requireAuth } from '../lib/auth.js';

const DEFAULT_CONFIG = {
  clabe: '',
  banco: '',
  titular: '',
  whatsappBrenda: '',
  nombreNegocio: 'Meraki Nails',
  rentaMensual: 33500,
  insumosMensual: 1000,
  actualizadoEn: null,
};

function sanitizeWhatsApp(raw) {
  // Acepta '+52 55 4180 6736', '5541806736', etc — devuelve solo dígitos
  return String(raw || '').replace(/\D/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    // GET: cualquier usuario autenticado lo puede leer (lo necesita el front para el cobro SPEI)
    if (req.method === 'GET') {
      const blocked = await requireAuth(req, res);
      if (blocked) return;
      const cfg = await redis.get(keys.configNegocio()) || DEFAULT_CONFIG;
      return res.json({ ok: true, data: { ...DEFAULT_CONFIG, ...cfg } });
    }

    // PUT: solo admin
    if (req.method === 'PUT') {
      const blocked = await requireAuth(req, res, ['admin']);
      if (blocked) return;
      const body = await parseBody(req);
      const existing = await redis.get(keys.configNegocio()) || DEFAULT_CONFIG;

      const editable = ['clabe', 'banco', 'titular', 'whatsappBrenda', 'nombreNegocio', 'rentaMensual', 'insumosMensual'];
      const patch = {};
      for (const k of editable) if (k in body) patch[k] = body[k];

      if ('whatsappBrenda' in patch) patch.whatsappBrenda = sanitizeWhatsApp(patch.whatsappBrenda);
      if ('clabe' in patch) patch.clabe = String(patch.clabe).replace(/\s+/g, '');
      if ('rentaMensual' in patch) patch.rentaMensual = Number(patch.rentaMensual) || 0;
      if ('insumosMensual' in patch) patch.insumosMensual = Number(patch.insumosMensual) || 0;

      // Validar CLABE si viene (18 dígitos)
      if (patch.clabe && !/^\d{18}$/.test(patch.clabe)) {
        return res.status(400).json({ ok: false, error: 'CLABE debe tener 18 dígitos' });
      }
      // Validar WhatsApp (10 o 12 dígitos: 10 sin lada, 12 con +52)
      if (patch.whatsappBrenda && !/^\d{10,13}$/.test(patch.whatsappBrenda)) {
        return res.status(400).json({ ok: false, error: 'WhatsApp inválido (10-13 dígitos)' });
      }

      const updated = { ...existing, ...patch, actualizadoEn: new Date().toISOString() };
      await redis.set(keys.configNegocio(), updated);
      return res.json({ ok: true, data: updated });
    }

    res.status(405).json({ ok: false, error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
