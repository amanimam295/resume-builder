const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// PORT=0 (or any invalid value) would bind a random ephemeral port — fall back to 5000
const PORT = (() => { const p = parseInt(process.env.PORT, 10); return Number.isInteger(p) && p > 0 ? p : 5000; })();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_FILE = path.join(__dirname, 'data', 'db.json');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

// ---- tiny JSON-file database (no native deps, works everywhere) ----
const empty = () => ({ users: [], resumes: [] });
const load = () => {
  if (!fs.existsSync(DB_FILE)) return empty();
  try {
    const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { users: d.users || [], resumes: d.resumes || [] };
  } catch (e) {
    // never crash on a corrupt file; keep a backup so nothing is lost
    try { fs.copyFileSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now()); } catch {}
    console.error('db.json unreadable, starting from an empty database:', e.message);
    return empty();
  }
};
const save = (d) => {
  try { if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, DB_FILE + '.bak'); } catch {} // keep previous good copy
  fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
};
const uid = () => crypto.randomUUID();

const app = express();
// when hosted behind a reverse proxy / load balancer (Render, Fly.io, Nginx…), opt in so
// req.ip is the real client — otherwise every visitor shares one rate-limit bucket
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- tiny in-memory rate limiter for auth routes (30 req/min per IP) ----
const hits = new Map();
const limit = (req, res, next) => {
  const key = req.ip || 'unknown', now = Date.now();
  const win = (hits.get(key) || []).filter((t) => now - t < 60000);
  if (win.length >= 30) return res.status(429).json({ error: 'Too many attempts — try again in a minute' });
  win.push(now);
  hits.set(key, win);
  next();
};

const sign = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, mobile: u.mobile || '', role: u.role || 'user' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.uid = jwt.verify(h.replace('Bearer ', ''), SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again' });
  }
}

// admin variant: valid token AND role === 'admin' in the database
function adminAuth(req, res, next) {
  const h = req.headers.authorization || '';
  let id;
  try { id = jwt.verify(h.replace('Bearer ', ''), SECRET).id; } catch { return res.status(401).json({ error: 'Please log in again' }); }
  const u = load().users.find((x) => x.id === id);
  if (!u) return res.status(401).json({ error: 'Please log in again' });
  if (u.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  req.uid = id;
  next();
}

// ---- auth ----
app.post('/api/auth/register', limit, (req, res) => {
  const { name, email, password, mobile } = req.body || {};
  if (!name || !email || !password || !mobile) return res.status(400).json({ error: 'Name, email, password and mobile number are required' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const mob = String(mobile).trim();
  if (!/^\+?[\d\s-]{10,15}$/.test(mob)) return res.status(400).json({ error: 'Enter a valid mobile number (10–15 digits)' });
  const db = load();
  if (db.users.some((u) => u.email === email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
  const user = { id: uid(), name: name.trim(), email: email.toLowerCase(), mobile: mob, hash: bcrypt.hashSync(password, 10), role: 'user', createdAt: new Date().toISOString() };
  db.users.push(user);
  save(db);
  res.status(201).json({ token: sign(user), user: pub(user) });
});

app.post('/api/auth/login', limit, (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = load().users.find((u) => u.email === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.hash)) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(user), user: pub(user) });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = load().users.find((u) => u.id === req.uid);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: pub(user) });
});

// ---- resumes ----
app.get('/api/resumes', auth, (req, res) => {
  const list = load().resumes.filter((r) => r.userId === req.uid)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ id, title, template, updatedAt }) => ({ id, title, template, updatedAt }));
  res.json(list);
});

app.post('/api/resumes', auth, (req, res) => {
  const db = load();
  const now = new Date().toISOString();
  const { title = 'My Resume', template = 'modern', color = '#2563eb', data = {} } = req.body || {};
  const r = { id: uid(), userId: req.uid, title, template, color, data, createdAt: now, updatedAt: now };
  db.resumes.push(r);
  save(db);
  res.status(201).json(r);
});

app.post('/api/resumes/:id/duplicate', auth, (req, res) => {
  const db = load();
  const src = db.resumes.find((x) => x.id === req.params.id && x.userId === req.uid);
  if (!src) return res.status(404).json({ error: 'Resume not found' });
  const now = new Date().toISOString();
  const copy = { ...src, id: uid(), title: (src.title || 'Resume') + ' (copy)', createdAt: now, updatedAt: now };
  db.resumes.push(copy);
  save(db);
  res.status(201).json(copy);
});

app.get('/api/resumes/:id', auth, (req, res) => {
  const r = load().resumes.find((x) => x.id === req.params.id && x.userId === req.uid);
  r ? res.json(r) : res.status(404).json({ error: 'Resume not found' });
});

