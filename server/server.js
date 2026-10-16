/* WELFARE TEAM 2026 backend — zero-dependency Node (http + node:sqlite + crypto).
   Serves the static frontend AND the shared JSON API. Deploy as ONE Render web service.
   Data file: ./data/chama.db (mount a Render Disk at /opt/render/project/src/server/data for persistence).
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..'); // project root (index.html, member.html, admin.html, css/, js/)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'chama.db');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');

/* ---------- schema ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, fullName TEXT, username TEXT UNIQUE, passHash TEXT, salt TEXT,
  role TEXT, phone TEXT DEFAULT '', idNumber TEXT DEFAULT '', photo TEXT DEFAULT '',
  status TEXT DEFAULT 'active', joinedDate TEXT
);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, userId TEXT, createdAt TEXT);
CREATE TABLE IF NOT EXISTS contributions(
  id TEXT PRIMARY KEY, memberId TEXT, memberName TEXT, type TEXT, amount REAL,
  date TEXT, method TEXT, txnCode TEXT, phone TEXT, notes TEXT, loanId TEXT DEFAULT '',
  caseId TEXT DEFAULT '', status TEXT, treasurerBy TEXT DEFAULT '', chairmanBy TEXT DEFAULT '',
  rejectReason TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS loans(
  id TEXT PRIMARY KEY, memberId TEXT, memberName TEXT, kind TEXT, principal REAL,
  ratePm REAL, months INTEGER, totalPayable REAL, monthlyInstallment REAL,
  guarantors TEXT DEFAULT '[]', purpose TEXT DEFAULT '', date TEXT, status TEXT,
  treasurerBy TEXT DEFAULT '', chairmanBy TEXT DEFAULT '', rejectReason TEXT DEFAULT '',
  disbursedDate TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS fines(
  id TEXT PRIMARY KEY, memberId TEXT, amount REAL, reason TEXT, date TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS cases(
  id TEXT PRIMARY KEY, kind TEXT, title TEXT, perMember REAL, description TEXT, date TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS meetings(
  id TEXT PRIMARY KEY, title TEXT, type TEXT, date TEXT, venue TEXT, agenda TEXT, minutes TEXT DEFAULT '',
  attendance TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS notifications(
  id TEXT PRIMARY KEY, recipient TEXT, message TEXT, date TEXT
);
`);

function todayISO() { return new Date().toISOString().slice(0, 10); }
function uid(p) { return p + '_' + Date.now().toString(36) + Math.floor(Math.random() * 9999); }
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
function newSalt() { return crypto.randomBytes(16).toString('hex'); }

const MEMBER_SHARED_PASSWORD = 'Welfare@2026';
const CONSTITUTION_MEMBERS = [
  'Maurice Juma', 'Willis Nyamiwa', 'Tobias Osielo', 'Grace Achieng',
  'Ronald Otieno', 'Nick Ojwando', 'Monica Agwa', 'Mildred Wambura',
  'Kevin Maingi', 'Monica Kanuu', 'Josephine Omollo', 'Esther Makhulo'
];
function unameOf(name) {
  return name.toLowerCase().replace(/[^a-z ]/g, '').trim().split(/\s+/).join('.');
}
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  const ins = db.prepare('INSERT INTO users(id,fullName,username,passHash,salt,role,phone,idNumber,photo,status,joinedDate) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const add = (id, fullName, username, pw, role) => {
    const s = newSalt();
    ins.run(id, fullName, username.toLowerCase(), hashPw(pw, s), s, role, '', '', '', 'active', todayISO());
  };
  add('u_chairman', 'Chairman (Admin)', 'chairman', 'chairman2026', 'chairman');
  add('u_treasurer', 'Treasurer (Admin)', 'treasurer', 'treasurer2026', 'treasurer');
  CONSTITUTION_MEMBERS.forEach((n, i) => add('u_m' + (i + 1), n, unameOf(n), MEMBER_SHARED_PASSWORD, 'member'));
  db.prepare("INSERT INTO meetings(id,title,type,date,venue,agenda,minutes,attendance) VALUES(?,?,?,?,?,?,?,?)")
    .run('mt_seed1', 'General Meeting — Monthly Sitting', 'general', todayISO(), 'Rotational hosting (see roster)', 'Monthly sittings Ksh 3,000, welfare cases, loans, fines, AOB', '', '{}');
  db.prepare("INSERT INTO meetings(id,title,type,date,venue,agenda,minutes,attendance) VALUES(?,?,?,?,?,?,?,?)")
    .run('mt_seed2', 'Annual General Meeting (AGM)', 'agm', new Date().getFullYear() + '-12-31', 'To be communicated', 'Annual report, elections, AOB', '', '{}');
  db.prepare('INSERT INTO notifications(id,recipient,message,date) VALUES(?,?,?,?)')
    .run('n0', 'all', 'Welcome to WELFARE TEAM 2026 chama system. Members record payments after paying to the chama account. Treasurer approves first, Chairman gives final approval.', todayISO());
  console.log('Seeded 14 users + meetings.');
}
seed();

/* ---------- helpers ---------- */
function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' }, headers || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!tok) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(tok);
  if (!s) return null;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(s.userId);
  if (!u || u.status !== 'active') return null;
  return u;
}
function safeUser(u) {
  return { id: u.id, fullName: u.fullName, username: u.username, role: u.role, phone: u.phone, idNumber: u.idNumber, photo: u.photo, status: u.status, joinedDate: u.joinedDate };
}
function notify(recipient, message) {
  db.prepare('INSERT INTO notifications(id,recipient,message,date) VALUES(?,?,?,?)').run(uid('n'), recipient, message, todayISO());
}
function rowLoansFix(r) { if (r) { try { r.guarantors = JSON.parse(r.guarantors || '[]'); } catch { r.guarantors = []; } } return r; }

