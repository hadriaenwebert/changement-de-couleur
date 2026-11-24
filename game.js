'use strict';
// Logique du jeu : tout se passe côté serveur (autorité unique).
const SUITS = ['♥', '♦', '♣', '♠'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cur = s => s.players[s.turn];
const topc = s => s.discard[s.discard.length - 1];

function deal(s) {
  const deck = shuffle(SUITS.flatMap(x => RANKS.map(r => ({ s: x, r }))));
  s.players.forEach(p => (p.hand = []));
  for (let k = 0; k < 7; k++) for (const p of s.players) p.hand.push(deck.pop());
  let first = deck.pop();
  while (['J', '2', '3', '7', '8'].includes(first.r)) { deck.unshift(first); first = deck.pop(); }
  Object.assign(s, {
    phase: 'play', deck, discard: [first], turn: 0, dir: 1, suit: first.s,
    pen: 0, aw3: false, drawn: false, played: false,
    lastOne: null, strikes: 0, deferred: null, winner: null, msg: ''
  });
}

function canPlay(s, c) {
  if (s.pen > 0) return c.r === '2';
  if (c.r === 'A' && topc(s).r === 'A') return false;
  return c.s === s.suit || c.r === topc(s).r;
}
function reshuffle(s) {
  if (s.deck.length === 0 && s.discard.length > 1) {
    const t = s.discard.pop();
    s.deck = shuffle(s.discard);
    s.discard = [t];
  }
}
function drawOne(s, p) {
  reshuffle(s);
  if (s.deck.length) (p || cur(s)).hand.push(s.deck.pop());
}
function advance(s) {
  s.turn = (s.turn + s.dir + s.players.length) % s.players.length;
  s.drawn = false; s.played = false; s.aw3 = false; s.strikes = 0;
}
function applyEffect(s, c) {
  if (c.r === '2') { s.pen += 2; advance(s); }
  else if (c.r === '3') { advance(s); drawOne(s); s.aw3 = true; s.played = false; s.drawn = true; }
  else if (c.r === '7') { advance(s); advance(s); }
  else if (c.r === '8') {
    if (s.players.length === 2) { advance(s); advance(s); }
    else { s.dir *= -1; advance(s); }
  } else advance(s);
}

// Exécute une action du joueur d'index idx. Retourne un message d'erreur ou null.
function act(s, idx, a) {
  if (s.phase !== 'play') return 'La partie n’est pas en cours.';
  if (idx !== s.turn) return 'Ce n’est pas ton tour.';
  s.msg = '';
  const p = cur(s);
  switch (a.t) {
    case 'play': {
      const i = a.i;
      if (!Number.isInteger(i) || i < 0 || i >= p.hand.length) return 'Carte invalide.';
      const c = p.hand[i];
      if (s.played || !canPlay(s, c)) return 'Cette carte n’est pas jouable.';
      if (c.r === 'J' && !SUITS.includes(a.suit)) return 'Choisis une couleur.';
      if (s.lastOne !== null && s.lastOne !== s.turn) s.lastOne = null;
      p.hand.splice(i, 1);
      s.discard.push(c);
      s.played = true; s.drawn = false; s.aw3 = false;
      s.suit = c.r === 'J' ? a.suit : c.s;
      if (p.hand.length === 0) { s.phase = 'over'; s.winner = p.name; return null; }
      if (p.hand.length === 1) { s.lastOne = s.turn; s.strikes = 0; s.deferred = { r: c.r, s: c.s }; }
      else applyEffect(s, c);
      return null;
    }
    case 'draw':
      if (s.pen > 0) { const n = s.pen; for (let i = 0; i < n; i++) drawOne(s); s.pen = 0; advance(s); }
      else if (s.aw3) { drawOne(s); s.aw3 = false; s.drawn = true; s.played = false; }
      else if (!s.drawn && !s.played) { drawOne(s); s.drawn = true; }
      else return 'Tu ne peux plus piocher.';
      return null;
    case 'end':
      if (!(s.drawn && !s.played) || s.pen > 0) return 'Tu ne peux pas passer maintenant.';
      if (s.lastOne !== null && s.lastOne !== s.turn) s.lastOne = null;
      advance(s);
      return null;
    case 'next':
      if (!s.played) return 'Joue d’abord une carte.';
      if (s.deferred) { const c = s.deferred; s.deferred = null; applyEffect(s, c); }
      else advance(s);
      return null;
    case 'strike':
      if (s.lastOne !== s.turn) return 'Pas besoin de frapper.';
      s.strikes = Math.min(3, s.strikes + 1);
      if (s.strikes >= 3) s.lastOne = null;
      return null;
    case 'forgot': {
      if (s.lastOne === null || s.lastOne === s.turn) return 'Personne n’a oublié.';
      const o = s.players[s.lastOne];
      drawOne(s, o); drawOne(s, o);
      s.msg = `${o.name} a oublié : +2 cartes !`;
      s.lastOne = null;
      return null;
    }
    default: return 'Action inconnue.';
  }
}

// Vue personnalisée : un joueur ne voit jamais les cartes des autres ni la pioche.
function view(s, idx, code, hostId, connected) {
  const v = {
    code, phase: s.phase, you: idx,
    isHost: s.players[idx].id === hostId,
    players: s.players.map(p => ({ name: p.name, count: p.hand.length, online: connected(p.id), host: p.id === hostId }))
  };
  if (s.phase !== 'lobby') {
    Object.assign(v, {
      hand: s.players[idx].hand, top: topc(s), suit: s.suit, deckCount: s.deck.length,
      discardCount: s.discard.length, turn: s.turn, dir: s.dir, pen: s.pen, aw3: s.aw3,
      drawn: s.drawn, played: s.played, lastOne: s.lastOne, strikes: s.strikes,
      msg: s.msg, winner: s.winner
    });
  }
  return v;
}

module.exports = { deal, act, view, canPlay };
