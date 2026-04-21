export default function parseBody(req) {
  if (req._body) return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch {
        try { resolve(Object.fromEntries(new URLSearchParams(data))); }
        catch { resolve({}); }
      }
    });
  });
}
