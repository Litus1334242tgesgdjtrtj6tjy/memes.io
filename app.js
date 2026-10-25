// Mapa Smart Money: the agar.io map. Live data comes from the background (pump.fun,
// Axiom with Fomo and KOLs, optional RPC); "Demo" runs a simulated market instead.
import { makeSkin, skinHue } from './ui/skins.js';
import { createSim } from './ui/sim.js';
import { connectWeb, getWebConfig, saveWebConfig, clearWebConfig, lastWebUrl, probeWebConfig } from './web/client.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const short = (a) => (typeof a === 'string' && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : String(a || ''));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ESC[m]);
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const fmtUsd = (v) => {
  const a = Math.abs(v || 0);
  const s = a >= 1e9 ? nf1.format(a / 1e9) + 'B' : a >= 1e6 ? nf1.format(a / 1e6) + 'M' : a >= 1e3 ? nf1.format(a / 1e3) + 'K' : nf0.format(a);
  return (v < 0 ? '−' : '') + '$' + s;
};
const ago = (s) => (s < 60 ? Math.max(0, Math.round(s)) + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? nf1.format(s / 3600) + ' h' : Math.round(s / 86400) + ' d');
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('msm.' + k);
      return v == null ? d : JSON.parse(v);
    } catch (_) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('msm.' + k, JSON.stringify(v));
    } catch (_) {}
  },
};
const hasExt = !!(globalThis.chrome && chrome.runtime && chrome.runtime.id && chrome.runtime.connect);
const hasWeb = (location.protocol === 'http:' || location.protocol === 'https:') && (!window.MEMES_STATIC_SITE || Boolean(getWebConfig()));
const hasLive = hasExt || hasWeb;


// GitHub Pages hosting controls. Never put private keys in a public repository.
if (window.MEMES_STATIC_SITE) {
  const hostingDlg = document.getElementById('hostingDlg');
  const hostingHint = document.getElementById('hostingHint');
  const hostingStatus = document.getElementById('hostingStatus');
  const urlInput = document.getElementById('hostingUrl');
  const passInput = document.getElementById('hostingPass');
  urlInput.value = lastWebUrl();
  hostingHint.hidden = !!getWebConfig();
  document.getElementById('tgHosting').addEventListener('click', () => hostingDlg.showModal());
  document.getElementById('closeHosting').addEventListener('click', () => hostingDlg.close());
  hostingDlg.addEventListener('click', e => { if (e.target === hostingDlg) hostingDlg.close(); });
  document.getElementById('clearHosting').addEventListener('click', () => { clearWebConfig(); location.reload(); });
  document.getElementById('saveHosting').addEventListener('click', async () => {
    const url = urlInput.value.trim(), pass = passInput.value;
    const button = document.getElementById('saveHosting');
    button.disabled = true;
    hostingStatus.textContent = 'Comprobando servidor y credenciales…';
    try {
      await probeWebConfig(url, pass);
      saveWebConfig(url, pass);
      hostingStatus.textContent = 'Conexión correcta. Abriendo datos reales…';
      store.set('mode', 'live');
      location.reload();
    } catch (e) {
      hostingStatus.textContent = 'No se ha podido conectar: ' + (e?.message || e) + '. Revisa HTTPS, contraseña y MEMES_ALLOWED_ORIGIN.';
    } finally { button.disabled = false; }
  });
}

