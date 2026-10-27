// Sòng Nhà client. Views are (app) => HTML strings; every user string goes through esc();
// UI events are delegated: [data-act] → App.actions[name], [data-submit] forms, [data-input] fields.
import { load, save } from './lib/store.js';
import { t, setLang, errText } from './lib/i18n.js';
import { toCsv } from './lib/csv.js';
import { verifyCommitment } from './domain/shuffle.js';
import { deviceSecret } from './services/identity.js';
import { api } from './services/api.js';
import { TableSocket } from './services/socket.js';
import { homeView } from './views/home.js';
import { tableView, tableUrl } from './views/table.js';
import { readXidachOptions, clampBet } from './views/xidach.js';
import { forgetMotion } from './lib/motion.js';

const CODE_RE = /^[A-Z]{3,8}-\d{3}$/;
export const ACCENTS = ['terracotta', 'amber', 'vermilion', 'coral', 'rose', 'gold'];
const root = document.getElementById('app');

const app = {
  route: { name: 'home' },
  nick: load('sn.nick', ''),
  lang: load('sn.lang', (navigator.language || 'vi').toLowerCase().startsWith('vi') ? 'vi' : 'en'),
  theme: load('sn.theme', 'dark') === 'light' ? 'light' : 'dark',
  accent: ACCENTS.includes(load('sn.accent', '')) ? load('sn.accent', '') : 'terracotta',
  sound: load('sn.sound', false),
  recent: load('sn.recent', []),
  home: { game: 'xidach', page: 0, error: '' },
  table: null,
  ui: {},
  toast: null,
  skew: 0,
  busy: false,
  installPrompt: null,
  secret: deviceSecret(),
};
setLang(app.lang);
applyTheme();

// ---------- rendering ----------
function render() {
  // Keep focus and anything the user is typing across re-renders.
  const active = document.activeElement;
  const focusId = active && active.id && root.contains(active) ? active.id : null;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const kept = {};
  root.querySelectorAll('[data-keep][data-dirty]').forEach((el) => {
    if (el.id) kept[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  const openDetails = [...root.querySelectorAll('details[open]')].map((d) => d.className);

  root.innerHTML = app.route.name === 'table' && app.table ? tableView(app) : homeView(app);

  for (const [id, v] of Object.entries(kept)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = v;
    else el.value = v;
    el.dataset.dirty = '1';
  }
  openDetails.forEach((c) => root.querySelector(`details.${c.split(' ')[0]}`)?.setAttribute('open', ''));
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && 'setSelectionRange' in el) {
        try {
          el.setSelectionRange(sel[0], sel[1]);
        } catch {}
      }
    }
  }
  tickCountdowns();
}

function transition(fn) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => {
      fn();
    });
  } else fn();
}

function tickCountdowns() {
  const now = Date.now() + app.skew;
  root.querySelectorAll('[data-countdown]').forEach((el) => {
    const left = Math.max(0, Math.ceil((Number(el.dataset.countdown) - now) / 1000));
    el.textContent = String(left);
  });
}
setInterval(tickCountdowns, 250);

function toast(text) {
  app.toast = { text, at: Date.now() };
  render();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    app.toast = null;
    render();
  }, 2200);
}

function applyTheme() {
  const html = document.documentElement;
  html.dataset.theme = app.theme;
  if (app.accent === 'terracotta') delete html.dataset.accent;
  else html.dataset.accent = app.accent;
  // Browser/OS chrome follows the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', app.theme === 'light' ? '#f6f1ea' : '#161311');
}

// ---------- routing ----------
function parseRoute() {
  const m = location.pathname.match(/^\/t\/([^/]+)\/?$/);
  if (m) {
    const code = decodeURIComponent(m[1]).toUpperCase();
    if (CODE_RE.test(code)) return { name: 'table', code };
  }
  return { name: 'home' };
}

function go(path, replace = false) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  transition(route);
}

function route() {
  const r = parseRoute();
  if (r.name === 'table') {
    if (!app.table || app.table.code !== r.code) openTable(r.code);
  } else {
    closeTable();
  }
  app.route = r;
  render();
}
addEventListener('popstate', () => transition(route));

function openTable(code) {
  closeTable();
  if (!app.nick) app.nick = `Khách ${Math.floor(Math.random() * 900 + 100)}`;
  app.table = { code, state: null, status: 'connecting', history: null, prevTurn: false };
  app.ui = { tab: 'players' };
  rememberTable(code, {});
  app.table.sock = new TableSocket(code, {
    secret: app.secret,
    nick: app.nick,
    onMessage: onSocketMessage,
    onStatus: (st) => {
      if (!app.table) return;
      app.table.status = st;
      if (st === 'gone') forgetTable(code);
      render();
    },
  });
}