app.put('/api/resumes/:id', auth, (req, res) => {
  const db = load();
  const r = db.resumes.find((x) => x.id === req.params.id && x.userId === req.uid);
  if (!r) return res.status(404).json({ error: 'Resume not found' });
  const b = req.body || {};
  if (b.data !== undefined && (typeof b.data !== 'object' || b.data === null || Array.isArray(b.data))) return res.status(400).json({ error: 'Invalid resume data' });
  if (b.title !== undefined && typeof b.title !== 'string') return res.status(400).json({ error: 'Invalid title' });
  if (b.template !== undefined && !['modern', 'classic', 'minimal'].includes(b.template)) delete b.template;
  for (const k of ['title', 'template', 'color', 'data']) if (b[k] !== undefined) r[k] = b[k];
  r.updatedAt = new Date().toISOString();
  save(db);
  res.json(r);
});

app.delete('/api/resumes/:id', auth, (req, res) => {
  const db = load();
  const n = db.resumes.length;
  db.resumes = db.resumes.filter((x) => !(x.id === req.params.id && x.userId === req.uid));
  if (db.resumes.length === n) return res.status(404).json({ error: 'Resume not found' });
  save(db);
  res.json({ ok: true });
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

// ---- admin panel ----
app.get('/api/admin/setup', (_, res) => res.json({ needsSetup: !load().users.some((u) => u.role === 'admin') }));

// first visitor claims admin access by entering their own details
app.post('/api/admin/setup', limit, (req, res) => {
  const db = load();
  if (db.users.some((u) => u.role === 'admin')) return res.status(409).json({ error: 'Admin is already set up — please log in instead' });
  const { name, email, password, mobile } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (db.users.some((u) => u.email === email.toLowerCase())) return res.status(409).json({ error: 'That email is already registered — log in instead' });
  const user = { id: uid(), name: name.trim(), email: email.toLowerCase(), mobile: (mobile || '').trim(), hash: bcrypt.hashSync(password, 10), role: 'admin', createdAt: new Date().toISOString() };
  db.users.push(user);
  save(db);
  console.log(`Admin account created: ${user.email}`);
  res.status(201).json({ token: sign(user), user: pub(user) });
});

app.post('/api/admin/login', limit, (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = load().users.find((u) => u.email === email.toLowerCase());
  if (!user || user.role !== 'admin' || !bcrypt.compareSync(password, user.hash)) return res.status(401).json({ error: 'Invalid admin credentials' });
  res.json({ token: sign(user), user: pub(user) });
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  const db = load();
  const users = db.users
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: u.mobile || '',
      role: u.role || 'user',
      registeredAt: u.createdAt || null,
      resumes: db.resumes.filter((r) => r.userId === u.id).length,
    }))
    .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
  res.json({
    users,
    stats: { users: users.length, admins: users.filter((u) => u.role === 'admin').length, resumes: db.resumes.length },
  });
});

// edit a registration's details
app.put('/api/admin/users/:id', adminAuth, (req, res) => {
  const db = load();
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    u.name = b.name.trim();
  }
  if (b.email !== undefined) {
    const e = String(b.email).toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) return res.status(400).json({ error: 'Enter a valid email' });
    if (db.users.some((x) => x.email === e && x.id !== u.id)) return res.status(409).json({ error: 'That email is already used by another account' });
    u.email = e;
  }
  if (b.mobile !== undefined) {
    const m = String(b.mobile).trim();
    if (m && !/^\+?[\d\s-]{10,15}$/.test(m)) return res.status(400).json({ error: 'Enter a valid mobile number (10–15 digits)' });
    u.mobile = m;
  }
  save(db);
  res.json({ id: u.id, name: u.name, email: u.email, mobile: u.mobile || '', role: u.role || 'user' });
});

// delete a registration (and everything it owns)
app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  const db = load();
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.id === req.uid) return res.status(400).json({ error: "You can't delete your own admin account" });
  db.users = db.users.filter((x) => x.id !== u.id);
  const before = db.resumes.length;
  db.resumes = db.resumes.filter((r) => r.userId !== u.id);
  save(db);
  res.json({ ok: true, removedResumes: before - db.resumes.length });
});

// Unknown API routes -> JSON 404 (instead of the HTML index)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Optional convenience: also serve the frontend folder at http://localhost:PORT
const FE = path.join(__dirname, '..', 'frontend');
// no-cache: always revalidate with ETag so browsers never run a stale admin.js/app.js
if (fs.existsSync(FE)) app.use(express.static(FE, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const server = app.listen(PORT, () => console.log(`API running on http://localhost:${server.address().port}`));