// ───────── tuning ─────────
const WORLD = 3600, CX = WORLD / 2, CY = WORLD / 2, SPREAD = 1600;
const PELLET_R = 9, CELL_MIN = PELLET_R + 3, R_MAX = 240;
const WN = 36; // points on a cell's jelly edge
let HL_FLOW = 900, HL_FAST = 60; // half-lives (s): cell size, and the green/red halo
const WIN = 90, LINK_K = 3; // detector: same coin within 90 s, on 3 coins or more
const PALETTE = ['#3d8bff', '#ff8b26', '#9a5cff', '#14b8d4', '#ff4da6', '#c0843f', '#d14fe0', '#2f5fd0'];
const FONT = "Ubuntu, 'Trebuchet MS', 'Segoe UI', sans-serif";
const MONO = "'Ubuntu Mono', ui-monospace, Menlo, Consolas, monospace";
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const labelColor = (lab) => PALETTE[(lab - 1) % PALETTE.length];
const COS = new Float32Array(WN), SIN = new Float32Array(WN);
for (let i = 0; i < WN; i++) {
  COS[i] = Math.cos((i / WN) * TAU);
  SIN[i] = Math.sin((i / WN) * TAU);
}
const SRC_ES = { list: 'Lista', 'pump-top': 'Top PnL', fomo: 'Fomo', kol: 'KOL', kolscan: 'KOL', feed: 'Pump', axiom: 'Axiom', demo: 'Demo' };
const CALL_ICON = { kolbuy: '🛒', tg: '📨' }; // a KOL's buy, a contract posted on Telegram; 📣 for the rest
const callIcon = (src) => CALL_ICON[src] || '📣';
const impColor = (imp) => (imp >= 75 ? '#ff4d6d' : imp >= 50 ? '#ff9f1c' : imp >= 25 ? '#ffd23a' : '#9aa7b8');
const initials = (n) => (String(n || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?').toUpperCase();
const fmtK = (v) => (v >= 1e6 ? nf1.format(v / 1e6) + 'M' : v >= 1e4 ? nf0.format(v / 1e3) + 'K' : v >= 1e3 ? nf1.format(v / 1e3) + 'K' : nf0.format(v || 0));
const isB58 = (s) => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const isKol = (c) => c.src === 'kolscan' || c.src === 'kol' || !!c.ks;

// ───────── trading terminals: double-click a coin to open it ─────────
// Axiom names a market by its pair (pump.fun bonding curve, or the pool after migrating);
// without one, its token page takes the mint. Padre resolves the mint itself.
const TERMS = {
  axiom: { name: 'Axiom', url: (c) => (isB58(c.pair) ? `https://axiom.trade/meme/${c.pair}?chain=sol` : `https://axiom.trade/token/${c.ca}?chain=sol`) },
  padre: { name: 'Padre', url: (c) => `https://trade.padre.gg/trade/solana/${c.ca}` },
};

// ───────── world state ─────────
let MODE = store.get('mode', 'live');
if (!hasLive) MODE = 'demo';
let T = 0; // map clock, seconds
const T0 = Date.now(); // live: wall-clock ms at T = 0
let live = false; // false while history is rebuilt (no particles or rings)
let now = performance.now();
let coins = [];
const coinById = new Map();
const coinByMint = new Map();
let nextCoin = 1;
let wallets = [];
const walletByAddr = new Map();
const callers = new Map();
const calias = new Map(); // caller key merged into another one → that one (same wallet)
const ck = (k) => calias.get(k) || k;
const callerOf = (k) => callers.get(ck(k));
const feed = [];
let term = store.get('term', 'axiom');
if (!TERMS[term]) term = 'axiom';
let status = {}, settings = {}, axiomShapes = {}, solUsd = 0, listInfo = null, savedDays = [], axiomTabs = 0;
let sim = null;
let pseed = 0x51ce;
const prand = () => {
  pseed = (pseed + 0x6d2b79f5) | 0;
  let t = Math.imul(pseed ^ (pseed >>> 15), 1 | pseed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const tiny = () => (MODE === 'demo' ? 4.5 : 5);
const nowSec = () => (Date.now() - T0) / 1000;
const dayStartSec = () => (new Date().setHours(0, 0, 0, 0) - T0) / 1000;

function addCoin(meta) {
  const a = prand() * TAU, d = SPREAD * Math.sqrt(prand());
  const id = nextCoin++;
  const c = {
    id,
    ca: meta.m || meta.ca || '',
    tk: '',
    name: '',
    born: meta.born != null ? meta.born : T,
    x: CX + Math.cos(a) * d,
    y: CY + Math.sin(a) * d,
    vx: 0,
    vy: 0,
    wa: prand() * TAU,
    r: PELLET_R,
    isCell: false,
    flow: 0,
    inF: 0,
    outF: 0,
    callFlow: 0,
    orgFlow: 0, // organic momentum: market cap speeding up with many different buyers
    orgG: 0, // its latest rise, %/min
    orgN: 0, // different buyers seen then
    orgT: -1e9,
    liq: 0,
    v1h: 0,
    held: 0,
    holders: new Map(),
    heldN: 0,
    mc: 0,
    ath: 0,
    img: '',
    img2: '',
    pair: '',
    pic: null,
    picBusy: false,
    picFail: false,
    picUrl: '',
    pc: `hsla(${skinHue(id)}, 72%, 60%, 0.6)`,
    wob: new Float32Array(WN),
    wv: new Float32Array(WN),
    domLabel: 0,
    domShare: 0,
    last: T,
    fade: 1,
    dying: false,
    alerts: new Map(),
    matchAt: -1e9,
    rings: [],
    flash: 0,
    calls: [],
    fx: [],
  };
  updateCoin(c, meta);
  coins.push(c);
  coinById.set(id, c);
  if (c.ca) coinByMint.set(c.ca, c);
  return c;
}
function updateCoin(c, m) {
  const tk = String(m.tk || m.s || '').replace(/^\$/, '').trim();
  if (tk) c.tk = tk.slice(0, 16);
  else if (!c.tk) c.tk = short(c.ca) || '???';
  if (m.n) c.name = String(m.n).slice(0, 60);
  if (m.mc > 0) c.mc = m.mc;
  if (m.ath > 0) c.ath = m.ath;
  if (m.liq > 0) c.liq = m.liq;
  if (m.v1h > 0) c.v1h = m.v1h;
  if (isB58(m.pair)) c.pair = m.pair;
  if (m.held != null) c.heldN = m.held;
  if (m.created > 0 && MODE === 'live') c.born = Math.min(c.born, (m.created - T0) / 1000);
  const img = m.img || '', img2 = m.img2 || '';
  if ((img && img !== c.img) || (img2 && img2 !== c.img2)) {
    if (img) c.img = img;
    if (img2) c.img2 = img2;
    if (!c.pic) {
      c.picFail = false;
      c.picBusy = false;
    }
  }
}

function addWallet(meta) {
  let w = walletByAddr.get(meta.a);
  if (w) {
    updateWallet(w, meta);
    return w;
  }
  const a = prand() * TAU, d = SPREAD * 0.6 * Math.sqrt(prand());
  w = { id: wallets.length, a: meta.a, n: '', img: '', x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, wt: 0.6, tier: 'B', tags: [], pos: new Map(), pnl: 0, trades: 0, lastCoin: 0, lastT: -1e9, orbit: prand() * TAU, g: -1 };
  updateWallet(w, meta);
  wallets.push(w);
  walletByAddr.set(w.a, w);
  clusterOf[w.id] = -1;
  return w;
}
function updateWallet(w, m) {
  if (m.n) w.n = String(m.n).slice(0, 40);
  if (m.img) w.img = m.img;
  if (m.wt) w.wt = m.wt;
  if (m.tier) w.tier = m.tier;
  if (Array.isArray(m.tags)) w.tags = m.tags.slice(0, 4);
  if (m.g != null) w.g = m.g;
}
const wname = (w) => w.n || short(w.a);

function addCaller(m) {
  let c = callers.get(m.k);
  if (!c) {
    c = { k: m.k, n: m.k, src: 'feed', imp: 0, boost: 500, reach: 0, hit2x: null, med: null, nCalls: 0, img: '', todayN: 0, todayBg: 0, lastT: -1e9, lastCoin: 0 };
    callers.set(m.k, c);
  }
  for (const f of ['n', 'src', 'a', 'img', 'x', 'imp', 'boost', 'reach', 'nCalls', 'how', 'xl', 'live', 'board', 'pf', 'ff', 'xf', 'aud', 'tg', 'ks', 'perDay', 'sel', 'parts']) if (m[f] != null && m[f] !== '') c[f] = m[f];
  // these can go back to "unknown"
  for (const f of ['hit2x', 'med', 'wr']) if (f in m) c[f] = m[f];
  if (m.today != null) c.todayBg = m.today;
  if (m.lastCallAt > 0) {
    const t = (m.lastCallAt - T0) / 1000;
    if (t > c.lastT) {
      c.lastT = t;
      const coin = m.lastCallMint && coinByMint.get(m.lastCallMint);
      if (coin) c.lastCoin = coin.id;
    }
  }
  return c;
}

// ───────── the two kinds of event ─────────
function pushFeed(e) {
  let i = 0;
  while (i < feed.length && feed[i].t > e.t) i++;
  feed.splice(i, 0, e);
  if (feed.length > 200) feed.length = 200;
}
function ingestTrade(ev, animate) {
  const c = ev.coin, w = ev.wallet;
  if (!c || !w || !(ev.usd > 0)) return;
  if (c.dying) {
    c.dying = false;
    c.fade = 1;
  }
  const age = Math.max(0, T - ev.t);
  const kF = Math.pow(0.5, age / HL_FLOW), kQ = Math.pow(0.5, age / HL_FAST);
  const amt = ev.usd * (w.wt || 1);
  if (ev.side === 'buy') {
    c.flow += amt * kF;
    c.inF += amt * kQ;
    const p = w.pos.get(c.id);
    if (p) {
      p.usd += ev.usd;
      p.at = Math.max(p.at, ev.t);
      if (ev.hold) p.exitAt = Math.max(p.exitAt || 0, ev.t + ev.hold);
    } else w.pos.set(c.id, { usd: ev.usd, at: ev.t, mc0: c.mc, exitAt: ev.hold ? ev.t + ev.hold : 0 });
    c.holders.set(w.id, (c.holders.get(w.id) || 0) + ev.usd);
  } else {
    c.flow -= amt * kF;
    c.outF += amt * kQ;
    const p = w.pos.get(c.id);
    if (p) {
      p.usd -= ev.cost != null ? ev.cost : ev.usd;
      if (p.usd <= 1 || ev.all) {
        w.pos.delete(c.id);
        c.holders.delete(w.id);
      } else c.holders.set(w.id, p.usd);
    }
    if (ev.pnl != null) w.pnl += ev.pnl;
  }
  c.last = Math.max(c.last, ev.t);
  w.lastCoin = c.id;
  w.trades++;
  w.lastT = Math.max(w.lastT, ev.t);
  pushFeed({ t: ev.t, type: ev.side, w: w.id, c: c.id, usd: ev.usd });
  if (animate && live && age < 300) shoot(w, c, ev.usd, ev.side);
  if (ev.side === 'buy') detect(w, c, ev.t);
}
function ingestCall(ev, animate) {
  const c = ev.coin, k = ev.caller;
  if (!c || !k) return;
  if (c.dying) {
    c.dying = false;
    c.fade = 1;
  }
  const age = Math.max(0, T - ev.t);
  const b = ev.b || k.boost || 500;
  const kF = Math.pow(0.5, age / HL_FLOW), kQ = Math.pow(0.5, age / HL_FAST);
  c.flow += b * kF;
  c.callFlow += b * kF;
  c.inF += b * kQ;
  c.calls.unshift({ t: ev.t, k: k.k, mc: ev.mc, mx: ev.mx, b, src: ev.src });
  if (c.calls.length > 8) c.calls.length = 8;
  c.last = Math.max(c.last, ev.t);
  if (ev.t >= dayStartSec() || MODE === 'demo') k.todayN++;
  if (ev.t > k.lastT) {
    k.lastT = ev.t;
    k.lastCoin = c.id;
  }
  pushFeed({ t: ev.t, type: 'call', k: k.k, c: c.id, mc: ev.mc, b, src: ev.src });
  if (animate && live && age < 600) {
    c.fx.push({ t0: now, k: k.k, src: ev.src });
    if (c.fx.length > 3) c.fx.shift();
    c.flash = 1;
  }
}

// organic momentum: the market cap speeds up with many different buyers, no smart money or call
// behind it. It grows the coin like money coming in (ev.b, USD).
function ingestOrganic(ev, animate) {
  const c = ev.coin;
  if (!c || !(ev.b > 0)) return;
  if (c.dying) {
    c.dying = false;
    c.fade = 1;
  }
  const age = Math.max(0, T - ev.t);
  const kF = Math.pow(0.5, age / HL_FLOW), kQ = Math.pow(0.5, age / HL_FAST);
  c.flow += ev.b * kF;
  c.orgFlow += ev.b * kF;
  c.inF += ev.b * kQ;
  if (ev.t >= c.orgT) {
    c.orgT = ev.t;
    c.orgG = ev.g || 0;
    c.orgN = ev.n || 0;
  }
  if (ev.mc > 0 && ev.t >= c.last) c.mc = ev.mc;
  c.last = Math.max(c.last, ev.t);
  // the feed only shows the strong ones
  if (ev.b >= 800 || ev.g >= 5) pushFeed({ t: ev.t, type: 'org', c: c.id, b: ev.b, g: ev.g, n: ev.n, a: ev.a });
  if (animate && live && age < 300) c.rings.push({ t0: now, lab: 0, org: true });
}

// ───────── detector: wallets that keep buying the same coins together ─────────
const recent = new Map(); // coin id → buys around now
const pairs = new Map(); // wallet pair → coins both bought within WIN of each other
const linked = new Set(); // pairs that coincided on LINK_K coins or more
let clusters = [];
const clusterOf = [];
const cl = (id) => (clusterOf[id] == null ? -1 : clusterOf[id]);
const labelByKey = new Map();
let nextLabel = 1;

function detect(w, c, at) {
  let list = recent.get(c.id);
  if (!list) recent.set(c.id, (list = []));
  const newest = Math.max(at, list.length ? list[list.length - 1].t : at);
  while (list.length && newest - list[0].t > WIN * 4) list.shift();
  let grew = false;
  const seen = new Set();
  for (const e of list) {
    if (e.w === w.id || seen.has(e.w) || Math.abs(e.t - at) > WIN) continue;
    seen.add(e.w);
    const a = Math.min(e.w, w.id), b = Math.max(e.w, w.id), key = a * 100000 + b;
    let p = pairs.get(key);
    if (!p) pairs.set(key, (p = { a, b, coins: new Set() }));
    p.coins.add(c.id);
    if (p.coins.size >= LINK_K && !linked.has(key)) {
      linked.add(key);
      grew = true;
    }
  }
  let i = list.length;
  while (i > 0 && list[i - 1].t > at) i--;
  list.splice(i, 0, { w: w.id, t: at });
  if (grew) rebuildClusters(at);

  const first = new Map();
  for (const e of list) if (Math.abs(e.t - at) <= WIN && !first.has(e.w)) first.set(e.w, e.t);
  if (first.size < 3) return;
  const k = cl(w.id);
  if (k >= 0) {
    const g = clusters[k];
    const mates = [...first.keys()].filter((id) => cl(id) === k);
    if (mates.length >= 3 && at - (c.alerts.get(g.label) ?? -1e9) > 240) {
      c.alerts.set(g.label, at);
      pushFeed({ t: at, type: 'group', label: g.label, c: c.id, n: mates.length, span: Math.max(...mates.map((id) => first.get(id))) - Math.min(...mates.map((id) => first.get(id))) });
      ring(c, g.label);
    }
  } else if (at - c.matchAt > 240) {
    const loose = [...first.keys()].filter((id) => cl(id) < 0);
    if (loose.length >= 3) {
      c.matchAt = at;
      pushFeed({ t: at, type: 'match', c: c.id, n: loose.length, span: Math.max(...loose.map((id) => first.get(id))) - Math.min(...loose.map((id) => first.get(id))) });
      ring(c, 0);
    }
  }
}
function rebuildClusters(at) {
  // 1. A link only counts if the pair shares another linked friend, or coincided
  //    on two extra coins: one lucky overlap is not enough to make friends.
  const adj = new Map();
  const nb = (m, x) => m.get(x) || m.set(x, new Map()).get(x);
  for (const key of linked) {
    const p = pairs.get(key);
    nb(adj, p.a).set(p.b, p.coins.size);
    nb(adj, p.b).set(p.a, p.coins.size);
  }
  const strong = new Map();
  for (const key of linked) {
    const p = pairs.get(key), A = adj.get(p.a), B = adj.get(p.b);
    let ok = p.coins.size >= LINK_K + 2;
    if (!ok) for (const x of A.keys()) if (x !== p.b && B.has(x)) { ok = true; break; }
    if (!ok) continue;
    nb(strong, p.a).set(p.b, p.coins.size);
    nb(strong, p.b).set(p.a, p.coins.size);
  }
  // 2. Each wallet joins the group its friends weigh most (weight = coins bought
  //    together), so one wallet that copies two groups can't glue them into one.
  const nodes = [...strong.keys()].sort((a, b) => a - b);
  const lab = new Map(nodes.map((n) => [n, n]));
  for (let it = 0; it < 20; it++) {
    let moved = false;
    for (const n of nodes) {
      const score = new Map();
      for (const [m, w] of strong.get(n)) score.set(lab.get(m), (score.get(lab.get(m)) || 0) + w);
      let best = lab.get(n), bestS = score.get(best) || 0;
      for (const [l, s] of score) if (s > bestS || (s === bestS && l < best)) { best = l; bestS = s; }
      if (best !== lab.get(n)) { lab.set(n, best); moved = true; }
    }
    if (!moved) break;
  }
  const comps = new Map();
  for (const n of nodes) {
    let cp = comps.get(lab.get(n));
    if (!cp) comps.set(lab.get(n), (cp = { members: new Set(), coins: new Set() }));
    cp.members.add(n);
  }
  for (const key of linked) {
    const p = pairs.get(key);
    if (!lab.has(p.a) || lab.get(p.a) !== lab.get(p.b)) continue;
    for (const id of p.coins) comps.get(lab.get(p.a)).coins.add(id);
  }
  const before = new Set(clusters.map((g) => g.label));
  const taken = new Set();
  const next = [];
  for (const cp of comps.values()) {
    if (cp.members.size < 2) continue;
    const members = [...cp.members].sort((a, b) => a - b);
    let label = labelByKey.get(members[0]);
    if (label == null || taken.has(label)) {
      let best = 0, bestN = 0;
      for (const old of clusters) {
        if (taken.has(old.label)) continue;
        const n = old.members.filter((m) => cp.members.has(m)).length;
        if (n > bestN) { bestN = n; best = old.label; }
      }
      label = best || nextLabel++;
      labelByKey.set(members[0], label);
    }
    taken.add(label);
    const conf = cp.coins.size >= 6 ? 'alta' : cp.coins.size >= 4 ? 'media' : 'baja';
    next.push({ label, color: labelColor(label), members, coins: cp.coins, conf });
  }
  next.sort((a, b) => a.label - b.label);
  clusters = next;
  for (let i = 0; i < wallets.length; i++) clusterOf[i] = -1;
  clusters.forEach((g, i) => { for (const m of g.members) clusterOf[m] = i; });
  for (const g of clusters) if (!before.has(g.label)) pushFeed({ t: at, type: 'new', label: g.label, n: g.members.length, coins: g.coins.size });
}

// ───────── clock, decay and life of the coins ─────────
function advance(to) {
  const dt = to - T;
  if (!(dt > 0)) return;
  const kF = Math.pow(0.5, dt / HL_FLOW), kQ = Math.pow(0.5, dt / HL_FAST);
  for (const c of coins) {
    c.flow *= kF;
    c.callFlow *= kF;
    c.orgFlow *= kF;
    c.inF *= kQ;
    c.outF *= kQ;
  }
  T = to;
}
let lastLife = 0;
function lifecycle() {
  const tf = tiny();
  let alive = 0;
  for (const c of coins) {
    if (c.dying) continue;
    const quiet = Math.abs(c.flow) < tf && c.callFlow < tf && c.orgFlow < tf && c.holders.size === 0;
    if (MODE === 'demo') {
      if (quiet && T - c.last > 420 && T - c.born > 360) c.dying = true;
    } else if (quiet && !(c.heldN > 0) && T - c.last > 3 * 3600) c.dying = true;
    if (!c.dying) alive++;
  }
  const cap = MODE === 'demo' ? 300 : 360;
  if (alive > cap) {
    const quiet = coins.filter((c) => !c.dying && c.holders.size === 0 && c.flow < tf * 6).sort((a, b) => a.last - b.last);
    for (let i = 0; i < alive - cap && i < quiet.length; i++) quiet[i].dying = true;
  }
  // live: positions nobody updated for 6 h are dropped (the sell may have happened elsewhere)
  if (MODE === 'live') {
    for (const w of wallets) {
      for (const [id, p] of w.pos) {
        if (T - p.at < 6 * 3600) continue;
        w.pos.delete(id);
        const c = coinById.get(id);
        if (c) c.holders.delete(w.id);
      }
    }
  }
}
function reap(dt) {
  let gone = false;
  for (const c of coins) if (c.dying && (c.fade -= dt * 1.5) <= 0) gone = true;
  if (!gone) return;
  coins = coins.filter((c) => {
    if (!c.dying || c.fade > 0) return true;
    coinById.delete(c.id);
    if (coinByMint.get(c.ca) === c) coinByMint.delete(c.ca);
    recent.delete(c.id);
    skins.delete(c.id);
    skinsHi.delete(c.id);
    thumbs.delete(c.id);
    if (sim) sim.gone(c);
    if (follow === c) follow = null;
    if (hovered && hovered.c === c) { hovered = null; tip.hidden = true; }
    return false;
  });
}

// ───────── view settings ─────────
let sizeMode = store.get('size', 'flow'), colorMode = store.get('color', 'group'), speed = 5, selLabel = 0, selCaller = null, sideTab = store.get('tab', 'callers'), cFilter = 'active';
const val = (c) => (sizeMode === 'flow' ? Math.max(0, c.flow) : sizeMode === 'held' ? c.held : sizeMode === 'calls' ? c.callFlow : sizeMode === 'organic' ? c.orgFlow : Math.max(c.holders.size, c.heldN || 0));
let vmaxS = 0;
function updateScale(dt) {
  let m = 0;
  for (const c of coins) if (!c.dying) m = Math.max(m, val(c));
  m = Math.max(m, sizeMode === 'wallets' ? 3 : 1500);
  if (!vmaxS) vmaxS = m;
  vmaxS += (m - vmaxS) * (1 - Math.exp(-dt / (m > vmaxS ? 0.8 : 6)));
}
function targetR(c) {
  if (c.dying) return c.r;
  const v = val(c);
  if (sizeMode === 'wallets' ? v < 1 : v < Math.max(tiny() * 4, vmaxS * 0.003)) return PELLET_R;
  return 18 + (R_MAX - 18) * Math.sqrt(Math.min(1.15, v / vmaxS));
}
const valText = (c) => {
  if (sizeMode === 'wallets') {
    const n = Math.max(c.holders.size, c.heldN || 0);
    return `${n} ${n === 1 ? 'wallet' : 'wallets'}`;
  }
  return fmtUsd(val(c));
};

// ───────── links that pull related coins together ─────────
let links = [];
function computeLinks() {
  const m = new Map();
  const add = (a, b) => {
    if (a === b) return;
    const k = Math.min(a, b) * 1000000 + Math.max(a, b);
    m.set(k, (m.get(k) || 0) + 1);
  };
  for (const w of wallets) {
    if (w.pos.size < 2) continue;
    const ids = [...w.pos.keys()];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j]);
  }
  const byLab = new Map();
  for (const c of coins) {
    if (!c.domLabel || c.dying) continue;
    let l = byLab.get(c.domLabel);
    if (!l) byLab.set(c.domLabel, (l = []));
    l.push(c.id);
  }
  for (const l of byLab.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) add(l[i], l[j]);
  links = [];
  for (const [k, n] of m) {
    const a = coinById.get(Math.floor(k / 1000000)), b = coinById.get(k % 1000000);
    if (a && b) links.push([a, b, n]);
  }
}
function dominance() {
  for (const c of coins) {
    let tot = 0, best = 0, bestK = -1;
    const by = new Map();
    for (const [wid, usd] of c.holders) {
      tot += usd;
      const k = cl(wid);
      if (k < 0) continue;
      const s = (by.get(k) || 0) + usd;
      by.set(k, s);
      if (s > best) { best = s; bestK = k; }
    }
    c.held = tot;
    c.domLabel = bestK >= 0 && best >= tot * 0.4 ? clusters[bestK].label : 0;
    c.domShare = tot > 0 ? best / tot : 0;
  }
}

// ───────── physics: agar.io cells that push, wobble and drift ─────────
function physics(dt) {
  const cells = [];
  for (const c of coins) {
    const tr = targetR(c);
    c.r += (tr - c.r) * (1 - Math.exp(-dt * 4.5));
    c.isCell = c.r > CELL_MIN || tr > CELL_MIN;
    if (c.isCell) cells.push(c);
    if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 1.6);
  }
  const damp = Math.exp(-dt * 2.4);
  for (const c of cells) {
    const g = 0.05 + Math.min(c.r, 240) / 2000;
    c.vx += (CX - c.x) * g * dt;
    c.vy += (CY - c.y) * g * dt;
    c.wa += (Math.random() - 0.5) * dt * 1.2;
    c.vx += Math.cos(c.wa) * 5 * dt;
    c.vy += Math.sin(c.wa) * 5 * dt;
  }
  for (const [a, b, n] of links) {
    if (a.dying || b.dying || !a.isCell || !b.isCell) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, rest = a.r + b.r + 36;
    if (d <= rest) continue;
    const f = (Math.min(n, 4) * 0.07 * (d - rest) * dt) / d;
    const ma = a.r * a.r, mb = b.r * b.r, sa = mb / (ma + mb), sb = ma / (ma + mb);
    a.vx += dx * f * sa * 2;
    a.vy += dy * f * sa * 2;
    b.vx -= dx * f * sb * 2;
    b.vy -= dy * f * sb * 2;
  }
  for (const c of cells) {
    c.vx *= damp;
    c.vy *= damp;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j], min = a.r + b.r + 10, dx = b.x - a.x, dy = b.y - a.y;
      if (dx > min || dx < -min || dy > min || dy < -min) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01, over = min - d, ux = dx / d, uy = dy / d;
      const ma = a.r * a.r, mb = b.r * b.r, sa = mb / (ma + mb), sb = ma / (ma + mb);
      a.x -= ux * over * sa;
      a.y -= uy * over * sa;
      b.x += ux * over * sb;
      b.y += uy * over * sb;
      if (over > 2 && live && !reduced) {
        kick(a, Math.atan2(uy, ux), over / 30);
        kick(b, Math.atan2(-uy, -ux), over / 30);
      }
    }
  }
  for (const c of cells) {
    c.x = clamp(c.x, c.r, WORLD - c.r);
    c.y = clamp(c.y, c.r, WORLD - c.r);
  }
  for (const p of coins) {
    if (p.isCell) continue;
    for (const c of cells) {
      const min = c.r + p.r + 6, dx = p.x - c.x, dy = p.y - c.y;
      if (dx > min || dx < -min || dy > min || dy < -min) continue;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 0.01) { p.x = c.x + min; continue; }
      p.x = c.x + (dx / d) * min;
      p.y = c.y + (dy / d) * min;
    }
  }
}
function kick(c, ang, s) {
  if (c.r * cam.z < 14) return;
  const idx = Math.round(((((ang % TAU) + TAU) % TAU) / TAU) * WN) % WN;
  const amp = c.r * 1.1 * Math.min(1, s);
  for (let j = -3; j <= 3; j++) c.wv[(idx + j + WN) % WN] -= amp * (1 - Math.abs(j) / 4);
}
function wobble(c, dt) {
  const w = c.wob, v = c.wv;
  for (let i = 0; i < WN; i++) {
    const l = w[(i + WN - 1) % WN], r = w[(i + 1) % WN];
    v[i] += (-110 * w[i] - 7 * v[i] + 70 * (l + r - 2 * w[i])) * dt;
  }
  for (let i = 0; i < WN; i++) w[i] += v[i] * dt;
  if (Math.random() < dt * 0.35) kick(c, Math.random() * TAU, 0.05);
}
const shown = (w) => w.pos.size > 0 || T - w.lastT < 7200;
function moveWallets(dt) {
  const k = 1 - Math.exp(-dt * 2.2);
  for (const w of wallets) {
    if (!shown(w)) continue;
    let home = null, best = 0;
    for (const [id, p] of w.pos) {
      if (p.usd <= best) continue;
      const c = coinById.get(id);
      if (c && !c.dying) { best = p.usd; home = c; }
    }
    let tx = w.x, ty = w.y;
    if (home) {
      const ang = w.orbit + now * 0.00025 * (w.id % 2 ? 1 : -1);
      tx = home.x + Math.cos(ang) * (home.r + 14);
      ty = home.y + Math.sin(ang) * (home.r + 14);
    } else {
      const c = coinById.get(w.lastCoin);
      if (c) {
        tx = c.x + Math.cos(w.orbit) * (c.r + 70);
        ty = c.y + Math.sin(w.orbit) * (c.r + 70);
      }
    }
    w.x += (tx - w.x) * k;
    w.y += (ty - w.y) * k;
  }
}

