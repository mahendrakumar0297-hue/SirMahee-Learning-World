'use strict';
// Sir Mahee Learning World — backend (no dependencies, Node 18+).
// Serves the app, stores push subscriptions, sends daily reminders at 05:00 and 20:00.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const CFG = {
  port: +process.env.PORT || 3000,
  dir: path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')),
  pub: path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, 'public')),
  tz: process.env.TZ_NAME || 'Asia/Kolkata',
  admin: process.env.ADMIN_TOKEN || '',
  subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  insecure: process.env.ALLOW_INSECURE_ENDPOINTS === '1', // tests only
  proxy: process.env.TRUST_PROXY === '1',
  maxSubs: +process.env.MAX_SUBS || 200000,
};
const SLOTS = [{ id: 'morning', h: 5, m: 0 }, { id: 'evening', h: 20, m: 0 }];
const GRACE = 30; // minutes after the slot in which a missed send is still delivered
const PUSH_HOSTS = /(^|\.)(googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;
const MSG = {
  morning: {
    hi: [['सुप्रभात! ☀️', 'सुबह का समय सबसे अच्छा है — आज का पहला अध्याय पढ़ लें।'], ['नया दिन, नई शुरुआत 🌅', '15 मिनट की पढ़ाई से दिन शुरू करें।'], ['उठो, पढ़ो, आगे बढ़ो 📘', 'आज के कार्य खोलें और शुरू करें।'], ['आज का लक्ष्य तय करें 🎯', 'सबसे मुश्किल विषय पहले दोहराएँ।']],
    en: [['Good morning! ☀️', 'Mornings are best for focus — read your first chapter today.'], ['New day, fresh start 🌅', 'Begin with 15 minutes of study.'], ['Wake up, study, grow 📘', 'Open today’s tasks and get started.'], ['Set today’s goal 🎯', 'Revise the toughest subject first.']],
  },
  evening: {
    hi: [['शाम की दोहराई का समय 🌙', 'आज जो पढ़ा, उसे 10 मिनट दोहराएँ।'], ['क्विज़ टाइम! ✍️', 'एक छोटा क्विज़ देकर आज की पढ़ाई पक्की करें।'], ['अपनी लय बनाए रखें 🔥', 'आज की स्टडी स्ट्रीक न टूटने दें।'], ['कल की तैयारी 📚', 'कल की समय-सारणी देखें और बैग तैयार करें।']],
    en: [['Evening revision time 🌙', 'Revise what you studied today for 10 minutes.'], ['Quiz time! ✍️', 'Lock in today’s learning with a short quiz.'], ['Keep your streak alive 🔥', 'Don’t let today’s study streak break.'], ['Get ready for tomorrow 📚', 'Check tomorrow’s timetable and pack your bag.']],
  },
};
fs.mkdirSync(CFG.dir, { recursive: true });
// Fail fast with a clear startup error if the configured data directory is not writable.
fs.accessSync(CFG.dir, fs.constants.R_OK | fs.constants.W_OK);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o, mode = 0o600) => { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(o), { mode }); fs.renameSync(t, f); };
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---- VAPID keys (generated once, kept in data/vapid.json — never delete or share) ----
function loadVapid() {
  const f = path.join(CFG.dir, 'vapid.json'); let v = readJson(f, null);
  if (!v) { const j = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' }); v = { d: j.d, x: j.x, y: j.y }; writeJson(f, v, 0o600); }
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(v.x, 'base64url'), Buffer.from(v.y, 'base64url')]).toString('base64url');
  return { pub, key: crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', ...v }, format: 'jwk' }) };
}
const V = loadVapid();
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function vapidHeader(aud) {
  const h = b64({ typ: 'JWT', alg: 'ES256' }) + '.' + b64({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CFG.subject });
  const sig = crypto.sign('sha256', Buffer.from(h), { key: V.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `vapid t=${h}.${sig}, k=${V.pub}`;
}

// ---- storage ----
const subsFile = path.join(CFG.dir, 'subscriptions.json'), stateFile = path.join(CFG.dir, 'state.json');
const subs = new Map(readJson(subsFile, []).map(s => [s.id, s]));
const state = Object.assign({ last: {}, custom: null }, readJson(stateFile, {}));
let timer = 0;
const saveSubs = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
const flush = () => { writeJson(subsFile, [...subs.values()]); };
const saveState = () => writeJson(stateFile, state);
const idOf = e => crypto.createHash('sha256').update(e).digest('hex').slice(0, 24);

// ---- time + messages ----
function localParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: CFG.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
function pickMessage(sub, now = new Date()) {
  const lang = sub && sub.lang === 'en' ? 'en' : 'hi';
  if (sub && sub.testUntil > now.getTime()) return { title: lang === 'hi' ? 'टेस्ट नोटिफ़िकेशन ✅' : 'Test notification ✅', body: lang === 'hi' ? 'रिमाइंडर ठीक से काम कर रहे हैं।' : 'Your reminders are working.', tag: 'test' };
  if (state.custom && state.custom.until > now.getTime()) return { ...state.custom.msg, tag: 'custom' };
  const slot = localParts(now).min < 12 * 60 ? 'morning' : 'evening', L = MSG[slot][lang], [title, body] = L[Math.floor(now.getTime() / 864e5) % L.length];
  return { title, body, tag: slot };
}

// ---- sending (empty "tickle" push; the service worker fetches the text from /api/message) ----
async function pushOne(sub) {
  try {
    const r = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: vapidHeader(new URL(sub.endpoint).origin), TTL: '3600', Urgency: 'high' }, signal: AbortSignal.timeout(10000) });
    if (r.status === 404 || r.status === 410) { subs.delete(sub.id); saveSubs(); return 'gone'; }
    return r.ok ? 'ok' : 'fail';
  } catch { return 'fail'; }
}
async function pushAll(list) {
  const out = { ok: 0, gone: 0, fail: 0 };
  for (let i = 0; i < list.length; i += 50) (await Promise.all(list.slice(i, i + 50).map(pushOne))).forEach(r => out[r]++);
  return out;
}
let tickRunning = false;
async function tick(now = new Date()) {
  if (tickRunning) return [];
  tickRunning = true;
  try {
  const t = localParts(now), sent = [];
  for (const s of SLOTS) {
    const at = s.h * 60 + s.m;
    if (state.last[s.id] !== t.date && t.min >= at && t.min < at + GRACE) {
      state.last[s.id] = t.date; saveState(); // mark first so a crash can never double-send
      const r = await pushAll([...subs.values()].filter(x => x.prefs && x.prefs[s.id]));
      log(`slot ${s.id}`, r); sent.push([s.id, r]);
    }
  }
  return sent;
  } finally { tickRunning = false; }
}