function fullState(forUser) {
  const users = db.prepare('SELECT * FROM users').all().map(safeUser);
  const contributions = db.prepare('SELECT * FROM contributions ORDER BY rowid DESC LIMIT 1000').all();
  const loans = db.prepare('SELECT * FROM loans ORDER BY rowid DESC LIMIT 1000').all().map(rowLoansFix);
  const fines = db.prepare('SELECT * FROM fines ORDER BY rowid DESC LIMIT 1000').all();
  const cases = db.prepare('SELECT * FROM cases ORDER BY rowid DESC LIMIT 500').all();
  const meetings = db.prepare('SELECT * FROM meetings ORDER BY rowid DESC LIMIT 500').all().map((m) => {
    try { m.attendance = JSON.parse(m.attendance || '{}'); } catch { m.attendance = {}; } return m;
  });
  let notifications = db.prepare('SELECT * FROM notifications ORDER BY rowid DESC LIMIT 200').all()
    .map((n) => ({ id: n.id, to: n.recipient, message: n.message, date: n.date, readBy: [] }));
  if (forUser && forUser.role === 'member') {
    return {
      users: users.filter((u) => u.id === forUser.id),
      allMembersBasic: users.filter((u) => u.role === 'member'),
      contributions: contributions.filter((c) => c.memberId === forUser.id),
      loans: loans.filter((l) => l.memberId === forUser.id),
      fines: fines.filter((f) => f.memberId === forUser.id),
      cases, meetings,
      notifications: notifications.filter((n) => n.to === 'all' || n.to === forUser.id || n.to === 'member_' + forUser.id)
    };
  }
  return { users, contributions, loans, fines, cases, meetings, notifications };
}

/* ---------- static ---------- */
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/server/') || p.startsWith('/api/')) return false;
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return true; }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return true;
  }
  return false;
}

