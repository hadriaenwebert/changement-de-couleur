// Test de bout en bout : 3 clients WebSocket jouent 300 actions aléatoires valides.
const WebSocket = require('ws');
const { spawn } = require('child_process');
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: 3457 }, stdio: 'ignore' });
const assert = require('assert');
const mk = n => new Promise(res => {
  const ws = new WebSocket('ws://localhost:3457'); const c = { ws, V: null, err: [] };
  ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', pid: 'player-' + n + '-0123456789abcdef' })); res(c); });
  ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'state') c.V = m.view; if (m.t === 'error') c.err.push(m.msg); });
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const send = (c, o) => c.ws.send(JSON.stringify(o));
(async () => {
  await wait(500);
  const [a, b, c] = [await mk(1), await mk(2), await mk(3)];
  send(a, { t: 'create', name: 'Ana' }); await wait(150);
  const code = a.V.code; send(b, { t: 'join', code, name: 'Ben' }); send(c, { t: 'join', code, name: 'Cléa' }); await wait(150);
  assert.equal(a.V.players.length, 3);
  send(a, { t: 'start' }); await wait(150);
  assert.equal(a.V.hand.length, 7); assert.ok(!('deck' in a.V)); assert.ok(!a.V.players[1].hand);
  const cl = [a, b, c]; let over = false;
  for (let k = 0; k < 600 && !over; k++) {
    const p = cl.find(x => x.V.turn === x.V.you); const V = p.V;
    const ok = (x) => V.pen > 0 ? x.r === '2' : !(x.r === 'A' && V.top.r === 'A') && (x.s === V.suit || x.r === V.top.r);
    let msg;
    if (V.lastOne === V.you && V.played && V.strikes < 3) msg = { t: 'strike' };
    else if (V.played) msg = { t: 'next' };
    else { const i = V.hand.findIndex(ok); msg = i >= 0 ? { t: 'play', i, suit: '♠' } : (V.drawn && V.pen === 0 && !V.aw3) ? { t: 'end' } : { t: 'draw' }; }
    if (V.lastOne !== null && V.lastOne !== V.you && Math.random() < .3) msg = { t: 'forgot' };
    send(p, msg); await wait(25);
    over = a.V.phase === 'over';
  }
  assert.deepEqual([a, b, c].flatMap(x => x.err), [], 'aucune erreur serveur attendue');
  console.log(over ? 'OK : partie terminée, gagnant ' + a.V.winner : 'OK : 600 actions sans erreur');
  srv.kill(); process.exit(0);
})().catch(e => { console.error('ÉCHEC', e); srv.kill(); process.exit(1); });