function closeTable() {
  if (app.table) {
    app.table.sock?.close();
    forgetMotion('h');
  }
  app.table = null;
  app.ui = {};
}

function rememberTable(code, extra) {
  const prev = app.recent.find((r) => r.code === code) || {};
  app.recent = [{ ...prev, code, game: prev.game || 'xidach', at: Date.now(), ...extra }, ...app.recent.filter((r) => r.code !== code)].slice(0, 50);
  save('sn.recent', app.recent);
}

function forgetTable(code) {
  app.recent = app.recent.filter((r) => r.code !== code);
  save('sn.recent', app.recent);
}

// ---------- socket ----------
let audio;
function beep(freq = 660, ms = 90) {
  if (!app.sound) return;
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.06;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {}
}

function onSocketMessage(m) {
  const tb = app.table;
  if (!tb) return;
  if (m.t === 'state') {
    app.skew = m.now - Date.now();
    const prevHand = tb.state?.handNo;
    tb.state = m;
    if (m.you.isHost || m.game) rememberTable(tb.code, { game: m.game, host: m.you.isHost || undefined });
    const myTurn = !!m.hand?.actions && m.hand.phase !== 'done';
    if (myTurn && !tb.prevTurn) {
      try {
        if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(60);
      } catch {}
      beep(740);
    }
    if (prevHand !== m.handNo) {
      app.ui.bet = null;
      beep(520, 60);
    }
    tb.prevTurn = myTurn;
    // First snapshot after joining: take a free seat automatically (spectate when full).
    if (!tb.autoSat) {
      tb.autoSat = true;
      if (m.you.seat < 0 && m.seats.some((x) => !x)) send({ t: 'sit' });
    }
    if (app.ui.tab === 'history' && tb.historyHand !== m.handNo) requestHistory();
    render();
  } else if (m.t === 'history') {
    tb.history = m.items;
    tb.historyHand = tb.state?.handNo;
    render();
  } else if (m.t === 'err') {
    toast(errText(m.code));
  } else if (m.t === 'deleted') {
    tb.status = 'gone';
    forgetTable(tb.code);
    render();
  }
}

function requestHistory() {
  app.table?.sock?.send({ t: 'history' });
}

const send = (obj) => app.table?.sock?.send(obj);

// ---------- actions ----------
function readCreateOptions() {
  const form = document.getElementById('createForm');
  const num = (id, d) => {
    const v = Number(document.getElementById(id)?.value);
    return Number.isFinite(v) ? Math.round(v) : d;
  };
  return {
    startChips: num('o-startChips', 1000),
    turnSeconds: num('o-turnSeconds', 30),
    game: form ? readXidachOptions(form, 'o-') : {},
  };
}