/* ---------- routes ---------- */
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' }); res.end(); return; }
  if (req.method === 'GET' && !req.url.startsWith('/api/')) {
    if (serveStatic(req, res)) return;
    res.writeHead(404); res.end('Not found'); return;
  }
  const url = req.url.split('?')[0];

  try {
    // health
    if (url === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, time: new Date().toISOString() });

    // login
    if (url === '/api/login' && req.method === 'POST') {
      const b = await readBody(req);
      const uname = String(b.username || '').trim().toLowerCase();
      const u = db.prepare('SELECT * FROM users WHERE username=?').get(uname);
      if (!u || hashPw(b.password || '', u.salt) !== u.passHash) return send(res, 401, { error: 'Invalid username or password.' });
      if (u.status !== 'active') return send(res, 403, { error: 'Account is ' + u.status + '. Contact executive committee.' });
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions(token,userId,createdAt) VALUES(?,?,?)').run(token, u.id, new Date().toISOString());
      return send(res, 200, { token, user: safeUser(u) });
    }
    if (url === '/api/logout' && req.method === 'POST') {
      const u = authUser(req); if (!u) return send(res, 401, { error: 'Not logged in' });
      const tok = (req.headers.authorization || '').slice(7);
      db.prepare('DELETE FROM sessions WHERE token=?').run(tok);
      return send(res, 200, { ok: true });
    }

    const me = authUser(req);
    if (!me) return send(res, 401, { error: 'Login required' });
    const isAdmin = me.role === 'treasurer' || me.role === 'chairman';

    if (url === '/api/me' && req.method === 'GET') return send(res, 200, { user: safeUser(me) });
    if (url === '/api/db' && req.method === 'GET') return send(res, 200, fullState(me));

    // member: record contribution
    if (url === '/api/contributions' && req.method === 'POST') {
      const b = await readBody(req);
      const amount = Number(b.amount || 0);
      if (!amount || amount <= 0) return send(res, 400, { error: 'Enter a valid amount.' });
      if (!String(b.txnCode || '').trim()) return send(res, 400, { error: 'Enter M-Pesa / txn code.' });
      if (b.type === 'loan_repayment' && !b.loanId) return send(res, 400, { error: 'Select the loan.' });
      const id = uid('c');
      db.prepare('INSERT INTO contributions(id,memberId,memberName,type,amount,date,method,txnCode,phone,notes,loanId,caseId,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, me.id, me.fullName, b.type, amount, b.date || todayISO(), b.method || '', String(b.txnCode).trim(), b.phone || '', b.notes || '', b.loanId || '', b.caseId || '', 'pending_treasurer');
      notify('treasurer', `New ${b.type} Ksh ${amount} from ${me.fullName} awaiting stage-1 approval.`);
      return send(res, 200, { ok: true, id });
    }
    // member: request loan
    if (url === '/api/loans' && req.method === 'POST') {
      const b = await readBody(req);
      const kind = b.kind === 'special' ? 'special' : 'normal';
      const principal = Number(b.amount || b.principal || 0);
      if (!principal || principal <= 0) return send(res, 400, { error: 'Enter principal.' });
      if (kind === 'normal' && principal > 20000) return send(res, 400, { error: 'Normal loan cannot exceed Ksh 20,000.' });
      const g = Array.isArray(b.guarantors) ? b.guarantors : [];
      if (kind === 'special' && g.length === 0) return send(res, 400, { error: 'Special loan requires guarantors.' });
      const cfg = kind === 'normal' ? { months: 3, rate: 0.10 } : { months: 6, rate: 0.20 };
      const total = Math.round(principal + principal * cfg.rate * cfg.months);
      const id = uid('L');
      db.prepare('INSERT INTO loans(id,memberId,memberName,kind,principal,ratePm,months,totalPayable,monthlyInstallment,guarantors,purpose,date,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, me.id, me.fullName, kind, principal, cfg.rate, cfg.months, total, Math.round(total / cfg.months), JSON.stringify(g), b.purpose || '', todayISO(), 'pending_treasurer');
      notify('treasurer', `New ${kind} loan request Ksh ${principal} from ${me.fullName} awaiting stage-1.`);
      return send(res, 200, { ok: true, id, totalPayable: total });
    }
    // approve / reject contribution (2-step)
    let m;
    if ((m = url.match(/^\/api\/contributions\/([^/]+)$/)) && req.method === 'PUT') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const c = db.prepare('SELECT * FROM contributions WHERE id=?').get(m[1]);
      if (!c) return send(res, 404, { error: 'Not found' });
      if (me.role === 'treasurer') {
        if (c.status !== 'pending_treasurer') return send(res, 400, { error: 'Not in your queue.' });
        if (b.action === 'approve') {
          db.prepare("UPDATE contributions SET status='pending_chairman', treasurerBy=? WHERE id=?").run(me.fullName, c.id);
          notify(c.memberId, `Treasurer approved your ${c.type} Ksh ${c.amount}. Sent to Chairman.`);
          notify('chairman', `Stage-1 done: ${c.memberName} ${c.type} Ksh ${c.amount} needs final approval.`);
        } else {
          db.prepare("UPDATE contributions SET status='rejected', rejectReason=? WHERE id=?").run(b.reason || 'Rejected by Treasurer', c.id);
          notify(c.memberId, `Treasurer REJECTED your ${c.type} Ksh ${c.amount}: ${b.reason || ''}`);
        }
      } else {
        if (c.status !== 'pending_chairman') return send(res, 400, { error: 'Needs Treasurer stage-1 first.' });
        if (b.action === 'approve') {
          db.prepare("UPDATE contributions SET status='approved', chairmanBy=? WHERE id=?").run(me.fullName, c.id);
          notify(c.memberId, `FINAL APPROVED & POSTED: ${c.type} Ksh ${c.amount} is now on your dashboard.`);
        } else {
          db.prepare("UPDATE contributions SET status='rejected', rejectReason=? WHERE id=?").run(b.reason || 'Rejected by Chairman', c.id);
          notify(c.memberId, `Chairman REJECTED your ${c.type} Ksh ${c.amount}: ${b.reason || ''}`);
        }
      }
      return send(res, 200, { ok: true });
    }
    // approve / reject loan
    if ((m = url.match(/^\/api\/loans\/([^/]+)\/decision$/)) && req.method === 'PUT') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const l = db.prepare('SELECT * FROM loans WHERE id=?').get(m[1]);
      if (!l) return send(res, 404, { error: 'Not found' });
      if (me.role === 'treasurer') {
        if (l.status !== 'pending_treasurer') return send(res, 400, { error: 'Not in your queue.' });
        if (b.action === 'approve') {
          db.prepare("UPDATE loans SET status='pending_chairman', treasurerBy=? WHERE id=?").run(me.fullName, l.id);
          notify(l.memberId, `Treasurer approved your ${l.kind} loan Ksh ${l.principal}. To Chairman final.`);
        } else {
          db.prepare("UPDATE loans SET status='rejected', rejectReason=? WHERE id=?").run(b.reason || 'Rejected', l.id);
          notify(l.memberId, `Treasurer REJECTED loan Ksh ${l.principal}: ${b.reason || ''}`);
        }
      } else {
        if (l.status !== 'pending_chairman') return send(res, 400, { error: 'Needs Treasurer first.' });
        if (b.action === 'approve') {
          db.prepare("UPDATE loans SET status='approved', chairmanBy=? WHERE id=?").run(me.fullName, l.id);
          notify(l.memberId, `FINAL APPROVED: ${l.kind} loan Ksh ${l.principal} approved. Awaiting disbursement.`);
        } else {
          db.prepare("UPDATE loans SET status='rejected', rejectReason=? WHERE id=?").run(b.reason || 'Rejected', l.id);
          notify(l.memberId, `Chairman REJECTED loan: ${b.reason || ''}`);
        }
      }
      return send(res, 200, { ok: true });
    }
    // loan stage (disbursed/completed/defaulted)
    if ((m = url.match(/^\/api\/loans\/([^/]+)\/stage$/)) && req.method === 'PUT') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const l = db.prepare('SELECT * FROM loans WHERE id=?').get(m[1]);
      if (!l) return send(res, 404, { error: 'Not found' });
      const st = b.stage === 'disbursed' ? 'repaying' : b.stage;
      db.prepare('UPDATE loans SET status=?, disbursedDate=? WHERE id=?').run(st, st === 'repaying' ? todayISO() : (l.disbursedDate || ''), l.id);
      notify(l.memberId, `Loan ${l.id} marked ${st} by ${me.role}.`);
      return send(res, 200, { ok: true });
    }
    // admin: create member
    if (url === '/api/members' && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const name = String(b.fullName || '').trim();
      if (!name) return send(res, 400, { error: 'Enter full name.' });
      let uname = String(b.username || unameOf(name)).toLowerCase();
      if (db.prepare('SELECT 1 FROM users WHERE username=?').get(uname)) return send(res, 400, { error: 'Username taken.' });
      const pw = b.password || MEMBER_SHARED_PASSWORD;
      const s = newSalt();
      const id = uid('u');
      db.prepare('INSERT INTO users(id,fullName,username,passHash,salt,role,phone,idNumber,photo,status,joinedDate) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, name, uname, hashPw(pw, s), s, 'member', b.phone || '', b.idNumber || '', b.photo || '', 'active', todayISO());
      notify(id, `Welcome ${name}! Your login is ${uname}.`);
      return send(res, 200, { ok: true, id, username: uname });
    }
    // admin: update member (reset pwd / status)
    if ((m = url.match(/^\/api\/members\/([^/]+)$/)) && req.method === 'PUT') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(m[1]);
      if (!u) return send(res, 404, { error: 'Not found' });
      if (b.resetPassword) {
        const s = newSalt();
        db.prepare('UPDATE users SET passHash=?, salt=? WHERE id=?').run(hashPw(MEMBER_SHARED_PASSWORD, s), s, u.id);
        notify(u.id, 'Admin reset your password to the shared password. Please change it in Profile.');
      }
      if (b.password) {
        const s = newSalt();
        db.prepare('UPDATE users SET passHash=?, salt=? WHERE id=?').run(hashPw(b.password, s), s, u.id);
      }
      if (b.status) db.prepare('UPDATE users SET status=? WHERE id=?').run(b.status, u.id);
      return send(res, 200, { ok: true });
    }
    if (url === '/api/members/reset-all' && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const members = db.prepare("SELECT * FROM users WHERE role='member'").all();
      members.forEach((u) => {
        const s = newSalt();
        db.prepare('UPDATE users SET passHash=?, salt=? WHERE id=?').run(hashPw(MEMBER_SHARED_PASSWORD, s), s, u.id);
      });
      CONSTITUTION_MEMBERS.forEach((n) => {
        const un = unameOf(n);
        if (!db.prepare('SELECT 1 FROM users WHERE username=?').get(un)) {
          const s = newSalt(); const id = uid('u');
          db.prepare('INSERT INTO users(id,fullName,username,passHash,salt,role,status,joinedDate) VALUES(?,?,?,?,?,?,?,?)')
            .run(id, n, un, hashPw(MEMBER_SHARED_PASSWORD, s), s, 'member', 'active', todayISO());
        }
      });
      return send(res, 200, { ok: true });
    }
    // fines
    if (url === '/api/fines' && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const id = uid('f');
      db.prepare('INSERT INTO fines(id,memberId,amount,reason,date,status) VALUES(?,?,?,?,?,?)')
        .run(id, b.memberId, Number(b.amount || 0), b.reason || '', todayISO(), 'unpaid');
      notify(b.memberId, `Fine issued: ${b.reason} — Ksh ${b.amount}. Settle before assistance.`);
      return send(res, 200, { ok: true, id });
    }
    if ((m = url.match(/^\/api\/fines\/([^/]+)\/paid$/)) && req.method === 'PUT') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      db.prepare("UPDATE fines SET status='paid' WHERE id=?").run(m[1]);
      return send(res, 200, { ok: true });
    }
    // cases
    if (url === '/api/cases' && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const id = uid('w');
      db.prepare('INSERT INTO cases(id,kind,title,perMember,description,date,status) VALUES(?,?,?,?,?,?,?)')
        .run(id, b.kind || '', b.title || b.kind || '', Number(b.perMember || 0), b.description || '', todayISO(), 'open');
      notify('all', `New welfare case: ${b.title || b.kind} — each member contributes Ksh ${b.perMember}.`);
      return send(res, 200, { ok: true, id });
    }
    if ((m = url.match(/^\/api\/cases\/([^/]+)\/close$/)) && req.method === 'PUT') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      db.prepare("UPDATE cases SET status='closed' WHERE id=?").run(m[1]);
      return send(res, 200, { ok: true });
    }
    // meetings
    if (url === '/api/meetings' && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const id = uid('mt');
      db.prepare('INSERT INTO meetings(id,title,type,date,venue,agenda,minutes,attendance) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, b.title || '', b.type || 'general', b.date || todayISO(), b.venue || '', b.agenda || '', '', '{}');
      notify('all', `Meeting scheduled: ${b.title} on ${b.date}.`);
      return send(res, 200, { ok: true, id });
    }
    if ((m = url.match(/^\/api\/meetings\/([^/]+)\/attend$/)) && req.method === 'PUT') {
      if (!isAdmin) return send(res, 403, { error: 'Admins only' });
      const b = await readBody(req);
      const mt = db.prepare('SELECT * FROM meetings WHERE id=?').get(m[1]);
      if (!mt) return send(res, 404, { error: 'Not found' });
      let att = {}; try { att = JSON.parse(mt.attendance || '{}'); } catch { att = {}; }
      att[b.userId] = b.present ? 'present' : 'absent';
      db.prepare('UPDATE meetings SET attendance=? WHERE id=?').run(JSON.stringify(att), m[1]);
      return send(res, 200, { ok: true });
    }
    // profile + password (any logged user, own record only except admins)
    if (url === '/api/profile' && req.method === 'PUT') {
      const b = await readBody(req);
      db.prepare('UPDATE users SET phone=?, idNumber=?, photo=? WHERE id=?')
        .run(b.phone || '', b.idNumber || '', b.photo || me.photo, me.id);
      return send(res, 200, { ok: true });
    }
    if (url === '/api/password' && req.method === 'PUT') {
      const b = await readBody(req);
      const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(me.id);
      if (hashPw(b.current || '', fresh.salt) !== fresh.passHash) return send(res, 400, { error: 'Current password is wrong.' });
      const s = newSalt();
      db.prepare('UPDATE users SET passHash=?, salt=? WHERE id=?').run(hashPw(b.next || '', s), s, me.id);
      notify(me.id, 'Your password was changed successfully.');
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Unknown endpoint' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => console.log('WELFARE2026 backend live on :' + PORT + ' | db=' + DB_FILE));
