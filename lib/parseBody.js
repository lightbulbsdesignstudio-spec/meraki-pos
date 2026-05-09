// parseBody — body parser con validación de Content-Type explícita.
// Anti-patrón previo: si el JSON.parse fallaba, caía silenciosamente a URLSearchParams,
// devolviendo objetos parciales sin error. Ahora cada formato declara su intención.
export default function parseBody(req) {
  if (req._body) return Promise.resolve(req.body);
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      const trimmed = data.trim();
      if (!trimmed) return resolve({});

      // application/json (default cuando no se declara — la mayoría de fetch desde el frontend lo manda así).
      // Detección por shape solo cuando NO hay Content-Type, para mantener compat con frontend que omite headers.
      const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
      if (ct.includes('application/json') || (!ct && looksLikeJson)) {
        try { return resolve(JSON.parse(trimmed)); }
        catch (e) {
          const err = new Error('Body JSON inválido: ' + e.message);
          err.code = 'INVALID_JSON';
          return reject(err);
        }
      }

      // application/x-www-form-urlencoded — solo cuando se declara explícitamente
      if (ct.includes('application/x-www-form-urlencoded')) {
        try { return resolve(Object.fromEntries(new URLSearchParams(trimmed))); }
        catch (e) {
          const err = new Error('Body form-urlencoded inválido: ' + e.message);
          err.code = 'INVALID_FORM';
          return reject(err);
        }
      }

      // Sin Content-Type reconocido — rechazar antes que silenciar.
      const err = new Error(`Content-Type no soportado: "${ct || '(vacío)'}". Se esperaba application/json o application/x-www-form-urlencoded.`);
      err.code = 'UNSUPPORTED_CONTENT_TYPE';
      return reject(err);
    });
    req.on('error', e => reject(e));
  });
}
