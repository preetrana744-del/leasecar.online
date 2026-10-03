import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const uploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(publicDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';
const sessionDays = Math.max(1, Math.min(30, Number(process.env.SESSION_DAYS || 7)));
const db = new DatabaseSync(path.join(dataDir, 'leasecar.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  daily_price INTEGER NOT NULL CHECK(daily_price > 0),
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL REFERENCES cars(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','confirmed','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const seedCars = [
  [1, 'Mahindra Scorpio N', 5500, 'https://commons.wikimedia.org/wiki/Special:FilePath/MahindraScorpioIndia.jpg', 1],
  [2, 'Toyota Fortuner', 7500, 'https://commons.wikimedia.org/wiki/Special:FilePath/Toyota%20Fortuner%20Full.jpg', 2],
  [3, 'Mahindra Scorpio Classic', 4500, 'https://commons.wikimedia.org/wiki/Special:FilePath/Mahindra%20Scorpio%20S11%20.jpg', 3],
  [4, 'Mahindra Thar', 5000, 'https://commons.wikimedia.org/wiki/Special:FilePath/Mahindra%20Thar%20SUV%20in%20%22Red%20Rage%22%20color%20at%20Ashiana%20Brahmanda%2C%20East%20Singbhum%20India%20%28Ank%20Kumar%2C%20Infosys%20limited%29%2002%20%28cropped%29.jpg', 4],
  [5, 'Toyota Innova Crysta', 5800, 'https://commons.wikimedia.org/wiki/Special:FilePath/Toyota%20Innova%20Crysta%202.4%20Z%20front%20right.jpg', 5],
  [6, 'Maruti Suzuki Swift Dzire', 2800, 'https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Dzire%202024%20ZXI%2B.jpg', 6]
];
const insertCar = db.prepare('INSERT OR IGNORE INTO cars (id,name,daily_price,image_url,sort_order) VALUES (?,?,?,?,?)');
for (const row of seedCars) insertCar.run(...row);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hashHex] = String(stored).split(':');
  if (!salt || !hashHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

if (Number(db.prepare('SELECT COUNT(*) AS n FROM admins').get().n) === 0) {
  const email = String(process.env.ADMIN_EMAIL || 'admin@leasecar.online').trim().toLowerCase();
  const generated = crypto.randomBytes(12).toString('base64url') + '!A9';
  const password = String(process.env.ADMIN_PASSWORD || generated);
  db.prepare('INSERT INTO admins (email,password_hash) VALUES (?,?)').run(email, hashPassword(password));
  console.log('\n[LeaseCar.online] Admin created');
  console.log(`[LeaseCar.online] Email: ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`[LeaseCar.online] One-time generated password: ${password}`);
  console.log('[LeaseCar.online] Store these credentials safely. The password is not recoverable from the database.\n');
}

const loginAttempts = new Map();
const bookingAttempts = new Map();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://commons.wikimedia.org https://upload.wikimedia.org; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function json(res, status, payload) {
  securityHeaders(res); res.statusCode = status; res.setHeader('Content-Type', MIME['.json']);
  res.end(JSON.stringify(payload));
}
function text(res, status, body, type='text/plain; charset=utf-8') {
  securityHeaders(res); res.statusCode = status; res.setHeader('Content-Type', type); res.end(body);
}
function getCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 1) continue;
    out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sessionFromReq(req) {
  const token = getCookies(req).gh_admin;
  if (!token) return null;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const row = db.prepare(`SELECT s.token_hash,s.csrf_token,s.expires_at,a.id AS admin_id,a.email
    FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=?`).get(sha256(token));
  return row || null;
}
function requireAdmin(req, res) {
  const session = sessionFromReq(req);
  if (!session) { json(res, 401, { error: 'Authentication required' }); return null; }
  return session;
}
function verifyCsrf(req, res, session) {
  if (!session || req.headers['x-csrf-token'] !== session.csrf_token) {
    json(res, 403, { error: 'Invalid CSRF token' }); return false;
  }
  return true;
}
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function limited(map, key, limit, windowMs) {
  const now = Date.now(); const item = map.get(key);
  if (!item || item.reset < now) { map.set(key, { count: 1, reset: now + windowMs }); return false; }
  item.count++; return item.count > limit;
}
async function readBody(req, maxBytes = 1024 * 1024) {
  let total = 0; const chunks = [];
  for await (const chunk of req) { total += chunk.length; if (total > maxBytes) throw new Error('BODY_TOO_LARGE'); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('BAD_JSON'); }
}
function safeString(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function validEmail(v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')); }
function sameOrigin(req) {
  const origin = req.headers.origin; if (!origin) return true;
  const host = req.headers.host; const proto = isProd ? 'https' : 'http';
  return origin === `${proto}://${host}` || (!isProd && origin === `https://${host}`);
}

async function handleApi(req, res, url) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origin rejected' });

  if (req.method === 'GET' && url.pathname === '/api/cars') {
    const cars = db.prepare('SELECT id,name,daily_price,image_url,updated_at FROM cars ORDER BY sort_order').all();
    return json(res, 200, { cars });
  }
  if (req.method === 'POST' && url.pathname === '/api/bookings') {
    const ip = clientIp(req); if (limited(bookingAttempts, ip, 8, 60 * 60 * 1000)) return json(res, 429, { error: 'Too many booking requests' });
    let body; try { body = await readBody(req, 64 * 1024); } catch { return json(res, 400, { error: 'Invalid request body' }); }
    const carId = Number(body.carId); const name = safeString(body.name, 80); const phone = safeString(body.phone, 30);
    const email = safeString(body.email, 120).toLowerCase(); const start = safeString(body.startDate, 10); const end = safeString(body.endDate, 10); const message = safeString(body.message, 500);
    if (!db.prepare('SELECT id FROM cars WHERE id=?').get(carId)) return json(res, 404, { error: 'Car not found' });
    if (name.length < 2 || phone.length < 7 || !validEmail(email) || !validDate(start) || !validDate(end) || Date.parse(end) < Date.parse(start)) return json(res, 400, { error: 'Please enter valid booking details' });
    db.prepare('INSERT INTO bookings (car_id,customer_name,phone,email,start_date,end_date,message) VALUES (?,?,?,?,?,?,?)').run(carId,name,phone,email || null,start,end,message || null);
    return json(res, 201, { ok: true, message: 'Reservation request received' });
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const ip = clientIp(req); if (limited(loginAttempts, ip, 5, 15 * 60 * 1000)) return json(res, 429, { error: 'Too many login attempts. Try again later.' });
    let body; try { body = await readBody(req, 32 * 1024); } catch { return json(res, 400, { error: 'Invalid request body' }); }
    const email = safeString(body.email, 120).toLowerCase(); const password = String(body.password || '');
    const admin = db.prepare('SELECT id,email,password_hash FROM admins WHERE email=?').get(email);
    if (!admin || !verifyPassword(password, admin.password_hash)) return json(res, 401, { error: 'Invalid email or password' });
    loginAttempts.delete(ip);
    const rawToken = crypto.randomBytes(32).toString('base64url'); const csrf = crypto.randomBytes(24).toString('base64url');
    const expires = Date.now() + sessionDays * 86400000;
    db.prepare('INSERT INTO sessions (token_hash,admin_id,csrf_token,expires_at) VALUES (?,?,?,?)').run(sha256(rawToken), admin.id, csrf, expires);
    const parts = [`gh_admin=${encodeURIComponent(rawToken)}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${sessionDays * 86400}`]; if (isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
    return json(res, 200, { ok: true, email: admin.email, csrf });
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/session') {
    const session = requireAdmin(req, res); if (!session) return;
    return json(res, 200, { authenticated: true, email: session.email, csrf: session.csrf_token });
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
    const session = requireAdmin(req, res); if (!session) return;
    if (!verifyCsrf(req, res, session)) return;
    const token = getCookies(req).gh_admin; if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
    const parts = ['gh_admin=', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0']; if (isProd) parts.push('Secure'); res.setHeader('Set-Cookie', parts.join('; '));
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/cars') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { cars: db.prepare('SELECT id,name,daily_price,image_url,updated_at FROM cars ORDER BY sort_order').all() });
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/bookings') {
    if (!requireAdmin(req, res)) return;
    const bookings = db.prepare(`SELECT b.*, c.name AS car_name FROM bookings b JOIN cars c ON c.id=b.car_id ORDER BY b.id DESC LIMIT 100`).all();
    return json(res, 200, { bookings });
  }
  const carMatch = url.pathname.match(/^\/api\/admin\/cars\/(\d+)$/);
  if (carMatch && req.method === 'PATCH') {
    const session = requireAdmin(req, res); if (!session || !verifyCsrf(req, res, session)) return;
    let body; try { body = await readBody(req, 32 * 1024); } catch { return json(res, 400, { error: 'Invalid request body' }); }
    const id = Number(carMatch[1]); const price = Number(body.dailyPrice);
    if (!Number.isInteger(price) || price < 500 || price > 100000) return json(res, 400, { error: 'Price must be between ₹500 and ₹100,000' });
    const result = db.prepare('UPDATE cars SET daily_price=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(price,id);
    if (!result.changes) return json(res, 404, { error: 'Car not found' });
    return json(res, 200, { ok: true });
  }
  const photoMatch = url.pathname.match(/^\/api\/admin\/cars\/(\d+)\/photo$/);
  if (photoMatch && req.method === 'POST') {
    const session = requireAdmin(req, res); if (!session || !verifyCsrf(req, res, session)) return;
    let body; try { body = await readBody(req, 12 * 1024 * 1024); } catch (e) { return json(res, e.message === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'Invalid image upload' }); }
    const m = String(body.imageData || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json(res, 400, { error: 'Upload a JPG, PNG, or WEBP image' });
    const buffer = Buffer.from(m[2], 'base64'); if (buffer.length < 100 || buffer.length > 8 * 1024 * 1024) return json(res, 400, { error: 'Image must be under 8 MB' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1]; const id = Number(photoMatch[1]);
    const car = db.prepare('SELECT image_url FROM cars WHERE id=?').get(id); if (!car) return json(res, 404, { error: 'Car not found' });
    const fileName = `car-${id}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`; const diskPath = path.join(uploadsDir, fileName); fs.writeFileSync(diskPath, buffer);
    const newUrl = `/uploads/${fileName}`; db.prepare('UPDATE cars SET image_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newUrl,id);
    if (car.image_url?.startsWith('/uploads/')) { const old = path.join(uploadsDir, path.basename(car.image_url)); try { if (fs.existsSync(old)) fs.unlinkSync(old); } catch {} }
    return json(res, 200, { ok: true, imageUrl: newUrl });
  }
  const bookingMatch = url.pathname.match(/^\/api\/admin\/bookings\/(\d+)$/);
  if (bookingMatch && req.method === 'PATCH') {
    const session = requireAdmin(req, res); if (!session || !verifyCsrf(req, res, session)) return;
    let body; try { body = await readBody(req, 16 * 1024); } catch { return json(res, 400, { error: 'Invalid request body' }); }
    const status = safeString(body.status, 20); if (!['new','contacted','confirmed','closed'].includes(status)) return json(res, 400, { error: 'Invalid status' });
    const result = db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, Number(bookingMatch[1])); if (!result.changes) return json(res, 404, { error: 'Booking not found' });
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'API route not found' });
}

function serveFile(req, res, pathname) {
  let baseDir = publicDir;
  let rel = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
  if (pathname.startsWith('/uploads/')) {
    baseDir = uploadsDir;
    rel = pathname.slice('/uploads'.length);
  }
  try { rel = decodeURIComponent(rel); } catch { return text(res, 400, 'Bad request'); }
  const target = path.normalize(path.join(baseDir, rel));
  const relative = path.relative(baseDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return text(res, 403, 'Forbidden');
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return text(res, 404, 'Not found');
  securityHeaders(res); res.statusCode = 200; res.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
  if (path.basename(target).match(/\.(html|css|js)$/)) res.setHeader('Cache-Control','no-cache'); else res.setHeader('Cache-Control','public, max-age=86400');
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/healthz') return json(res, 200, { ok: true, service: 'leasecar.online' });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveFile(req, res, url.pathname);
  } catch (err) {
    console.error(err); if (!res.headersSent) json(res, 500, { error: 'Internal server error' }); else res.end();
  }
});
server.listen(PORT, () => console.log(`[LeaseCar.online] http://localhost:${PORT}`));
