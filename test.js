'use strict';
// Offline test: a local mock "push service" stands in for Google/Apple/Mozilla.
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), assert = require('assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-')); process.env.ALLOW_INSECURE_ENDPOINTS = '1'; process.env.ADMIN_TOKEN = 'secret-token';
const app = require('./server');
(async () => {
  const got = []; let mode = 201;
  const mock = http.createServer((req, res) => { got.push({ url: req.url, auth: req.headers.authorization, ttl: req.headers.ttl }); req.resume(); res.writeHead(mode); res.end(); });
  await new Promise(r => mock.listen(0, '127.0.0.1', r)); const mport = mock.address().port;
  const srv = await app.start(0), base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (p, body, hdr = {}) => { const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...hdr }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => null), r }; };
  const sub = n => ({ endpoint: `http://127.0.0.1:${mport}/push/${n}`, keys: { p256dh: 'x', auth: 'y' } });
  const t = (name, ok) => console.log(ok ? '  ✓' : '  ✗', name) || assert(ok, name);
  t('health', (await call('/api/health')).j.ok);
  const key = (await call('/api/vapid-public-key')).j.key; t('VAPID key is 65-byte P-256 point', Buffer.from(key, 'base64url').length === 65);
  t('rejects bad subscription', (await call('/api/subscribe', { subscription: { endpoint: 'https://evil.example.com/x', keys: { p256dh: 'a', auth: 'b' } } })).s === 400);
  t('rejects non-JSON-safe body size', (await fetch(base + '/api/subscribe', { method: 'POST', body: 'x'.repeat(20000) }).then(r => r.status)) === 413);
  t('subscribe A (both on, Hindi)', (await call('/api/subscribe', { subscription: sub('A'), prefs: { morning: true, evening: true }, lang: 'hi' })).j.ok);
  t('subscribe B (morning only, English)', (await call('/api/subscribe', { subscription: sub('B'), prefs: { morning: true, evening: false }, lang: 'en' })).j.ok);
  const at = iso => new Date(iso); // 05:00 IST = 23:30 UTC previous day
  let r = await app.tick(at('2026-11-11T23:30:00Z')); t('05:00 IST morning slot fires', r.length === 1 && r[0][0] === 'morning' && r[0][1].ok === 2 && got.length === 2);
  const g = got[0], [h, p, s] = g.auth.replace('vapid t=', '').split(/\.|, k=/); const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(key, 'base64url').subarray(1, 33).toString('base64url'), y: Buffer.from(key, 'base64url').subarray(33).toString('base64url') }, format: 'jwk' });
  t('VAPID signature verifies', crypto.verify('sha256', Buffer.from(h + '.' + p), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  const claims = JSON.parse(Buffer.from(p, 'base64url')); t('JWT audience + expiry valid', claims.aud === `http://127.0.0.1:${mport}` && claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400);
  r = await app.tick(at('2026-11-11T23:35:00Z')); t('no double send in same slot', r.length === 0 && got.length === 2);
  r = await app.tick(at('2026-11-12T00:10:00Z')); t('05:40 IST (past grace) does nothing', r.length === 0);
  r = await app.tick(at('2026-11-12T14:30:00Z')); t('20:00 IST evening fires only for opted-in', r.length === 1 && r[0][0] === 'evening' && r[0][1].ok === 1 && got.length === 3);
  t('Hindi message for A', (await call('/api/message', { endpoint: sub('A').endpoint })).j.title.length > 0);
  t('English message for B', /[A-Za-z]/.test((await call('/api/message', { endpoint: sub('B').endpoint })).j.title));
  t('self-test push works and is rate limited', (await call('/api/test', { endpoint: sub('A').endpoint })).j.result === 'ok' && (await call('/api/test', { endpoint: sub('A').endpoint })).s === 429);
  t('test message shown after test', (await call('/api/message', { endpoint: sub('A').endpoint })).j.tag === 'test');
  t('broadcast needs admin token', (await call('/api/broadcast', { title: 'a', body: 'b' })).s === 401);
  t('broadcast works with token', (await call('/api/broadcast', { title: 'Holiday', body: 'No class tomorrow' }, { Authorization: 'Bearer secret-token' })).j.ok === 2);
  t('custom message served', (await call('/api/message', { endpoint: sub('B').endpoint })).j.title === 'Holiday');
  t('stats are admin only', (await call('/api/stats')).s === 401 && (await call('/api/stats', null, { Authorization: 'Bearer secret-token' })).j.total === 2);
  mode = 410; await call('/api/broadcast', { title: 'x', body: 'y' }, { Authorization: 'Bearer secret-token' }); t('expired subscriptions (410) are removed', app.subs.size === 0);
  { const r = await fetch(base + '/'); t('static app is served (index.html)', r.status === 200 && (await r.text()).includes('Sir Mahee')); const w = await fetch(base + '/sw.js'); t('service worker served with no-cache', w.status === 200 && w.headers.get('cache-control') === 'no-cache'); }
  t('path traversal blocked', [403, 404].includes((await fetch(base + '/..%2f..%2fserver.js')).status));
  app.flush(); console.log('\nAll tests passed'); process.exit(0);
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