export const actions = {
  home: () => go('/'),
  setGame: (d) => {
    app.home.game = d.v;
    render();
  },
  setLang: (d) => {
    app.lang = d.v;
    setLang(d.v);
    save('sn.lang', d.v);
    document.documentElement.lang = d.v;
    render();
  },
  setAccent: (d) => {
    if (!ACCENTS.includes(d.v)) return;
    app.accent = d.v;
    save('sn.accent', d.v);
    applyTheme();
    render();
  },
  toggleTheme: () => {
    app.theme = app.theme === 'light' ? 'dark' : 'light';
    save('sn.theme', app.theme);
    applyTheme();
    render();
  },
  toggleSound: () => {
    app.sound = !app.sound;
    save('sn.sound', app.sound);
    beep();
    render();
  },
  async createTable() {
    if (app.busy) return;
    app.busy = true;
    app.home.error = '';
    render();
    const r = await api.createTable(app.secret, app.home.game, readCreateOptions()).catch(() => ({ ok: false, data: {} }));
    app.busy = false;
    if (!r.ok) {
      app.home.error = r.data?.error === 'too_many_tables' ? t('tooMany') : t('createFailed');
      return render();
    }
    rememberTable(r.data.code, { game: app.home.game, host: true });
    go(`/t/${r.data.code}`);
  },
  joinCode: () => {
    const raw = (document.getElementById('joinCode')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!CODE_RE.test(raw)) {
      app.home.error = t('badCode');
      return render();
    }
    go(`/t/${raw}`);
  },
  openTable: (d) => go(`/t/${d.code}`),
  forgetRecent: (d) => {
    forgetTable(d.code);
    render();
  },
  async deleteRecent(d) {
    if (!confirm(t('confirmDelete'))) return;
    await api.deleteTable(d.code, app.secret).catch(() => {});
    forgetTable(d.code);
    render();
  },
  page: (d) => {
    app.home.page = Math.max(0, Number(d.v) || 0);
    render();
  },
  install: async () => {
    const p = app.installPrompt;
    app.installPrompt = null;
    render();
    try {
      await p?.prompt();
    } catch {}
  },

  // table
  sit: (d) => send(d.seat != null ? { t: 'sit', seat: Number(d.seat) } : { t: 'sit' }),
  stand: () => send({ t: 'stand' }),
  start: () => send({ t: 'start' }),
  addBot: () => send({ t: 'addBot' }),
  removeBot: (d) => send({ t: 'removeBot', seat: Number(d.seat) }),
  kick: (d) => send({ t: 'kick', seat: Number(d.seat) }),
  hit: () => send({ t: 'hit' }),
  stay: () => send({ t: 'stay' }),
  xet: (d) => send({ t: 'xet', seat: Number(d.seat) }),
  xetAll: () => send({ t: 'xetAll' }),
  betSet: (d) => {
    app.ui.bet = Number(d.v);
    render();
  },
  betStep: (d) => {
    const b = app.table?.state?.hand?.actions?.bet;
    if (!b) return;
    const cur = clampBet(app.ui.bet ?? b.min, b);
    app.ui.bet = clampBet(cur + Number(d.v) * b.min, b);
    render();
  },
  bet: () => {
    const b = app.table?.state?.hand?.actions?.bet;
    if (!b) return;
    send({ t: 'bet', amount: clampBet(app.ui.bet ?? b.min, b) });
  },
  rebuy: () => {
    const v = Math.round(Number(document.getElementById('rebuyAmt')?.value));
    if (v > 0) send({ t: 'rebuy', amount: v });
  },
  saveSettings: () => {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    const turnSeconds = Math.round(Number(document.getElementById('s-turnSeconds')?.value)) || undefined;
    send({ t: 'settings', options: { turnSeconds, game: readXidachOptions(form, 's-') } });
    form.querySelectorAll('[data-dirty]').forEach((el) => delete el.dataset.dirty);
    toast('✓');
  },
  deleteTable: () => {
    if (confirm(t('confirmDelete'))) send({ t: 'deleteTable' });
  },
  drawer: () => {
    app.ui.drawer = !app.ui.drawer;
    render();
  },
  tab: (d) => {
    app.ui.tab = d.v;
    if (d.v === 'history') requestHistory();
    render();
  },
  invite: () => {
    app.ui.invite = true;
    app.ui.copied = false;
    render();
  },
  inviteClose: () => {
    app.ui.invite = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    render();
  },
  copyLink: async () => {
    try {
      await navigator.clipboard.writeText(tableUrl(app.table.code));
      app.ui.copied = true;
    } catch {}
    render();
  },
  shareLink: () => navigator.share?.({ title: 'Sòng Nhà', text: app.table.code, url: tableUrl(app.table.code) }).catch(() => {}),
  fullscreen: () => document.querySelector('.invite')?.requestFullscreen?.().catch(() => {}),
  exportCsv: () => {
    const items = app.table?.history || [];
    const rows = [['hand', 'time', 'role', 'player', 'cards', 'result', 'total', 'bet', 'delta', 'commit']];
    for (const it of items)
      for (const r of it.rows)
        rows.push([it.n, new Date(it.at).toISOString(), r.role, r.nick, r.cards.join(' '), r.kind, r.total, r.bet ?? '', r.delta, it.commit]);
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `song-nha-${app.table.code}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  verify: async () => {
    const last = app.table?.state?.fair?.last;
    if (!last) return;
    app.ui.verify = { handNo: last.handNo, ok: await verifyCommitment(last.commit, last.seed, last.deck) };
    render();
  },
};

// ---------- events ----------
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  if (el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset }, e);
});
root.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-submit]');
  if (!form) return;
  e.preventDefault();
  actions[form.dataset.submit]?.({ ...form.dataset }, e);
});
root.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches?.('[data-keep]')) el.dataset.dirty = '1';
  if (el.dataset?.input === 'nick') {
    app.nick = el.value.slice(0, 20);
    save('sn.nick', app.nick);
  }
  if (el.id === 'joinCode') {
    const up = el.value.toUpperCase();
    if (up !== el.value) {
      const p = el.selectionStart;
      el.value = up;
      el.setSelectionRange(p, p);
    }
  }
});
root.addEventListener('change', (e) => {
  if (e.target.matches?.('[data-keep]')) e.target.dataset.dirty = '1';
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.ui.invite) actions.inviteClose();
  else if (e.key === 'Escape' && app.ui.drawer) actions.drawer();
});
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  render();
});

if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1' && !navigator.webdriver) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

document.documentElement.lang = app.lang;
route();
window.App = { app, actions };
