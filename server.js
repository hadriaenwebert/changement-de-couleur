'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const WWW = path.join(__dirname, 'www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Serveur HTTP : sert le client web (dossier www) et /healthz
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/healthz') { res.end('ok'); return; }
  if (p === '/') p = '/index.html';
  const f = path.join(WWW, path.normalize(p));
  if (!f.startsWith(WWW)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });
const rooms = new Map();      // code -> { code, host, s, last }
const playerRoom = new Map(); // pid  -> code
const socks = new Map();      // pid  -> ws

const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const online = pid => !!(socks.get(pid) && socks.get(pid).readyState === 1);

function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = ''; for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)];
    if (!rooms.has(c)) return c;
  }
}
function broadcast(room) {
  room.last = Date.now();
  room.s.players.forEach((p, i) => send(socks.get(p.id), { t: 'state', view: G.view(room.s, i, room.code, room.host, online) }));
}
const cleanName = n => String(n || 'Joueur').replace(/[<>&"]/g, '').trim().slice(0, 14) || 'Joueur';

function removeFromRoom(pid) {
  const code = playerRoom.get(pid); playerRoom.delete(pid);
  const room = rooms.get(code); if (!room) return;
  const s = room.s, i = s.players.findIndex(p => p.id === pid); if (i < 0) return;
  const name = s.players[i].name;
  s.players.splice(i, 1);
  if (s.players.length === 0) { rooms.delete(code); return; }
  if (room.host === pid) room.host = s.players[0].id;
  if (s.phase !== 'lobby') { // une partie en cours est annulée
    s.phase = 'lobby'; s.players.forEach(p => (p.hand = []));
  }
  broadcast(room);
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') {
      if (typeof m.pid !== 'string' || !/^[\w-]{16,64}$/.test(m.pid)) return;
      ws.pid = m.pid;
      const old = socks.get(m.pid); socks.set(m.pid, ws);
      if (old && old !== ws) old.close();
      const room = rooms.get(playerRoom.get(m.pid));
      if (room) broadcast(room); else send(ws, { t: 'state', view: null });
      return;
    }
    const pid = ws.pid; if (!pid) return;
    try {
      if (m.t === 'create') {
        if (playerRoom.has(pid)) removeFromRoom(pid);
        const code = newCode();
        const room = { code, host: pid, last: Date.now(), s: { phase: 'lobby', players: [{ id: pid, name: cleanName(m.name), hand: [] }] } };
        rooms.set(code, room); playerRoom.set(pid, code); broadcast(room); return;
      }
      if (m.t === 'join') {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) return send(ws, { t: 'error', msg: 'Salle introuvable.' });
        if (!room.s.players.some(p => p.id === pid)) {
          if (room.s.phase !== 'lobby') return send(ws, { t: 'error', msg: 'La partie a déjà commencé.' });
          if (room.s.players.length >= 4) return send(ws, { t: 'error', msg: 'La salle est pleine (4 joueurs max).' });
          if (playerRoom.has(pid)) removeFromRoom(pid);
          room.s.players.push({ id: pid, name: cleanName(m.name), hand: [] });
          playerRoom.set(pid, room.code);
        }
        broadcast(room); return;
      }
      const room = rooms.get(playerRoom.get(pid));
      if (!room) return send(ws, { t: 'error', msg: 'Tu n’es dans aucune salle.' });
      if (m.t === 'leave') { removeFromRoom(pid); send(ws, { t: 'state', view: null }); return; }
      if (m.t === 'start') {
        if (room.host !== pid || room.s.players.length < 2 || room.s.phase === 'play') return;
        G.deal(room.s); broadcast(room); return;
      }
      const idx = room.s.players.findIndex(p => p.id === pid);
      const err = G.act(room.s, idx, m);
      if (err) return send(ws, { t: 'error', msg: err });
      broadcast(room);
    } catch (e) { console.error(e); }
  });
  ws.on('close', () => {
    if (ws.pid && socks.get(ws.pid) === ws) {
      socks.delete(ws.pid);
      const room = rooms.get(playerRoom.get(ws.pid)); if (room) broadcast(room);
    }
  });
});

// Ping régulier + nettoyage des salles inactives depuis 6 h
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  for (const [c, r] of rooms) if (Date.now() - r.last > 6 * 3600e3) { r.s.players.forEach(p => playerRoom.delete(p.id)); rooms.delete(c); }
}, 30000);

server.listen(PORT, () => console.log('Serveur prêt sur le port ' + PORT));