// ───────── particles: money flying into and out of coins ─────────
const parts = [];
function shoot(w, c, usd, kind) {
  if (parts.length > 320) return;
  const k = cl(w.id);
  const ax = kind === 'buy' ? w.x : c.x, ay = kind === 'buy' ? w.y : c.y;
  parts.push({ w, c, usd, kind, lab: k >= 0 ? clusters[k].label : 0, t0: now, dur: 650 + Math.random() * 400, curve: (Math.random() - 0.5) * 0.44, ax, ay, x: ax, y: ay, px: ax, py: ay });
}
function ring(c, lab) {
  c.flash = 1;
  if (live) c.rings.push({ t0: now, lab }, { t0: now + 280, lab });
}
function updateParticles() {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i], c = p.c, w = p.w;
    const u = (now - p.t0) / p.dur;
    if (u >= 1 || !coinById.has(c.id)) {
      if (u >= 1 && p.kind === 'buy' && !reduced) {
        kick(c, Math.atan2(p.y - c.y, p.x - c.x), Math.min(1, 0.35 + Math.sqrt(p.usd / 150) / 3));
        c.flash = Math.max(c.flash, 0.25);
      }
      parts.splice(i, 1);
      continue;
    }
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    let ax, ay, bx, by;
    if (p.kind === 'buy') {
      ax = p.ax;
      ay = p.ay;
      const ang = Math.atan2(ay - c.y, ax - c.x);
      bx = c.x + Math.cos(ang) * c.r * 0.55;
      by = c.y + Math.sin(ang) * c.r * 0.55;
    } else {
      const ang = Math.atan2(w.y - c.y, w.x - c.x);
      ax = c.x + Math.cos(ang) * c.r;
      ay = c.y + Math.sin(ang) * c.r;
      bx = w.x;
      by = w.y;
    }
    const dx = bx - ax, dy = by - ay, mx = (ax + bx) / 2 - dy * p.curve, my = (ay + by) / 2 + dx * p.curve, q = 1 - e;
    p.px = p.x;
    p.py = p.y;
    p.x = q * q * ax + 2 * q * e * mx + e * e * bx;
    p.y = q * q * ay + 2 * q * e * my + e * e * by;
  }
}

// ───────── theme ─────────
const theme = {};
const TOKENS = { map: '--map', fg: '--map-fg', grid: '--grid', edge: '--edge', link: '--link', neutral: '--neutral-cell', free: '--wallet-free', buy: '--buy', sell: '--sell', alert: '--alert', cellText: '--cell-text', ink: '--ink', hudFg: '--hud-fg', hudDim: '--hud-dim' };
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  for (const k in TOKENS) theme[k] = cs.getPropertyValue(TOKENS[k]).trim();
}
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let themeChoice = store.get('theme', 'system');
if (!['light', 'dark', 'system'].includes(themeChoice)) themeChoice = 'system';
function isDark() {
  return themeChoice === 'dark' || (themeChoice === 'system' && systemDark.matches);
}
function applyTheme() {
  if (themeChoice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = themeChoice;
  const dark = isDark();
  const b = document.getElementById('themeToggle');
  if (b) {
    b.setAttribute('aria-pressed', String(dark));
    b.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo nocturno');
    b.querySelector('.theme-icon').textContent = dark ? '☀' : '☾';
    b.querySelector('.theme-name').textContent = dark ? 'Día' : 'Noche';
    b.title = dark ? 'Cambiar a modo claro' : 'Cambiar a modo nocturno';
  }
  readTheme();
}
document.getElementById('themeToggle').addEventListener('click', () => {
  themeChoice = isDark() ? 'light' : 'dark';
  store.set('theme', themeChoice);
  applyTheme();
});
const rgbCache = new Map();
const rgb = (hex) => {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
};
const toHex = (r, g, b) => '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
const mix = (a, b, t) => {
  const x = rgb(a), y = rgb(b);
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
};
const shadeCache = new Map();
const shade = (hex, f) => {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (!v) {
    const x = rgb(hex);
    v = toHex(x[0] * f, x[1] * f, x[2] * f);
    shadeCache.set(key, v);
  }
  return v;
};
function cellColor(c) {
  if (colorMode === 'flow') {
    const k = Math.round(Math.tanh((c.inF - c.outF) / Math.max(450, vmaxS * 0.05)) * 20) / 20;
    return k >= 0 ? mix(theme.neutral, theme.buy, k) : mix(theme.neutral, theme.sell, -k);
  }
  return c.domLabel ? labelColor(c.domLabel) : theme.neutral;
}

// ───────── pictures: the coin's own image, or a cartoon while it loads ─────────
const SKIN = 160, SKIN_HI = 384, PIC = 256;
const skins = new Map();
const skinsHi = new Map();
const thumbs = new Map();
function skinOf(c) {
  let s = skins.get(c.id);
  if (!s) {
    s = makeSkin({ id: c.id, tk: c.tk.toUpperCase() }, SKIN);
    skins.set(c.id, s);
    if (skins.size > 320) {
      for (const id of skins.keys()) {
        const o = coinById.get(id);
        if (o && o.isCell) continue;
        skins.delete(id);
        if (skins.size <= 260) break;
      }
    }
  }
  return s;
}
function skinFor(c, px) {
  if (px <= SKIN * 1.25) return skinOf(c);
  let s = skinsHi.get(c.id);
  if (!s) {
    s = makeSkin({ id: c.id, tk: c.tk.toUpperCase() }, SKIN_HI);
    skinsHi.set(c.id, s);
    if (skinsHi.size > 16) skinsHi.delete(skinsHi.keys().next().value);
  }
  return s;
}
function thumb(c) {
  let u = thumbs.get(c.id);
  if (!u) {
    const t = document.createElement('canvas');
    t.width = t.height = 80;
    t.getContext('2d').drawImage(skinOf(c), 0, 0, 80, 80);
    u = t.toDataURL('image/png');
    thumbs.set(c.id, u);
  }
  return u;
}
const normUrl = (u) => {
  if (!u || typeof u !== 'string') return '';
  u = u.trim();
  if (u.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + u.slice(7).replace(/^ipfs\//, '');
  return /^https:\/\//i.test(u) ? u : '';
};
const picQueue = [];
let picLoading = 0;
function wantPic(c) {
  if (MODE === 'demo' || c.pic || c.picBusy || c.picFail) return;
  c.picBusy = true;
  picQueue.push(c);
  pumpPics();
}
function pumpPics() {
  while (picLoading < 6 && picQueue.length) {
    const c = picQueue.shift();
    if (!coinById.has(c.id)) { c.picBusy = false; continue; }
    const urls = [normUrl(c.img2), normUrl(c.img)].filter((u, i, a) => u && a.indexOf(u) === i);
    if (!urls.length) { c.picBusy = false; c.picFail = true; continue; }
    picLoading++;
    loadPic(c, urls, 0);
  }
}
function loadPic(c, urls, i) {
  if (i >= urls.length) {
    c.picBusy = false;
    c.picFail = true;
    picLoading--;
    pumpPics();
    return;
  }
  const im = new Image();
  im.decoding = 'async';
  im.referrerPolicy = 'no-referrer';
  let done = false;
  const fin = (ok) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (!ok) return loadPic(c, urls, i + 1);
    const cv = document.createElement('canvas');
    cv.width = cv.height = PIC;
    const g = cv.getContext('2d');
    const w = im.naturalWidth, h = im.naturalHeight, s = Math.min(w, h);
    g.drawImage(im, (w - s) / 2, (h - s) / 2, s, s, 0, 0, PIC, PIC);
    c.pic = cv;
    c.picUrl = urls[i];
    c.picBusy = false;
    picLoading--;
    pumpPics();
  };
  const timer = setTimeout(() => fin(false), 12000);
  im.onload = () => fin(im.naturalWidth > 0);
  im.onerror = () => fin(false);
  im.src = urls[i];
}
const picOf = (c, px) => {
  if (c.pic) return c.pic;
  wantPic(c);
  return skinFor(c, px);
};
const thumbUrl = (c) => {
  const u = c.picUrl || normUrl(c.img2) || normUrl(c.img);
  return u ? u.replace('variant=600x600', 'variant=86x86') : '';
};
// the cartoon until the coin's own picture has loaded for the map, then the real one
const pfpHtml = (c, cls = 'pfp') => {
  const fb = thumb(c);
  const u = MODE === 'live' && c.pic ? thumbUrl(c) : '';
  return `<img class="${cls}" src="${esc(u || fb)}" data-fb="${esc(fb)}" alt="" style="--c:${ringOf(c)}" referrerpolicy="no-referrer">`;
};
const ringOf = (c) => (c.domLabel ? labelColor(c.domLabel) : 'var(--neutral-cell)');
document.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (t.dataset.fb && t.getAttribute('src') !== t.dataset.fb) t.src = t.dataset.fb;
    else if (t.hasAttribute('data-hide')) t.remove();
  },
  true
);