// ---- http ----
const hits = new Map();
const limited = ip => { const n = Date.now(), h = hits.get(ip); if (!h || h.r < n) { hits.set(ip, { c: 1, r: n + 60000 }); return false; } return ++h.c > 60; };
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.r < n) hits.delete(k); }, 60000).unref();
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const readBody = req => new Promise((ok, no) => { let n = 0; const c = []; req.on('data', d => { n += d.length; if (n > 10240) no(Object.assign(new Error('big'), { code: 413 })); else c.push(d); }); req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c)) : {}); } catch { no(Object.assign(new Error('json'), { code: 400 })); } }); req.on('error', no); });
function adminState(req) {
  if (!CFG.admin) return null;
  const h = (req.headers.authorization || '').replace(/^Bearer /, ''), x = crypto.createHash('sha256');
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(h).digest(), x.update(CFG.admin).digest());
}
function validEndpoint(e) {
  if (typeof e !== 'string' || e.length > 1000) return false;
  let u; try { u = new URL(e); } catch { return false; }
  if (CFG.insecure && u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)) return true;
  return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && PUSH_HOSTS.test(u.hostname.toLowerCase());
}
const prefsOf = p => ({ morning: !p || p.morning !== false, evening: !p || p.evening !== false });
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n).trim();

async function api(req, res, pathname) {
  const ip = (CFG.proxy && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
  if (limited(ip)) return send(res, 429, { error: 'slow down' });
  if (req.method === 'GET' && pathname === '/api/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/api/vapid-public-key') return send(res, 200, { key: V.pub });
  if (req.method !== 'POST' && pathname !== '/api/stats') return send(res, 405, { error: 'method' });
  if (pathname === '/api/stats') {
    if (req.method !== 'GET') return send(res, 405, { error: 'method' });
    const a = adminState(req); if (a === null) return send(res, 503, { error: 'admin disabled' }); if (!a) return send(res, 401, { error: 'unauthorized' });
    const all = [...subs.values()]; return send(res, 200, { total: all.length, morning: all.filter(s => s.prefs.morning).length, evening: all.filter(s => s.prefs.evening).length, last: state.last });
  }
  const b = await readBody(req), sub = b.endpoint ? subs.get(idOf(String(b.endpoint))) : null;
  if (pathname === '/api/subscribe') {
    const e = b.subscription && b.subscription.endpoint, k = b.subscription && b.subscription.keys;
    if (!validEndpoint(e) || !k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return send(res, 400, { error: 'invalid subscription' });
    const id = idOf(e);
    if (!subs.has(id) && subs.size >= CFG.maxSubs) return send(res, 503, { error: 'full' });
    const old = subs.get(id), prefs = prefsOf(b.prefs);
    subs.set(id, { id, endpoint: e, prefs, lang: b.lang === 'en' ? 'en' : 'hi', created: old ? old.created : Date.now(), seen: Date.now() }); saveSubs();
    return send(res, 200, { ok: true, prefs });
  }
  if (pathname === '/api/unsubscribe') { if (sub) { subs.delete(sub.id); saveSubs(); } return send(res, 200, { ok: true }); }
  if (pathname === '/api/message') return send(res, 200, pickMessage(sub));
  if (pathname === '/api/test') {
    if (!sub) return send(res, 404, { error: 'not subscribed' });
    if (sub.testAt && Date.now() - sub.testAt < 60000) return send(res, 429, { error: 'wait a minute' });
    sub.testAt = Date.now(); sub.testUntil = Date.now() + 120000;
    return send(res, 200, { result: await pushOne(sub) });
  }
  if (pathname === '/api/broadcast') {
    const a = adminState(req); if (a === null) return send(res, 503, { error: 'admin disabled' }); if (!a) return send(res, 401, { error: 'unauthorized' });
    const title = clean(b.title, 80), body = clean(b.body, 200); if (!title || !body) return send(res, 400, { error: 'title and body required' });
    state.custom = { msg: { title, body }, until: Date.now() + 10 * 60000 }; saveState();
    return send(res, 200, await pushAll([...subs.values()]));
  }
  return send(res, 404, { error: 'not found' });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serve(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let rel; try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  const file = path.resolve(CFG.pub, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
  if (file !== CFG.pub && !file.startsWith(CFG.pub + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file), noCache = ext === '.html' || path.basename(file) === 'sw.js';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (pathname.startsWith('/api/')) api(req, res, pathname).catch(e => { if (e.code === 413) res.on('finish', () => req.destroy()); send(res, e.code === 413 || e.code === 400 ? e.code : 500, { error: e.code ? e.message : 'server error' }); });
  else serve(req, res, pathname);
});
function start(port = CFG.port) {
  return new Promise(ok => server.listen(port, () => {
    log(`listening on ${server.address().port} · reminders 05:00 & 20:00 ${CFG.tz} · ${subs.size} subscribers · admin ${CFG.admin ? 'on' : 'off'}`);
    const iv = setInterval(() => tick().catch(e => log('tick error', e.message)), 20000); iv.unref(); ok(server);
  }));
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
if (require.main === module) start();
module.exports = { start, tick, pickMessage, vapidPublic: V.pub, state, subs, flush };
