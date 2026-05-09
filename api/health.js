import { pingRedis } from '../lib/observability.js';

const STARTED_AT = new Date().toISOString();
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
const REGION = process.env.VERCEL_REGION || 'local';

export default async function handler(_req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const ping = await pingRedis();
  const ok = ping.ok === true;

  return res.status(ok ? 200 : 503).json({
    ok,
    service: 'meraki-pos',
    version: VERSION,
    region: REGION,
    startedAt: STARTED_AT,
    now: new Date().toISOString(),
    redis: ping,
  });
}