// ───────── camera ─────────
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('mini');
const mctx = mini.getContext('2d');
const tip = document.getElementById('tip');
const cam = { x: CX, y: CY, z: 0.3 };
let follow = null, followZ = 0, hovered = null;
let W = innerWidth, H = innerHeight, dpr = 1;
// Render scale: the screen's pixel density, lowered by half a step while frames
// come in slow (weak GPU, big zoom on a retina screen) and restored on zooming out.
const maxScale = () => Math.min(2, devicePixelRatio || 1);
let renderScale = maxScale(), dropZ = Infinity, gapSum = 0, gapN = 0, startedAt = 0;
function adaptScale(gap, ts) {
  if (gap > 200 || ts - startedAt < 2500) return;
  gapSum += gap;
  if (++gapN < 45) return;
  const avg = gapSum / gapN;
  gapSum = gapN = 0;
  if (avg > 24 && renderScale > 1) {
    renderScale = Math.max(1, renderScale - 0.5);
    dropZ = cam.z;
    resize();
  } else if (renderScale < maxScale() && cam.z < dropZ * 0.6) {
    renderScale = maxScale();
    dropZ = Infinity;
    resize();
  }
}
function resize() {
  dpr = Math.min(renderScale, maxScale());
  W = canvas.clientWidth || innerWidth;
  H = canvas.clientHeight || innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
const toWorld = (sx, sy) => [cam.x + (sx - W / 2) / cam.z, cam.y + (sy - H / 2) / cam.z];
const toScreen = (wx, wy) => [(wx - cam.x) * cam.z + W / 2, (wy - cam.y) * cam.z + H / 2];
function fit() {
  // frame the biggest cells; small ones still drifting in from the edge can stay off-screen
  const cs = coins.filter((c) => c.isCell && !c.dying).sort((a, b) => b.r - a.r).slice(0, 16);
  const wide = W > 760;
  const availW = Math.max(220, W - (wide ? 660 : 40)), availH = Math.max(220, H - (wide ? 170 : 340));
  if (!cs.length) {
    cam.x = CX;
    cam.y = CY;
    cam.z = Math.min(availW, availH) / (SPREAD * 2.2);
    return;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) {
    x0 = Math.min(x0, c.x - c.r);
    y0 = Math.min(y0, c.y - c.r);
    x1 = Math.max(x1, c.x + c.r);
    y1 = Math.max(y1, c.y + c.r);
  }
  cam.z = clamp(Math.min(availW / (x1 - x0 + 160), availH / (y1 - y0 + 160)), 0.1, 1.1);
  cam.x = (x0 + x1) / 2 - (wide ? 50 / cam.z : 0); // the left HUD column is wider than the right one
  cam.y = (y0 + y1) / 2;
}
function fitTo(list) {
  const wide = W > 760;
  const availW = Math.max(220, W - (wide ? 660 : 40)), availH = Math.max(220, H - (wide ? 170 : 340));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of list) {
    const r = Math.max(c.r, 40);
    x0 = Math.min(x0, c.x - r);
    y0 = Math.min(y0, c.y - r);
    x1 = Math.max(x1, c.x + r);
    y1 = Math.max(y1, c.y + r);
  }
  cam.z = clamp(Math.min(availW / (x1 - x0 + 200), availH / (y1 - y0 + 200)), 0.1, 1.1);
  cam.x = (x0 + x1) / 2 - (wide ? 50 / cam.z : 0);
  cam.y = (y0 + y1) / 2;
}
function zoomAt(sx, sy, f) {
  const [wx, wy] = toWorld(sx, sy);
  cam.z = clamp(cam.z * f, 0.08, 3);
  if (follow) followZ = cam.z;
  else {
    cam.x = wx - (sx - W / 2) / cam.z;
    cam.y = wy - (sy - H / 2) / cam.z;
  }
}
function camera(dt) {
  if (!follow) return;
  if (follow.dying || !coinById.has(follow.id)) { setFollow(null); return; }
  const k = 1 - Math.exp(-dt * 3.5);
  cam.x += (follow.x - cam.x) * k;
  cam.y += (follow.y - cam.y) * k;
  if (followZ) cam.z += (followZ - cam.z) * k;
}
function setFollow(c) {
  follow = c;
  if (c) followZ = clamp((Math.min(W, H) * 0.2) / Math.max(c.r, 30), 0.3, 1.6);
  if (MODE === 'live' && port) port.postMessage({ type: 'focus', mint: c ? c.ca : null });
}

// ───────── drawing ─────────
const PB = new Float32Array(WN * 2);
function cellPath(c) {
  for (let i = 0; i < WN; i++) {
    const rad = c.r + clamp(c.wob[i], -c.r * 0.14, c.r * 0.14);
    PB[2 * i] = c.x + COS[i] * rad;
    PB[2 * i + 1] = c.y + SIN[i] * rad;
  }
  ctx.beginPath();
  ctx.moveTo((PB[2 * WN - 2] + PB[0]) / 2, (PB[2 * WN - 1] + PB[1]) / 2);
  for (let i = 0; i < WN; i++) {
    const j = (i + 1) % WN;
    ctx.quadraticCurveTo(PB[2 * i], PB[2 * i + 1], (PB[2 * i] + PB[2 * j]) / 2, (PB[2 * i + 1] + PB[2 * j + 1]) / 2);
  }
  ctx.closePath();
}
function drawGrid() {
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
  let stepW = 50;
  while (stepW * cam.z < 10) stepW *= 5;
  const ax = Math.max(0, x0), bx = Math.min(WORLD, x1), ay = Math.max(0, y0), by = Math.min(WORLD, y1);
  ctx.beginPath();
  for (let x = Math.ceil(ax / stepW) * stepW; x <= bx; x += stepW) { ctx.moveTo(x, ay); ctx.lineTo(x, by); }
  for (let y = Math.ceil(ay / stepW) * stepW; y <= by; y += stepW) { ctx.moveTo(ax, y); ctx.lineTo(bx, y); }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1 / cam.z;
  ctx.stroke();
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = 2 / cam.z;
  ctx.strokeRect(0, 0, WORLD, WORLD);
}
function focusSets() {
  if (selCaller) {
    const k = callers.get(selCaller);
    if (!k) { selCaller = null; return null; }
    const cs = new Set();
    for (const c of coins) if (c.calls.some((x) => ck(x.k) === selCaller)) cs.add(c.id);
    return { ws: new Set(), cs, caller: true };
  }
  if (!selLabel) return null;
  const g = clusters.find((x) => x.label === selLabel);
  if (!g) { selLabel = 0; return null; }
  const ws = new Set(g.members), cs = new Set();
  for (const id of g.members) for (const cid of wallets[id].pos.keys()) cs.add(cid);
  return { ws, cs };
}
function drawHoverLinks() {
  if (!hovered) return;
  const z = cam.z;
  ctx.strokeStyle = theme.link;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9;
  if (hovered.c) {
    const c = hovered.c, rel = new Map();
    for (const wid of c.holders.keys()) for (const cid of wallets[wid].pos.keys()) if (cid !== c.id) rel.set(cid, (rel.get(cid) || 0) + 1);
    for (const [cid, n] of rel) {
      const o = coinById.get(cid);
      if (!o) continue;
      ctx.lineWidth = (1.2 + n * 1.3) / z;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
    }
  } else if (hovered.w) {
    const w = hovered.w;
    for (const cid of w.pos.keys()) {
      const o = coinById.get(cid);
      if (!o) continue;
      ctx.lineWidth = 1.8 / z;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
function drawCell(c, z, dim) {
  const ringC = cellColor(c);
  const heat = c.inF - c.outF;
  const hs = Math.max(150, vmaxS * 0.02);
  if (Math.abs(heat) > hs * 0.3) {
    const lw = Math.min(c.r * 0.35, (5 + Math.min(Math.abs(heat) / hs, 8) * 1.4) / z);
    ctx.globalAlpha = c.fade * dim * Math.min(0.55, Math.abs(heat) / hs / 8 + 0.14);
    ctx.strokeStyle = heat > 0 ? theme.buy : theme.sell;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + lw / 2 + 3 / z, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = c.fade * dim;
  if (reduced || c.r * z < 14) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, TAU);
  } else cellPath(c);
  // the coin's picture fills the cell (the path stays set for the ring below)
  ctx.save();
  ctx.clip();
  const k = c.r * 1.16;
  ctx.drawImage(picOf(c, k * 2 * z * dpr), c.x - k, c.y - k, k * 2, k * 2);
  if (c.flash > 0.01) {
    ctx.globalAlpha = c.fade * dim * c.flash * 0.4;
    ctx.fillStyle = theme.cellText;
    ctx.fillRect(c.x - k, c.y - k, k * 2, k * 2);
  }
  ctx.restore();
  // ring in the colour of the group that holds the most (or of the flow)
  const rw = Math.max(3 / z, c.r * 0.12);
  ctx.lineWidth = rw + 3 / z;
  ctx.strokeStyle = shade(ringC, 0.5);
  ctx.stroke();
  ctx.lineWidth = rw;
  ctx.strokeStyle = ringC;
  ctx.stroke();
  if (follow === c) {
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([8 / z, 6 / z]);
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = 2 / z;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + 12 / z, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
function draw() {
  const z = cam.z;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.map;
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
  drawGrid();
  const [vx0, vy0] = toWorld(0, 0), [vx1, vy1] = toWorld(W, H);
  const vis = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
  const focus = focusSets();
  const dimC = (c) => (focus && !focus.cs.has(c.id) ? 0.16 : 1);
  const dimW = (w) => (focus && (focus.caller || !focus.ws.has(w.id)) ? 0.16 : 1);

  drawHoverLinks();

  // pellets: coins with no smart money in them right now
  for (const c of coins) {
    if (c.isCell || !vis(c.x, c.y, c.r)) continue;
    ctx.globalAlpha = c.fade * dimC(c);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(c.r, 1.6 / z), 0, TAU);
    if (c.r * z >= 6) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(picOf(c, c.r * 2 * z * dpr), c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      ctx.restore();
      ctx.lineWidth = 1.5 / z;
      ctx.strokeStyle = theme.edge;
      ctx.stroke();
    } else {
      ctx.fillStyle = c.pc;
      ctx.fill();
    }
  }
  const cells = coins.filter((c) => c.isCell && vis(c.x, c.y, c.r * 1.5 + 60 / z)).sort((a, b) => a.r - b.r);
  for (const c of cells) drawCell(c, z, dimC(c));

  // Permanent locator for the selected coin, including tiny coins not yet grown.
  if (follow && !follow.dying && vis(follow.x, follow.y, follow.r + 40 / z)) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3 / z;
    ctx.strokeStyle = theme.alert;
    ctx.setLineDash([10 / z, 5 / z]);
    ctx.beginPath();
    ctx.arc(follow.x, follow.y, Math.max(follow.r, 8 / z) + 19 / z, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // smart wallets
  const hc = hovered && hovered.c;
  for (const w of wallets) {
    if (!shown(w) || !vis(w.x, w.y, 20 / z)) continue;
    const k = cl(w.id);
    const r = clamp((w.tier === 'S' ? 8.5 : 7) * z, 2.6, 8.5) / z;
    ctx.globalAlpha = dimW(w);
    ctx.beginPath();
    ctx.arc(w.x, w.y, r, 0, TAU);
    ctx.fillStyle = k >= 0 ? clusters[k].color : theme.free;
    ctx.fill();
    ctx.lineWidth = (w.tier === 'S' ? 2.4 : 1.6) / z;
    ctx.strokeStyle = w.tier === 'S' ? theme.alert : theme.map;
    ctx.stroke();
    if ((hc && hc.holders.has(w.id)) || (hovered && hovered.w === w)) {
      ctx.lineWidth = 2 / z;
      ctx.strokeStyle = theme.fg;
      ctx.beginPath();
      ctx.arc(w.x, w.y, r + 4 / z, 0, TAU);
      ctx.stroke();
    }
  }

  // money in flight
  ctx.lineCap = 'round';
  for (const p of parts) {
    const r = clamp((3.5 + Math.sqrt(p.usd / 150) * 2.6) * z, 2, 8) / z;
    const col = p.kind === 'sell' ? theme.sell : p.lab ? labelColor(p.lab) : theme.buy;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = r * 0.9;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(p.x - (p.x - p.px) * 3, p.y - (p.y - p.py) * 3);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
  }

  // coordinated-entry rings, and the shock wave of a call
  for (const c of coins) {
    for (let i = c.rings.length - 1; i >= 0; i--) {
      const rg = c.rings[i], u = (now - rg.t0) / 1700;
      if (u < 0) continue;
      if (u >= 1) { c.rings.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - u) * c.fade;
      ctx.strokeStyle = rg.org ? theme.buy : rg.lab ? labelColor(rg.lab) : theme.alert;
      ctx.lineWidth = (4.5 - 3 * u) / z;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 10 / z + (reduced ? 0 : u * (c.r * 0.9 + 60)), 0, TAU);
      ctx.stroke();
    }
    for (let i = c.fx.length - 1; i >= 0; i--) {
      const f = c.fx[i], u = (now - f.t0) / 2600;
      if (u >= 1) { c.fx.splice(i, 1); continue; }
      const k = callerOf(f.k);
      ctx.globalAlpha = (1 - u) * 0.9 * c.fade;
      ctx.strokeStyle = impColor(k ? k.imp : 0);
      ctx.lineWidth = (6 - 4 * u) / z;
      ctx.setLineDash([10 / z, 7 / z]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 8 / z + (reduced ? 0 : u * (c.r * 1.2 + 90)), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // labels, in screen space so the text stays crisp
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const c of cells) {
    const rs = c.r * z;
    if (rs < 17) continue;
    const [sx, sy] = toScreen(c.x, c.y);
    ctx.globalAlpha = c.fade * dimC(c);
    const name = '$' + c.tk;
    let fs = clamp(rs * 0.3, 11, 40);
    ctx.font = `700 ${fs}px ${FONT}`;
    const tw = ctx.measureText(name).width;
    if (tw > rs * 1.66) {
      fs = (fs * rs * 1.66) / tw;
      if (fs < 10) continue; // too small to read: the tooltip and the leaderboard have it
      ctx.font = `700 ${fs}px ${FONT}`;
    }
    const two = rs >= 30;
    const y1 = sy + rs * (two ? 0.26 : 0.3); // low in the circle, so the picture stays visible
    ctx.lineWidth = Math.max(2.4, fs * 0.17);
    ctx.strokeStyle = theme.ink;
    ctx.fillStyle = theme.cellText;
    ctx.strokeText(name, sx, y1);
    ctx.fillText(name, sx, y1);
    if (two) {
      const f2 = Math.max(10, fs * 0.52), t2 = valText(c), y2 = y1 + fs * 0.55 + f2 * 0.55;
      ctx.font = `700 ${f2}px ${FONT}`;
      ctx.lineWidth = Math.max(2, f2 * 0.17);
      ctx.strokeText(t2, sx, y2);
      ctx.fillText(t2, sx, y2);
    }
    // megaphone badge: calls in the last 2 hours
    const nCalls = c.calls.filter((x) => T - x.t < 7200).length;
    if (nCalls && rs >= 24) {
      const top = c.calls[0];
      const k = callerOf(top.k);
      const bx = sx + rs * 0.72, by = sy - rs * 0.72, br = clamp(rs * 0.17, 9, 16);
      ctx.globalAlpha = c.fade * dimC(c);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fillStyle = impColor(k ? k.imp : 0);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.ink;
      ctx.stroke();
      ctx.font = `700 ${Math.round(br * 1.05)}px ${FONT}`;
      ctx.fillStyle = theme.ink;
      ctx.fillText(nCalls > 1 ? String(nCalls) : callIcon(top.src), bx, by + 0.5);
    }
    // sprout badge: organic momentum in the last 5 minutes
    if (T - c.orgT < 300 && rs >= 24) {
      const bx = sx - rs * 0.72, by = sy - rs * 0.72, br = clamp(rs * 0.17, 9, 16);
      ctx.globalAlpha = c.fade * dimC(c);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fillStyle = theme.buy;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.ink;
      ctx.stroke();
      ctx.font = `700 ${Math.round(br * 1.05)}px ${FONT}`;
      ctx.fillStyle = theme.ink;
      ctx.fillText('🌱', bx, by + 0.5);
    }
  }
  // the caller's name rises from the coin for a moment
  for (const c of coins) {
    if (!c.fx.length || !vis(c.x, c.y, c.r + 200)) continue;
    const f = c.fx[c.fx.length - 1], u = (now - f.t0) / 2600;
    const k = callerOf(f.k);
    if (!k) continue;
    const [sx, sy] = toScreen(c.x, c.y);
    const txt = `${callIcon(f.src)} ${k.n}`;
    ctx.globalAlpha = clamp(1.4 - u * 1.4, 0, 1) * c.fade;
    ctx.font = `700 13px ${FONT}`;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = theme.ink;
    ctx.fillStyle = impColor(k.imp);
    const y = sy - c.r * z - 14 - u * 26;
    ctx.strokeText(txt, sx, y);
    ctx.fillText(txt, sx, y);
  }
  // wallet names: for the hovered coin's holders, or for everyone when zoomed far in
  const named = (w) => z >= 1.4 || (hc && hc.holders.has(w.id)) || (hovered && hovered.w === w);
  if (z >= 1.4 || hovered) {
    ctx.font = `700 11px ${MONO}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.map;
    ctx.fillStyle = theme.fg;
    for (const w of wallets) {
      if (!shown(w) || !named(w)) continue;
      const [sx, sy] = toScreen(w.x, w.y);
      if (sx < -40 || sy < -20 || sx > W + 40 || sy > H + 20) continue;
      ctx.globalAlpha = dimW(w);
      const t = wname(w);
      ctx.strokeText(t, sx, sy - 14);
      ctx.fillText(t, sx, sy - 14);
    }
  }
  ctx.globalAlpha = 1;
}
function drawMini() {
  const size = mini.clientWidth;
  if (!size) return;
  const md = Math.min(2, devicePixelRatio || 1);
  if (mini.width !== Math.round(size * md)) {
    mini.width = Math.round(size * md);
    mini.height = Math.round(size * md);
  }
  const s = size / WORLD;
  mctx.setTransform(md, 0, 0, md, 0, 0);
  mctx.clearRect(0, 0, size, size);
  mctx.globalAlpha = 0.55;
  mctx.fillStyle = theme.hudDim;
  for (const c of coins) if (!c.isCell && !c.dying) mctx.fillRect(c.x * s - 0.5, c.y * s - 0.5, 1, 1);
  mctx.globalAlpha = 1;
  for (const c of coins) {
    if (!c.isCell || c.dying) continue;
    mctx.fillStyle = cellColor(c);
    mctx.beginPath();
    mctx.arc(c.x * s, c.y * s, Math.max(1.6, c.r * s), 0, TAU);
    mctx.fill();
  }
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
  mctx.strokeStyle = theme.hudFg;
  mctx.lineWidth = 1;
  mctx.strokeRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
}

// ───────── HUD ─────────
const $ = (id) => document.getElementById(id);
const boardEl = $('board'), groupList = $('groupList'), callerList = $('callerList'), feedEl = $('feed'), statsEl = $('stats'), metricEl = $('metric'), groupCount = $('groupCount'), callerCount = $('callerCount'), chipsEl = $('chips'), noteEl = $('note'), badge = $('modeBadge');
const METRIC = {
  flow: () => `Entrada neta de smart money (ponderada por PnL), callers y subidas orgánicas · vida media ${MODE === 'demo' ? '5' : '15'} min`,
  held: () => 'Dinero smart en posición ahora',
  wallets: () => 'Smart wallets dentro ahora (incluye el top PnL que la tiene)',
  calls: () => `Empuje de los callers según su impacto · vida media ${MODE === 'demo' ? '5' : '15'} min`,
  organic: () => `Subida orgánica: el market cap acelera con muchos compradores distintos, sin smart money ni calls · vida media ${MODE === 'demo' ? '5' : '15'} min`,
};
let lastBoard = '', lastGroups = '', lastCallers = '', lastFeed = '', lastStats = '', lastChips = '';
function renderBoard(force) {
  const min = sizeMode === 'wallets' ? 0.5 : tiny() * 4;
  const top = coins.filter((c) => !c.dying && val(c) > min).sort((a, b) => val(b) - val(a)).slice(0, 10);
  const html = top.map((c, i) => `<li><button type="button" data-coin="${c.id}"${follow === c ? ' class="on"' : ''}><span class="rk">${i + 1}.</span>${pfpHtml(c)}<span class="tk">$${esc(c.tk)}</span><span class="v">${sizeMode === 'wallets' ? Math.max(c.holders.size, c.heldN || 0) : esc(fmtUsd(val(c)))}</span></button></li>`).join('') || `<li class="empty">${MODE === 'live' ? 'Esperando la primera entrada de smart money…' : 'Aún no entra nada'}</li>`;
  if (force || html !== lastBoard) { boardEl.innerHTML = html; lastBoard = html; }
  metricEl.textContent = METRIC[sizeMode]();
}
function renderGroups(force) {
  const html = clusters.length
    ? clusters.map((g) => `<li><button type="button" data-label="${g.label}" aria-pressed="${selLabel === g.label}"><span class="sw" style="--c:${g.color}"></span><span class="gname">Grupo ${g.label}</span><span class="conf conf-${g.conf}" title="Confianza">${g.conf}</span><span class="gmeta">${g.members.length} wallets · ${g.coins.size} monedas juntas</span></button></li>`).join('')
    : '<li class="empty">Aún nada. Salen cuando varias wallets coinciden en 3 monedas.</li>';
  if (force || html !== lastGroups) { groupList.innerHTML = html; lastGroups = html; }
  groupCount.textContent = clusters.length ? String(clusters.length) : '';
}
function callerRows() {
  const all = [...callers.values()];
  const today = (c) => Math.max(c.todayN || 0, c.todayBg || 0);
  let rows = all;
  if (cFilter === 'active') rows = all.filter((c) => today(c) > 0);
  else if (cFilter === 'list') rows = all.filter((c) => c.src === 'list');
  else if (cFilter === 'kol') rows = all.filter(isKol);
  rows.sort((a, b) => (b.imp || 0) - (a.imp || 0) || today(b) - today(a) || b.lastT - a.lastT);
  return rows.slice(0, 40);
}
const TF_ES = { 1: '24 h', 7: '7 d', 30: '30 d' };
// best PnL rank of a caller: Kolscan's KOL boards, else Axiom's board
function pnlText(c) {
  const ks = c.ks;
  if (ks && ks.r) {
    let bt = null;
    for (const tf of ['1', '7', '30']) if (ks.r[tf] > 0 && (!bt || ks.r[tf] < ks.r[bt])) bt = tf;
    if (bt) {
      const p = ks.p && ks.p[bt];
      return `PnL <b>#${ks.r[bt]}</b> ${TF_ES[bt]}${p ? ` (${p > 0 ? '+' : ''}${nf0.format(p)} SOL)` : ''}`;
    }
  }
  if (c.board && c.board.rank > 0) return `PnL <b>#${c.board.rank}</b> ${esc(c.board.win || '')}`;
  return '';
}
function communityText(c) {
  const parts = [];
  if (c.pf) parts.push(`${nf0.format(c.pf)} seguidores en pump.fun`);
  if (c.ff) parts.push(`${nf0.format(c.ff)} en Fomo`);
  if (c.tg && c.tg.subs) parts.push(`${nf0.format(c.tg.subs)} en Telegram (t.me/${c.tg.u})`);
  else if (c.tg && c.tg.u) parts.push(`Telegram t.me/${c.tg.u}`);
  if (c.xf) parts.push(`${nf0.format(c.xf)} en X`);
  return parts.join(' · ');
}
const of100 = (v) => Math.round((v || 0) * 100);
function callerTitle(c) {
  const p = c.parts;
  const lines = [`Impacto ${Math.round(c.imp || 0)}/100`];
  if (p) lines.push(`alcance ${of100(p.R)} · comunidad ${of100(p.C)} · calidad ${of100(p.Q)} · PnL ${of100(p.P)} · confianza ${of100(p.T)}`);
  if (c.how) lines.push('Alcance: ' + c.how + (c.reach ? ` (${fmtUsd(c.reach)} por call)` : ''));
  const com = communityText(c);
  if (com) lines.push('Comunidad: ' + com);
  if (isKol(c) && c.sel != null) lines.push(`Cada compra suya cuenta como un call al ${Math.round(c.sel * 100)} %${c.perDay ? ` (opera ~${c.perDay} monedas al día)` : ''}`);
  return lines.join('\n');
}
function renderCallers(force) {
  const rows = callerRows();
  const nActive = [...callers.values()].filter((c) => Math.max(c.todayN || 0, c.todayBg || 0) > 0).length;
  callerCount.textContent = nActive ? String(nActive) : '';
  const html = rows.length
    ? rows
        .map((c) => {
          const col = impColor(c.imp || 0);
          const img = /^https:\/\//i.test(c.img || '') ? c.img : '';
          const stats = [];
          if (c.hit2x != null) stats.push(`2x <b>${Math.round(c.hit2x)} %</b>`);
          if (c.med != null) stats.push(`×<b>${nf1.format(c.med)}</b> med`);
          const pnl = pnlText(c);
          if (pnl) stats.push(pnl);
          if (c.wr != null) stats.push(`gana <b>${Math.round(c.wr)} %</b>`);
          if (c.aud >= 50) stats.push(`👥 <b>${esc(fmtK(c.aud))}</b>`);
          if (c.reach) stats.push(`<b>${esc(fmtUsd(c.reach))}</b>/call`);
          const n = Math.max(c.todayN || 0, c.todayBg || 0);
          let last = '';
          if (c.lastT > -1e8) {
            const coin = coinById.get(c.lastCoin);
            last = ` · ${coin ? `<b>$${esc(coin.tk)}</b> ` : ''}hace ${esc(ago(T - c.lastT))}${n > 1 ? ` · ${n} calls hoy` : ''}`;
          }
          return `<li><button type="button" data-caller="${esc(c.k)}" aria-pressed="${selCaller === c.k}" title="${esc(callerTitle(c))}"><span class="av" style="--c:${col}">${esc(initials(c.n))}${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide>` : ''}</span><span class="cname"><span>${esc(c.n)}</span><span class="srcb ${esc(c.src)}">${esc(SRC_ES[c.src] || c.src)}</span>${c.tg && c.tg.subs ? '<span class="srcb tg" title="Tiene canal de Telegram">TG</span>' : ''}</span><span class="imp" style="--c:${col}">${Math.round(c.imp || 0)}</span><span class="meter" style="--c:${col};--w:${clamp(Math.round(c.imp || 0), 0, 100)}%"><i></i></span><span class="cmeta">${stats.join(' · ')}${last}</span></button></li>`;
        })
        .join('')
    : `<li class="empty">${cFilter === 'active' ? 'Ningún caller ha llamado hoy todavía. Mira «Tu lista», «KOLs» o «Todos».' : cFilter === 'kol' ? 'Cargando los KOLs de Kolscan…' : 'Sin callers todavía.'}</li>`;
  if (force || html !== lastCallers) { callerList.innerHTML = html; lastCallers = html; }
}
function chip(id) {
  const w = wallets[id];
  const k = cl(id);
  return `<span class="wchip"${k >= 0 ? ` style="--c:${clusters[k].color}"` : ''}>${esc(wname(w))}</span>`;
}
function evHtml(e) {
  const when = `<span class="ago">${ago(T - e.t)}</span>`;
  const c = coinById.get(e.c);
  const tk = c ? `<button type="button" class="feed-coin${follow === c ? ' on' : ''}" data-coin="${c.id}" aria-label="Localizar $${esc(c.tk)} en el mapa" aria-pressed="${follow === c}">$${esc(c.tk)}</button>` : '';
  if (e.type === 'buy' && e.kb) {
    // a KOL's buy and the call it counts as, in one line
    const k = callerOf(e.kb.k);
    const col = impColor(k ? k.imp : 0);
    return `<li class="ev ev-call" style="--c:${col}">${when}<span class="badge">${callIcon('kolbuy')} ${esc(k ? k.n : wname(wallets[e.w]))}</span><span>compra <b class="buy">${esc(fmtUsd(e.usd))}</b> de <b>${tk}</b>${e.kb.mc ? ` a ${esc(fmtUsd(e.kb.mc))}` : ''} · impacto ${k ? Math.round(k.imp) : '?'}</span></li>`;
  }
  if (e.type === 'buy' || e.type === 'sell') {
    return `<li class="ev ev-trade">${when}${chip(e.w)}<span>${e.type === 'buy' ? 'compra' : 'vende'} <b class="${e.type}">${esc(fmtUsd(e.usd))}</b> de</span><b class="tkc">${tk}</b></li>`;
  }
  if (e.type === 'call') {
    const k = callerOf(e.k);
    const col = impColor(k ? k.imp : 0);
    const verb = e.src === 'kolbuy' ? 'compra' : e.src === 'tg' ? 'publica en Telegram' : 'llama';
    return `<li class="ev ev-call" style="--c:${col}">${when}<span class="badge">${callIcon(e.src)} ${esc(k ? k.n : e.k)}</span><span>${verb} <b>${tk}</b>${e.mc ? ` a ${esc(fmtUsd(e.mc))}` : ''} · impacto ${k ? Math.round(k.imp) : '?'}</span></li>`;
  }
  if (e.type === 'org') {
    return `<li class="ev ev-org">${when}<span class="badge">🌱 Orgánico</span><span><b>${tk}</b> sube <b class="buy">+${esc(nf1.format(e.g || 0))} %/min</b>${e.a ? ' acelerando' : ''} · ${e.n} compradores · ${esc(fmtUsd(e.b))}</span></li>`;
  }
  if (e.type === 'group') {
    return `<li class="ev ev-alert" style="--c:${labelColor(e.label)}">${when}<span class="badge" style="--c:${labelColor(e.label)}">Grupo ${e.label}</span><span>${e.n} wallets en ${Math.max(1, Math.round(e.span))} s → <b>${tk}</b></span></li>`;
  }
  if (e.type === 'match') {
    return `<li class="ev ev-alert">${when}<span class="badge">Coincidencia</span><span>${e.n} wallets sin grupo en ${Math.max(1, Math.round(e.span))} s → <b>${tk}</b></span></li>`;
  }
  return `<li class="ev ev-alert" style="--c:${labelColor(e.label)}">${when}<span class="badge" style="--c:${labelColor(e.label)}">Nuevo</span><span>Grupo ${e.label} detectado: ${e.n} wallets, ${e.coins} monedas en común</span></li>`;
}
function renderFeed() {
  const list = [];
  const minUsd = MODE === 'demo' ? 150 : 250;
  // a KOL's buy arrives twice (the trade, and the call it counts as): pair them up
  const head = feed.slice(0, 120);
  const kbOf = new Map(), merged = new Set();
  for (const e of head) {
    if (e.type !== 'call' || e.src !== 'kolbuy') continue;
    const k = callerOf(e.k);
    if (!k || !k.a) continue;
    const tr = head.find((x) => x.type === 'buy' && x.c === e.c && !kbOf.has(x) && Math.abs(x.t - e.t) < 5 && wallets[x.w] && wallets[x.w].a === k.a);
    if (tr) {
      kbOf.set(tr, e);
      merged.add(e);
    }
  }
  for (const e of feed) {
    if (merged.has(e)) continue;
    const kb = kbOf.get(e);
    if ((e.type === 'buy' || e.type === 'sell') && e.usd < minUsd && !kb) continue;
    if ((e.type === 'buy' || e.type === 'sell' || e.type === 'call' || e.type === 'org') && !coinById.has(e.c)) continue;
    list.push(kb ? { ...e, kb } : e);
    if (list.length >= 8) break;
  }
  const html = list.map(evHtml).join('') || `<li class="empty">${MODE === 'live' ? 'Aquí salen las compras de smart money y los calls.' : ''}</li>`;
  if (html !== lastFeed) { feedEl.innerHTML = html; lastFeed = html; }
}
function renderStats() {
  const n = coins.reduce((s, c) => s + (c.dying ? 0 : 1), 0);
  const ws = wallets.reduce((s, w) => s + (shown(w) ? 1 : 0), 0);
  const ct = [...callers.values()].filter((c) => Math.max(c.todayN || 0, c.todayBg || 0) > 0).length;
  const text = `${n} monedas · ${ws} smart wallets · ${ct} callers hoy · ${clusters.length} ${clusters.length === 1 ? 'grupo' : 'grupos'}`;
  if (text !== lastStats) { statsEl.textContent = text; lastStats = text; }
}
// source health: green = answered in the last minutes, amber = waiting for you, red = failing
function srcState(keys, fresh = 20 * 60e3) {
  let best = null;
  for (const k of keys) {
    const s = status[k];
    if (!s) continue;
    if (s.ok && s.at && Date.now() - s.at < fresh) return { cls: 'ok', s };
    if (!best || (s.err && !best.s.err)) best = { cls: s.err ? 'err' : 'warn', s };
  }
  return best || { cls: 'off', s: null };
}
const SOURCES = [
  { name: 'Pump.fun', keys: ['pump', 'pumpTrades', 'pumpFeed', 'organic'] },
  { name: 'Axiom', keys: ['axiom'] },
  { name: 'Fomo', keys: ['fomo', 'fomoCalls'] },
  { name: 'KOLs', keys: ['kolscanLive', 'kolscan'] },
  { name: 'Telegram', keys: ['tg'] },
  { name: 'RPC', keys: ['rpc'] },
];
function renderChips() {
  if (MODE !== 'live') {
    if (lastChips !== 'demo') { chipsEl.innerHTML = '<span class="chip warn"><i></i>Datos inventados para probar el mapa</span>'; lastChips = 'demo'; }
    return;
  }
  const html = SOURCES.map((src) => {
    const st = srcState(src.keys);
    const title = st.s ? st.s.err || st.s.note || '' : 'sin datos todavía';
    return `<span class="chip ${st.cls}" title="${esc(title)}"><i></i>${src.name}</span>`;
  }).join('');
  if (html !== lastChips) { chipsEl.innerHTML = html; lastChips = html; }
}
function renderNote() {
  if (MODE !== 'live') { noteEl.hidden = true; return; }
  const any = coins.some((c) => !c.dying);
  if (!port) {
    noteEl.innerHTML = '<b>Conectando con la extensión…</b>Si no carga, recarga la pestaña.';
    noteEl.hidden = false;
  } else if (!any) {
    const pe = status.pump && status.pump.err;
    noteEl.innerHTML = pe
      ? `<b>Pump.fun no responde</b>${esc(pe)}. Se reintenta solo.`
      : '<b>Recogiendo datos…</b>Primero llegan los rankings de PnL de pump.fun y los calls; el mapa se llena en uno o dos minutos.';
    noteEl.hidden = false;
  } else noteEl.hidden = true;
}
// narratives asked from the extension's background (never the key): mint → { text | error | loading, t }
const narr = new Map();
let narrTimer = null;
function askNarrative(c) {
  clearTimeout(narrTimer);
  if (!c || MODE !== 'live' || !port || !isB58(c.ca)) return;
  const have = narr.get(c.ca);
  if (have && Date.now() - have.t < 6 * 60e3) return;
  narrTimer = setTimeout(() => {
    if (!hovered || hovered.c !== c) return;
    narr.set(c.ca, { loading: true, t: Date.now() });
    port.postMessage({ type: 'narrative', mint: c.ca });
    showTip();
  }, 350); // a short pause: passing over many coins asks nothing
}
function narrHtml(mint) {
  const n = narr.get(mint);
  if (!n) return '';
  if (n.loading) return '<p class="tip-narr muted">Leyendo la narrativa…</p>';
  if (n.error) return `<p class="tip-narr muted">${esc(n.error)}</p>`;
  return `<p class="tip-narr"><b>Narrativa:</b> ${esc(n.text)}</p>`;
}
function coinTip(c) {
  const hs = [...c.holders].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const top = hs.map(([wid, usd]) => `<li>${chip(wid)}<span>${esc(fmtUsd(usd))}</span></li>`).join('');
  const dom = c.domLabel ? `<p class="tip-dom" style="--c:${labelColor(c.domLabel)}">Grupo ${c.domLabel} tiene el ${Math.round(c.domShare * 100)} % de lo que hay dentro</p>` : '';
  const calls = c.calls
    .slice(0, 4)
    .map((x) => {
      const k = callerOf(x.k);
      return `<li><span>${callIcon(x.src)} <b>${esc(k ? k.n : x.k)}</b> hace ${esc(ago(T - x.t))}</span><span>${x.mc ? esc(fmtUsd(x.mc)) : ''}${x.mx ? ` · ×${esc(nf1.format(x.mx))}` : ''}</span></li>`;
    })
    .join('');
  const act = MODE === 'live' && isB58(c.ca) ? `<p class="tip-act">Doble clic: operar en <b>${esc(TERMS[term].name)}</b></p>` : '';
  const net = c.flow;
  return `<div class="tip-h">${pfpHtml(c)}<div class="tip-name"><b>$${esc(c.tk)}</b><span class="ca">${esc(c.name ? c.name.slice(0, 26) : '')}${c.name ? ' · ' : ''}${esc(short(c.ca))}</span></div></div>
    <dl>
      <div><dt>Entrada neta</dt><dd class="${net >= 0 ? 'buy' : 'sell'}">${esc(fmtUsd(net))}</dd></div>
      <div><dt>Por callers</dt><dd>${esc(fmtUsd(c.callFlow))}</dd></div>
      ${c.orgFlow >= 1 ? `<div><dt>Orgánico</dt><dd class="buy">${esc(fmtUsd(c.orgFlow))}${T - c.orgT < 600 ? ` · +${esc(nf1.format(c.orgG))} %/min · ${c.orgN} compradores` : ''}</dd></div>` : ''}
      ${c.liq ? `<div><dt>Liquidez · vol 1 h</dt><dd>${esc(fmtUsd(c.liq))} · ${esc(fmtUsd(c.v1h || 0))}</dd></div>` : ''}
      <div><dt>En posición</dt><dd>${esc(fmtUsd(c.held))}</dd></div>
      <div><dt>Smart wallets</dt><dd>${c.holders.size}${c.heldN > c.holders.size ? ` (${c.heldN} del top PnL)` : ''}</dd></div>
      ${c.mc ? `<div><dt>MC</dt><dd>${esc(fmtUsd(c.mc))}</dd></div>` : ''}
      <div><dt>Edad</dt><dd>${esc(ago(Math.max(0, T - c.born)))}</dd></div>
    </dl>${dom}${calls ? `<ol class="calls">${calls}</ol>` : ''}${top ? `<ol class="tip-list">${top}</ol>` : ''}${act}${narrHtml(c.ca)}`;
}
function walletTip(w) {
  const k = cl(w.id), g = k >= 0 ? clusters[k] : null;
  const pos = [...w.pos]
    .map(([id, p]) => {
      const c = coinById.get(id);
      return c ? `<li><b>$${esc(c.tk)}</b><span>${esc(fmtUsd(p.usd))}</span></li>` : '';
    })
    .join('');
  const tags = (w.tags || []).map((t) => `<span>${esc(t)}</span>`).join('');
  return `<div class="tip-h">${chip(w.id)}<span class="tier ${esc(w.tier)}">${esc(w.tier)}</span>${g ? `<span class="badge" style="--c:${g.color}">Grupo ${g.label}</span>` : '<span class="muted">sin grupo</span>'}</div>
    ${w.n ? `<p class="muted" style="margin:0 0 4px;font:12px var(--font-mono)">${esc(short(w.a))}</p>` : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <dl>
      <div><dt>Peso smart</dt><dd>×${esc(nf1.format(w.wt || 0.6))}</dd></div>
      ${MODE === 'demo' ? `<div><dt>PnL de la sesión</dt><dd class="${w.pnl >= 0 ? 'buy' : 'sell'}">${esc(fmtUsd(w.pnl))}</dd></div>` : ''}
      <div><dt>Operaciones</dt><dd>${w.trades}</dd></div>
    </dl>${pos ? `<ol class="tip-list">${pos}</ol>` : '<p class="muted">Sin posiciones abiertas que veamos</p>'}`;
}
const lastPtr = { x: 0, y: 0 };
function showTip() {
  if (!hovered) { tip.hidden = true; return; }
  tip.innerHTML = hovered.c ? coinTip(hovered.c) : walletTip(hovered.w);
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = lastPtr.x + 18, y = lastPtr.y + 18;
  if (x + tw > innerWidth - 12) x = lastPtr.x - tw - 18;
  if (y + th > innerHeight - 12) y = innerHeight - th - 12;
  tip.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
}
function ui() {
  computeLinks();
  dominance();
  if (!boardEl.contains(document.activeElement)) renderBoard();
  if (!groupList.contains(document.activeElement)) renderGroups();
  if (!callerList.contains(document.activeElement)) renderCallers();
  renderFeed();
  renderStats();
  renderChips();
  renderNote();
  if (hovered && !tip.hidden) showTip();
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// opens the coin in the trading terminal chosen in Ajustes (new tab)
function openTerminal(c) {
  if (!c) return;
  if (MODE !== 'live' || !isB58(c.ca)) {
    toast('En la demo las monedas son inventadas: no se pueden abrir');
    return;
  }
  const tm = TERMS[term] || TERMS.axiom;
  const url = tm.url(c);
  let opened = false;
  try {
    if (hasExt && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url, active: true });
      opened = true;
    }
  } catch (_) {}
  if (!opened) window.open(url, '_blank', 'noopener');
  toast(`Abriendo $${c.tk} en ${tm.name}…`);
}
// two clicks on the same spot within 450 ms; the first one's coin wins even if the camera
// has started to move towards it
const DBL_MS = 450;
const tap = { t: 0, x: 0, y: 0, c: null };
const boardTap = { t: 0, id: 0 };

// ───────── input ─────────
function hitTest(sx, sy) {
  const [wx, wy] = toWorld(sx, sy);
  const z = cam.z;
  let bw = null, bd = (10 / z) ** 2;
  for (const w of wallets) {
    if (!shown(w)) continue;
    const d = (w.x - wx) ** 2 + (w.y - wy) ** 2;
    if (d < bd) { bd = d; bw = w; }
  }
  if (bw) return { w: bw };
  let bc = null, best = Infinity;
  for (const c of coins) {
    if (c.dying) continue;
    const r = Math.max(c.r, 8 / z), d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
    if (d <= r * r && d / (r * r) < best) { best = d / (r * r); bc = c; }
  }
  return bc ? { c: bc } : null;
}
function setHover(h) {
  const prev = hovered && hovered.c;
  hovered = h;
  canvas.classList.toggle('pointing', !!h);
  if (!h || !h.c || h.c !== prev) askNarrative(h && h.c);
  showTip();
}
function clearFocus() {
  setFollow(null);
  selLabel = 0;
  selCaller = null;
  setHover(null);
  renderGroups(true);
  renderCallers(true);
  renderBoard(true);
}
function click(sx, sy) {
  const t = performance.now();
  if (tap.c && t - tap.t < DBL_MS && Math.hypot(sx - tap.x, sy - tap.y) < 16) {
    const c = tap.c;
    tap.c = null;
    openTerminal(c);
    return;
  }
  const h = hitTest(sx, sy);
  tap.c = h && h.c ? h.c : null;
  tap.t = t;
  tap.x = sx;
  tap.y = sy;
  if (h && h.c) {
    setFollow(h.c);
    setHover(h);
  } else if (h && h.w) {
    const k = cl(h.w.id);
    selCaller = null;
    selLabel = k >= 0 && selLabel !== clusters[k].label ? clusters[k].label : 0;
    setHover(h);
    renderGroups(true);
  } else {
    clearFocus();
    return;
  }
  renderBoard(true);
}
const ptrs = new Map();
let drag = null, pinch = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: cam.z };
    drag = null;
  }
});
canvas.addEventListener('pointermove', (e) => {
  lastPtr.x = e.clientX;
  lastPtr.y = e.clientY;
  const p = ptrs.get(e.pointerId);
  if (p) {
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.z * d) / pinch.d / cam.z);
      return;
    }
    if (drag) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 5) drag.moved = true;
      if (drag.moved) {
        cam.x -= dx / cam.z;
        cam.y -= dy / cam.z;
        if (follow) setFollow(null);
        canvas.classList.add('dragging');
        if (hovered) setHover(null);
        return;
      }
    }
  }
  if (e.pointerType === 'mouse' && !ptrs.size) {
    const h = hitTest(e.clientX, e.clientY);
    const same = h && hovered && h.c === hovered.c && h.w === hovered.w;
    if (same) showTip();
    else setHover(h);
  }
});
const release = (e) => {
  const wasClick = drag && !drag.moved && e.type === 'pointerup' && ptrs.size === 1;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (wasClick) {
    lastPtr.x = e.clientX;
    lastPtr.y = e.clientY;
    click(e.clientX, e.clientY);
  }
  if (!ptrs.size) { drag = null; canvas.classList.remove('dragging'); }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ptrs.size) setHover(null); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'Escape') {
    if ($('srcDlg').open) return;
    clearFocus();
  } else if ((e.key === '+' || e.key === '=') && !e.metaKey && !e.ctrlKey) zoomAt(W / 2, H / 2, 1.25);
  else if (e.key === '-' && !e.metaKey && !e.ctrlKey) zoomAt(W / 2, H / 2, 0.8);
});
addEventListener('resize', resize);
$('zin').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.35));
$('zout').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.35));
$('zfit').addEventListener('click', () => { setFollow(null); fit(); });
mini.addEventListener('click', (e) => {
  const r = mini.getBoundingClientRect(), s = WORLD / r.width;
  cam.x = (e.clientX - r.left) * s;
  cam.y = (e.clientY - r.top) * s;
  if (follow) setFollow(null);
});
feedEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-coin]');
  if (!b || !feedEl.contains(b)) return;
  const c = coinById.get(Number(b.dataset.coin));
  if (!c || c.dying) return;
  // Same tracking/zoom as clicking a bubble: no trading action on single click.
  setFollow(c);
  selLabel = 0;
  selCaller = null;
  setHover(null);
  renderBoard(true);
  renderGroups(true);
  renderCallers(true);
  feedEl.querySelectorAll('button[data-coin]').forEach((btn) => {
    const selected = Number(btn.dataset.coin) === c.id;
    btn.classList.toggle('on', selected);
    btn.setAttribute('aria-pressed', String(selected));
  });
});
boardEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-coin]');
  const c = b && coinById.get(+b.dataset.coin);
  if (!c) return;
  const t = performance.now();
  if (boardTap.id === c.id && t - boardTap.t < DBL_MS) {
    boardTap.id = 0;
    openTerminal(c);
    return;
  }
  boardTap.id = c.id;
  boardTap.t = t;
  setFollow(c);
  renderBoard(true);
});
groupList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-label]');
  if (!b) return;
  const lab = +b.dataset.label;
  selCaller = null;
  selLabel = selLabel === lab ? 0 : lab;
  renderGroups(true);
  renderCallers(true);
});
callerList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-caller]');
  if (!b) return;
  const k = b.dataset.caller;
  selLabel = 0;
  selCaller = selCaller === k ? null : k;
  if (selCaller) {
    // frame every coin this caller has called
    const called = coins.filter((c) => !c.dying && c.calls.some((x) => ck(x.k) === k));
    if (follow) setFollow(null);
    if (called.length) fitTo(called);
    else toast('Este caller no tiene calls en las monedas del mapa ahora mismo');
  }
  renderCallers(true);
  renderGroups(true);
});
const press = (sel, b) => document.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
  sizeMode = b.dataset.size;
  store.set('size', sizeMode);
  press('[data-size]', b);
  vmaxS = 0;
  updateScale(1);
  renderBoard(true);
}));
document.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
  colorMode = b.dataset.color;
  store.set('color', colorMode);
  press('[data-color]', b);
}));
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
  speed = +b.dataset.speed;
  press('[data-speed]', b);
}));
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('[data-cfilter]').forEach((b) => b.addEventListener('click', () => {
  cFilter = b.dataset.cfilter;
  press('[data-cfilter]', b);
  renderCallers(true);
}));
function setTerm(t) {
  term = TERMS[t] ? t : 'axiom';
  store.set('term', term);
  document.querySelectorAll('[data-term]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.term === term)));
  $('helpTerm').textContent = TERMS[term].name;
}
document.querySelectorAll('[data-term]').forEach((b) => b.addEventListener('click', () => {
  setTerm(b.dataset.term);
  toast(`Doble clic en una moneda: se abre en ${TERMS[term].name}`);
}));
function setTab(t) {
  sideTab = t;
  store.set('tab', t);
  $('tabCallers').setAttribute('aria-selected', String(t === 'callers'));
  $('tabGroups').setAttribute('aria-selected', String(t === 'groups'));
  $('paneCallers').hidden = t !== 'callers';
  $('paneGroups').hidden = t !== 'groups';
  $('tgSide').textContent = t === 'callers' ? 'Callers' : 'Grupos';
}
$('tabCallers').addEventListener('click', () => setTab('callers'));
$('tabGroups').addEventListener('click', () => setTab('groups'));
for (const [btnId, panelId] of [['tgControls', 'controls'], ['tgSide', 'side']]) {
  $(btnId).addEventListener('click', () => {
    const open = $(panelId).classList.toggle('open');
    $(btnId).setAttribute('aria-expanded', String(open));
  });
}
systemDark.addEventListener('change', applyTheme);
new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ───────── live data from the background ─────────
let port = null, hbTimer = null, reconnectTimer = null, gotSnapshot = false;
const pendingReports = new Map();
let reportId = 1;
function connectLive() {
  if (!hasLive) return;
  try {
    port = hasExt ? chrome.runtime.connect({ name: 'map' }) : connectWeb();
  } catch (_) {
    port = null;
    reconnectTimer = setTimeout(() => MODE === 'live' && connectLive(), 2000);
    return;
  }
  port.onMessage.addListener(onBg);
  port.onDisconnect.addListener(() => {
    port = null;
    clearInterval(hbTimer);
    if (MODE === 'live') reconnectTimer = setTimeout(connectLive, 1500);
  });
  clearInterval(hbTimer);
  hbTimer = setInterval(() => {
    try {
      port && port.postMessage({ type: 'hb' });
    } catch (_) {}
  }, 20000);
}
function disconnectLive() {
  clearTimeout(reconnectTimer);
  clearInterval(hbTimer);
  if (port) {
    try {
      port.disconnect();
    } catch (_) {}
  }
  port = null;
}
const evTime = (ms) => (ms - T0) / 1000;
function applyMeta(msg) {
  for (const k of msg.callers || []) addCaller(k);
  for (const w of msg.wallets || []) addWallet(w);
  for (const m of msg.coins || []) {
    const c = coinByMint.get(m.m);
    if (c) updateCoin(c, m);
    else addCoin(m);
  }
  if (msg.status) status = msg.status;
  if (msg.axiomShapes) axiomShapes = msg.axiomShapes;
  if (msg.solUsd) solUsd = msg.solUsd;
  if (msg.list) listInfo = msg.list;
  if (msg.reports) savedDays = msg.reports;
  if (msg.axiomTabs != null) axiomTabs = msg.axiomTabs;
  if (msg.settings) settings = msg.settings;
}
function applyEvent(e, animate) {
  if (!e || !e.m) return;
  const coin = coinByMint.get(e.m) || addCoin({ m: e.m });
  if (e.ty === 'call') {
    const caller = callerOf(e.c) || addCaller({ k: e.c, n: e.c, src: e.src === 'fomo' ? 'fomo' : e.src === 'kolbuy' || e.src === 'tg' ? 'kolscan' : 'feed' });
    ingestCall({ t: evTime(e.t), coin, caller, mc: e.cm, mx: e.mx, b: e.b, src: e.src }, animate);
  } else if (e.ty === 'org') {
    ingestOrganic({ t: evTime(e.t), coin, b: e.b, g: e.g, n: e.n, mc: e.cm, a: e.a }, animate);
  } else if (e.ty === 'buy' || e.ty === 'sell') {
    const w = walletByAddr.get(e.w) || addWallet({ a: e.w });
    ingestTrade({ t: evTime(e.t), side: e.ty, coin, wallet: w, usd: e.u, sol: e.s, src: e.src }, animate);
  }
}
function applySnapshot(msg) {
  resetWorld();
  live = false;
  applyMeta(msg);
  const evs = (msg.events || []).slice().sort((a, b) => a.t - b.t);
  T = Math.min(nowSec(), evs.length ? evTime(evs[0].t) : nowSec());
  for (const e of evs) {
    advance(evTime(e.t));
    applyEvent(e, false);
  }
  advance(nowSec());
  settle();
  live = true;
  gotSnapshot = true;
  fit();
  ui();
  renderBoard(true);
  renderCallers(true);
  renderGroups(true);
  renderSources();
}
function applyDelta(msg) {
  // callers merged into another one (same wallet seen from two sources)
  for (const [from, to] of msg.gone || []) {
    calias.set(from, to);
    for (const [a, b] of calias) if (b === from) calias.set(a, to);
    const old = callers.get(from);
    callers.delete(from);
    const keep = callers.get(to);
    if (old && keep) {
      keep.todayN = (keep.todayN || 0) + (old.todayN || 0);
      if (old.lastT > keep.lastT) { keep.lastT = old.lastT; keep.lastCoin = old.lastCoin; }
    }
    if (selCaller === from) selCaller = to;
  }
  applyMeta(msg);
  const evs = (msg.events || []).slice().sort((a, b) => a.t - b.t);
  for (const e of evs) applyEvent(e, true);
  if (msg.status || msg.settings) renderSources();
}
function onBg(msg) {
  if (!msg || MODE !== 'live') return;
  if (msg.type === 'reload') location.reload();
  else if (msg.type === 'snapshot') applySnapshot(msg);
  else if (msg.type === 'delta') {
    if (gotSnapshot) applyDelta(msg);
  } else if (msg.type === 'settings') {
    settings = msg.settings || settings;
    renderSources();
  } else if (msg.type === 'narrative') {
    narr.set(msg.mint, { text: msg.text, error: msg.error, t: Date.now() });
    if (hovered && hovered.c && hovered.c.ca === msg.mint) showTip();
  } else if (msg.type === 'report') {
    const cb = pendingReports.get(msg.id);
    if (cb) {
      pendingReports.delete(msg.id);
      cb(msg.json);
    }
  }
}

// ───────── sources, settings and the report ─────────
const dlg = $('srcDlg');
const SRC_ROWS = [
  ['pump', 'Pump.fun · ranking de PnL', 'Top 100 de 24 h, 7 d y 30 d, y las monedas que tienen'],
  ['pumpTrades', 'Pump.fun · operaciones del top PnL', 'Compras y ventas del top 50 en cada moneda del mapa'],
  ['pumpFeed', 'Pump.fun · callouts en directo', 'Calls de tu lista, del top PnL y (si lo activas) de cualquiera'],
  ['pumpPos', 'Pump.fun · mejores posiciones', 'Calls de las wallets con más PnL del día y la semana'],
  ['callers', 'Pump.fun · estadísticas de callers', '2x %, mediana y dinero que mueve cada call'],
  ['axiom', 'Axiom · complemento opcional', 'Smart Money, operaciones smart por moneda y tus wallets rastreadas; requiere puente opcional conectado'],
  ['fomo', 'Fomo · top PnL (vía Axiom)', 'Traders de Fomo con su wallet de Solana verificada'],
  ['fomoCalls', 'Fomo · tesis (calls)', 'Lo que publican los mejores traders de Fomo'],
  ['kol', 'KOLs · top PnL (vía Axiom)', 'Ranking de KOLs de Axiom'],
  ['kolscan', 'Kolscan · KOLs y su PnL', 'Todos los KOLs de Kolscan (wallet, X, Telegram) y su PnL de 24 h, 7 d y 30 d'],
  ['kolscanLive', 'Kolscan · operaciones en directo', 'Cada compra de un KOL cuenta como un call'],
  ['community', 'Pump.fun · comunidad de cada caller', 'Seguidores en pump.fun de cada caller con wallet'],
  ['tg', 'Telegram · canales de los KOLs', 'Suscriptores y los contratos que publican'],
  ['organic', 'Pump.fun · subidas orgánicas', 'Market cap que acelera con muchos compradores distintos, sin smart money ni calls'],
  ['rpc', 'RPC propio (opcional)', 'Operaciones en directo leídas de la cadena'],
];
function renderSources() {
  if (!dlg.open) return;
  $('srcList').innerHTML = SRC_ROWS.map(([k, name, what]) => {
    const s = status[k];
    let cls = 'off', when = '—', det = what;
    if (s) {
      if (s.ok && s.at) {
        cls = Date.now() - s.at < 20 * 60e3 ? 'ok' : 'warn';
        when = 'hace ' + ago((Date.now() - s.at) / 1000);
        det = s.note || what;
      } else if (s.err) {
        cls = 'err';
        when = s.errAt ? 'hace ' + ago((Date.now() - s.errAt) / 1000) : '';
        det = s.err;
      } else if (s.note) {
        cls = 'warn';
        det = s.note;
      }
    }
    return `<div class="srcrow ${cls}"><i></i><span class="nm">${esc(name)}</span><span class="when">${esc(when)}</span><span class="det${cls === 'err' ? ' err' : ''}">${esc(det)}</span></div>`;
  }).join('');
  $('optAxiom').checked = settings.axiomActive !== false;
  $('optTracked').checked = settings.axiomTracked !== false;
  $('optCallsAll').checked = !!settings.callsAll;
  $('optKolscan').checked = settings.kolscan !== false;
  $('optKolCalls').checked = settings.kolCalls !== false;
  $('optTelegram').checked = settings.telegram !== false;
  $('optOrganic').checked = settings.organic !== false;
  $('optOrganicDiscover').checked = settings.organicDiscover !== false;
  if (document.activeElement !== $('optMinFollowers')) $('optMinFollowers').value = settings.callsMinFollowers ?? 5000;
  const rpc = settings.rpc || {};
  if (document.activeElement !== $('optRpcUrl')) $('optRpcUrl').value = rpc.url || '';
  if (document.activeElement !== $('optRpcMax')) $('optRpcMax').value = rpc.maxWallets || 40;
  $('optRpc').checked = !!rpc.enabled;
  const all = [...callers.values()];
  const nKol = all.filter(isKol).length, nTg = all.filter((c) => c.tg && c.tg.u).length;
  $('listInfo').innerHTML =
    (listInfo
      ? `Tu lista: <b>${listInfo.n} callers</b> de ${esc(listInfo.source)} (captura del ${esc(listInfo.captured)}). La aplicación busca la wallet de cada uno en pump.fun y actualiza sus números cada 6 h.`
      : 'Tu lista de callers se carga al arrancar.') + (nKol ? ` Además sigue a <b>${nKol} KOLs</b> (${nTg} con canal de Telegram).` : '');
  $('savedReports').innerHTML = savedDays.length
    ? savedDays.slice().reverse().map((d) => `<button type="button" class="btn" data-report="${esc(d)}">${esc(d)}</button>`).join('')
    : '<span class="muted" style="font-size:12px">Los informes de cada día se guardan aquí (14 días).</span>';
  $('diag').textContent = Object.keys(axiomShapes).length ? JSON.stringify(axiomShapes, null, 1) : 'Aún nada: conecta el complemento opcional y abre Axiom con tu sesión.';
}
function sendSettings(patch) {
  settings = { ...settings, ...patch, rpc: patch.rpc ? { ...(settings.rpc || {}), ...patch.rpc } : settings.rpc };
  if (port) port.postMessage({ type: 'settings', patch });
  else toast('Sin conexión con el servidor');
}
$('openSources').addEventListener('click', () => {
  if (MODE !== 'live') toast('Las fuentes reales se ven en modo En vivo');
  dlg.showModal();
  renderSources();
});
$('closeSources').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('optAxiom').addEventListener('change', (e) => sendSettings({ axiomActive: e.target.checked }));
$('optTracked').addEventListener('change', (e) => sendSettings({ axiomTracked: e.target.checked }));
$('optCallsAll').addEventListener('change', (e) => sendSettings({ callsAll: e.target.checked }));
$('optKolscan').addEventListener('change', (e) => sendSettings({ kolscan: e.target.checked }));
$('optKolCalls').addEventListener('change', (e) => sendSettings({ kolCalls: e.target.checked }));
$('optTelegram').addEventListener('change', (e) => sendSettings({ telegram: e.target.checked }));
$('optOrganic').addEventListener('change', (e) => sendSettings({ organic: e.target.checked }));
$('optOrganicDiscover').addEventListener('change', (e) => sendSettings({ organicDiscover: e.target.checked }));
$('optMinFollowers').addEventListener('change', (e) => sendSettings({ callsMinFollowers: Math.max(0, +e.target.value || 0) }));
$('optRpcMax').addEventListener('change', (e) => sendSettings({ rpc: { maxWallets: clamp(+e.target.value || 40, 5, 150) } }));
$('optRpcUrl').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  if (v && !/^https?:\/\//i.test(v)) { toast('La URL del RPC tiene que empezar por https://'); return; }
  sendSettings({ rpc: { url: v } });
});
$('optRpc').addEventListener('change', (e) => {
  if (e.target.checked && !$('optRpcUrl').value.trim()) { e.target.checked = false; toast('Pon antes la URL de tu RPC'); return; }
  sendSettings({ rpc: { enabled: e.target.checked, url: $('optRpcUrl').value.trim() } });
});
$('saveAnthropicKey').addEventListener('click', () => {
  const k = $('optAnthropicKey').value.trim();
  if (!port) return toast('Sin conexión con el servidor');
  port.postMessage({ type: 'apiKey', key: k });
  $('optAnthropicKey').value = '';
  $('keyState').textContent = k ? 'Clave guardada en este servidor privado.' : 'Clave borrada.';
  narr.clear();
  toast(k ? 'Clave guardada' : 'Clave borrada');
});
$('refreshAll').addEventListener('click', () => { if (port) { port.postMessage({ type: 'refresh' }); toast('Actualizando todas las fuentes…'); } });
$('resetData').addEventListener('click', () => {
  if (!port) return;
  if (!confirm('¿Borrar todo lo recogido (wallets, monedas, eventos e informes)? Los ajustes se quedan.')) return;
  port.postMessage({ type: 'reset' });
});
$('copyDiag').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify({ version: hasExt ? chrome.runtime.getManifest().version : '0.3.3-web', status, axiomShapes, axiomTabs }, null, 1));
    toast('Diagnóstico copiado');
  } catch (_) {
    toast('No se pudo copiar');
  }
});
function requestReport(day) {
  return new Promise((resolve, reject) => {
    if (MODE === 'demo' || !port) return resolve(demoReport());
    const id = reportId++;
    pendingReports.set(id, resolve);
    port.postMessage({ type: 'report', id, day });
    setTimeout(() => {
      if (pendingReports.delete(id)) reject(new Error('tiempo agotado'));
    }, 30000);
  });
}
async function downloadReport(day) {
  try {
    const json = await requestReport(day);
    if (!json) { toast('Aún no hay datos para el informe'); return; }
    const blob = new Blob([JSON.stringify(json, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `informe-smart-money-${json.day || 'hoy'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`Informe descargado: ${json.totals ? `${json.totals.trades} operaciones, ${json.totals.calls} calls` : 'listo'}`);
  } catch (e) {
    toast('No se pudo generar el informe: ' + (e && e.message ? e.message : e));
  }
}
$('dlReport').addEventListener('click', () => downloadReport('today'));
dlg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-report]');
  if (b) downloadReport(b.dataset.report);
});
$('copyReport').addEventListener('click', async () => {
  try {
    const json = await requestReport('today');
    await navigator.clipboard.writeText(JSON.stringify(json));
    toast('Informe de hoy copiado: pégalo en el chat de la IA');
  } catch (_) {
    toast('No se pudo copiar el informe');
  }
});
// the demo has its own small report, built from the map itself
function demoReport() {
  return {
    schema: 'mapa-smart-money/informe@1',
    day: 'demo',
    note: 'Datos inventados del modo Demo',
    totals: { trades: feed.filter((e) => e.type === 'buy' || e.type === 'sell').length, calls: feed.filter((e) => e.type === 'call').length, groups: clusters.length },
    groups: clusters.map((g) => ({ id: g.label, confidence: g.conf, members: g.members.map((id) => wallets[id].a), coins: [...g.coins].map((id) => (coinById.get(id) || {}).tk).filter(Boolean) })),
    coins: coins.filter((c) => !c.dying && c.flow > 5).sort((a, b) => b.flow - a.flow).slice(0, 30).map((c) => ({ symbol: c.tk, netWeightedUsd: Math.round(c.flow), byCallersUsd: Math.round(c.callFlow), smartWallets: c.holders.size })),
  };
}

// ───────── modes ─────────
function resetWorld() {
  coins = [];
  coinById.clear();
  coinByMint.clear();
  nextCoin = 1;
  wallets = [];
  walletByAddr.clear();
  callers.clear();
  calias.clear();
  feed.length = 0;
  recent.clear();
  pairs.clear();
  linked.clear();
  clusters = [];
  clusterOf.length = 0;
  labelByKey.clear();
  nextLabel = 1;
  links = [];
  parts.length = 0;
  skins.clear();
  skinsHi.clear();
  thumbs.clear();
  picQueue.length = 0;
  follow = null;
  hovered = null;
  tip.hidden = true;
  selLabel = 0;
  selCaller = null;
  vmaxS = 0;
  pseed = 0x51ce;
  T = MODE === 'demo' ? 0 : nowSec();
  lastBoard = lastGroups = lastCallers = lastFeed = lastStats = lastChips = '';
}
function settle() {
  dominance();
  computeLinks();
  updateScale(30);
  for (const c of coins) {
    c.r = targetR(c);
    c.isCell = c.r > CELL_MIN;
  }
  for (let i = 0; i < 200; i++) physics(1 / 20);
  for (let i = 0; i < 6; i++) moveWallets(1);
}
const simApi = {
  get T() {
    return T;
  },
  advance,
  addCoin: (meta) => addCoin(meta),
  coins: () => coins,
  coin: (id) => coinById.get(id),
  addWallet: (meta) => addWallet(meta),
  addCaller: (meta) => addCaller(meta),
  trade: (ev) => ingestTrade(ev, true),
  call: (ev) => ingestCall(ev, true),
  organic: (ev) => ingestOrganic(ev, true),
};
function prewarmDemo() {
  live = false;
  sim.seed(70);
  const SIM = 2700;
  let n = 0;
  while (T < SIM) {
    sim.step(T < SIM - 600 ? 1 : 0.5);
    lifecycle();
    reap(10);
    if (T > SIM - 600) {
      if (n++ % 8 === 0) {
        computeLinks();
        dominance();
        updateScale(4);
      }
      physics(1 / 20);
    }
  }
  settle();
  sim.wake();
  live = true;
}
function setMode(m) {
  if (m === 'live' && !hasLive) {
    toast('GitHub Pages: conecta un servidor externo HTTPS para usar En vivo');
    if (window.MEMES_STATIC_SITE) document.getElementById('hostingDlg')?.showModal();
    m = 'demo';
  }
  MODE = m;
  store.set('mode', m);
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  document.querySelectorAll('.demo-only').forEach((el) => (el.hidden = m !== 'demo'));
  badge.textContent = m === 'live' ? 'live' : 'demo';
  badge.className = 'mode' + (m === 'live' ? ' live' : '');
  HL_FLOW = m === 'demo' ? 300 : 900;
  HL_FAST = m === 'demo' ? 45 : 60;
  gotSnapshot = false;
  resetWorld();
  if (m === 'demo') {
    disconnectLive();
    sim = createSim(simApi);
    prewarmDemo();
    fit();
  } else {
    sim = null;
    connectLive();
  }
  ui();
  renderBoard(true);
  renderCallers(true);
  renderGroups(true);
}

// ───────── main loop ─────────
let lastFrame = performance.now(), frame = 0, lastUi = 0;
function loop(ts) {
  adaptScale(ts - lastFrame, ts);
  const dt = Math.min(0.05, Math.max(0, (ts - lastFrame) / 1000));
  lastFrame = ts;
  now = ts;
  if (MODE === 'demo' && sim) {
    if (speed > 0) {
      let s = dt * speed;
      while (s > 1e-6) {
        const d = Math.min(0.25, s);
        sim.step(d);
        s -= d;
      }
    }
  } else advance(nowSec());
  if (ts - lastLife > 1000) {
    lastLife = ts;
    lifecycle();
  }
  reap(dt);
  updateScale(dt);
  moveWallets(dt);
  physics(dt);
  if (!reduced) for (const c of coins) if (c.isCell) wobble(c, dt);
  updateParticles();
  camera(dt);
  draw();
  if (++frame % 3 === 0) drawMini();
  if (ts - lastUi > 400) {
    lastUi = ts;
    ui();
    if (dlg.open && frame % 6 === 0) renderSources();
  }
  requestAnimationFrame(loop);
}

applyTheme();
resize();
setTab(sideTab === 'groups' ? 'groups' : 'callers');
setTerm(term);
document.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === sizeMode)));
document.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === colorMode)));
setMode(MODE);
draw();
drawMini();
requestAnimationFrame((ts) => {
  lastFrame = ts;
  startedAt = ts;
  requestAnimationFrame(loop);
});
