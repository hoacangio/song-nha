// Sòng Nhà client. Views are (app) => HTML strings; every user string goes through esc();
// UI events are delegated: [data-act] → App.actions[name], [data-submit] forms, [data-input] fields.
import { load, save } from './lib/store.js';
import { esc } from './lib/esc.js';
import { t, setLang, errText } from './lib/i18n.js';
import { toCsv } from './lib/csv.js';
import { verifyCommitment } from './domain/shuffle.js';
import { deviceSecret } from './services/identity.js';
import { api } from './services/api.js';
import { TableSocket } from './services/socket.js';
import { homeView, rulesView, rulesFields, askNameView } from './views/home.js';
import { settingsView } from './ui/accent.js';
import { learnPage, learnLang } from './views/learn.js';
import { COURSES, COURSE_IDS, PASS_SCORE, EXAM_SIZE, isComplete, normalizeProgress } from './learn/index.js';
import { drawCertificate, certificateId } from './learn/certificate.js';
import { tableView, tableUrl } from './views/table.js';
import { clampBet } from './views/xidach.js';
import { GAME_VIEWS } from './views/games.js';
import { selectionState } from './views/tienlen.js';
import { clampRaise } from './views/holdem.js';
import { suggestPlay, sortCards } from './domain/tienlen.js';
import { bestArrangement, sortForArrange } from './domain/maubinh.js';
import { botExchange, botPlay, sortTichu } from './domain/tichu.js';
import { tichuSelection } from './views/tichu.js';
import { forgetMotion } from './lib/motion.js';
import { ACCENTS, normalizeAccent, isBirthYear, suggestedAccent, menhOf } from './domain/fengshui.js';
import { sfx, cuesFor, setSoundEnabled, setVolume, unlock as unlockAudio } from './ui/sfx.js';

const CODE_RE = /^[A-Z]{3,8}-\d{3,4}$/;
const root = document.getElementById('app');

const app = {
  route: { name: 'home' },
  nick: load('sn.nick', ''),
  // Vietnamese by default for everyone (whatever the browser language); English only once chosen.
  lang: load('sn.lang', 'vi') === 'en' ? 'en' : 'vi',
  theme: load('sn.theme', 'dark') === 'light' ? 'light' : 'dark',
  tableTheme: ['vegas', 'macau', 'phuquoc', 'cambodia'].includes(load('sn.table', '')) ? load('sn.table', '') : 'vegas',
  accent: normalizeAccent(load('sn.accent', 'terracotta')),
  birthYear: isBirthYear(load('sn.birthYear', null)) ? load('sn.birthYear', null) : null,
  sound: load('sn.sound', true),
  learnProg: normalizeProgress(load('sn.learnProg', {})),
  volume: load('sn.volume', 0.7),
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
app.nickSaved = !!savedName();
setLang(app.lang);
applyTheme();
setSoundEnabled(app.sound);
setVolume(app.volume);

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
  // Overlays that are already on screen must not replay their open animation on re-render.
  // Keep the reading position of a lesson when a background update (e.g. the table) re-renders.
  const lb = root.querySelector('.learn-body');
  const learnScroll = lb && app.ui.learn ? { key: `${app.ui.learn.game}/${app.ui.learn.tab}`, top: lb.scrollTop, k: lb.dataset.k } : null;
  const shownOverlays = new Set([...root.querySelectorAll('.overlay[data-ov]')].map((o) => o.dataset.ov));

  root.innerHTML =
    (app.route.name === 'learn' && app.ui.learn
      ? learnPage(app)
      : app.route.name === 'table' && app.table
        ? tableView(app)
        : homeView(app)) +
    (app.ui.rules && app.route.name !== 'table' ? rulesView(app) : '') +
    (app.ui.settings ? settingsView(app) : '') +
    (app.ui.askName ? askNameView(app) : '') +
    (app.toast ? `<div class="toast" role="status">${esc(app.toast.text)}</div>` : '');
  for (const o of root.querySelectorAll('.overlay[data-ov]')) if (shownOverlays.has(o.dataset.ov)) o.classList.add('steady');
  const cf = document.getElementById('createForm');
  applyDraft(cf);
  // Rules sheet tabs: show only the active group (all fields stay in the DOM for drafts).
  if (cf?.dataset.tab) {
    for (const el of cf.children) {
      const g = el.dataset.g || 'general';
      el.hidden = cf.querySelector('fieldset[data-g]') ? g !== cf.dataset.tab : false;
    }
  }

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
  const nb = root.querySelector('.learn-body');
  if (nb && app.ui.learn) {
    nb.dataset.k = `${app.ui.learn.game}/${app.ui.learn.tab}`;
    if (learnScroll && learnScroll.k === nb.dataset.k) nb.scrollTop = learnScroll.top;
  }
  tickCountdowns();
}

function transition(fn) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // A transition can be aborted (e.g. the mobile URL bar resizes the viewport); the DOM update still runs.
    const vt = document.startViewTransition(() => {
      fn();
    });
    for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) p?.catch(() => {});
  } else fn();
}

let lastTickSecond = null;
function tickCountdowns() {
  const now = Date.now() + app.skew;
  const h = app.table?.state?.hand;
  if (h?.actions && h.phase !== 'done' && h.deadline) {
    const left = Math.ceil((h.deadline - now) / 1000);
    if (left <= 5 && left > 0 && left !== lastTickSecond) sfx('tick');
    lastTickSecond = left;
  }
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
  html.dataset.table = app.tableTheme;
  if (app.accent === 'terracotta') delete html.dataset.accent;
  else html.dataset.accent = app.accent;
  // Browser/OS chrome follows the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', app.theme === 'light' ? '#f6f1ea' : '#161311');
}

/**
 * Look & sound changes only touch CSS variables on <html> plus the settings sheet itself, so update
 * that sheet in place instead of re-rendering the whole screen (the table, cards and seats stay put).
 */
function refreshSettings() {
  const sheet = root.querySelector('.sheet.settings');
  if (!sheet) return render();
  const tpl = document.createElement('template');
  tpl.innerHTML = settingsView(app);
  const fresh = tpl.content.querySelector('.sheet.settings');
  const focusId = document.activeElement?.id;
  sheet.innerHTML = fresh.innerHTML;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

/** Marks the open lesson tab as read. */
function markSeen() {
  const L = app.ui.learn;
  if (!L) return;
  const ids = COURSES[L.game].lessons(learnLang()).map((l) => l.id);
  const prog = app.learnProg[L.game];
  if (ids.includes(L.tab) && !prog.seen.includes(L.tab)) {
    prog.seen.push(L.tab);
    save('sn.learnProg', app.learnProg);
  }
}

/** Draws the certificate for the open course (only when the course is complete). */
async function makeCertificate(name) {
  const game = app.ui.learn?.game;
  const prog = game && app.learnProg[game];
  if (!prog || !isComplete(game, prog, learnLang())) return;
  const who = cleanName(name ?? savedName());
  if (!who) {
    app.ui.cert = { game, needName: true };
    if (app.ui.learn?.tab === 'cert') render();
    return;
  }
  const date = (prog.passedAt || new Date().toISOString()).slice(0, 10);
  const courseTitle = COURSES[game].title(learnLang());
  const id = await certificateId({ name: who, course: game, score: prog.best, total: EXAM_SIZE, date });
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#b4532a';
  const cv = drawCertificate({ name: who, courseTitle, score: prog.best, total: EXAM_SIZE, date, id, lang: learnLang(), accent });
  // A data: URL works for both the preview (CSP allows img-src data:) and the download.
  app.ui.cert = { game, name: who, id, url: cv.toDataURL('image/png') };
  if (app.ui.learn?.tab === 'cert') render();
}

// ---------- routing ----------
function parseRoute() {
  const l = location.pathname.match(/^\/hoc\/([a-z]+)(?:\/([a-z0-9-]+))?\/?$/);
  if (l && COURSE_IDS.includes(l[1])) {
    const tabs = [...COURSES[l[1]].lessons(learnLang()).map((x) => x.id), 'exam', 'cert'];
    return { name: 'learn', game: l[1], tab: tabs.includes(l[2]) ? l[2] : tabs[0] };
  }
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

/** Opens a course page. Switching lessons replaces the URL so Back leaves the course in one step. */
function learnGo(game, tab, replace) {
  if (!replace && app.route.name !== 'learn') app.learnFrom = location.pathname;
  const path = `/hoc/${game}${tab ? `/${tab}` : ''}`;
  if (replace) {
    history.replaceState(null, '', path); // switching lessons: instant, no page transition
    route();
  } else go(path);
}

/** The name the player saved on this device (used at tables and on certificates). */
function savedName() {
  return cleanName(load('sn.nick', ''));
}
function cleanName(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
}
function setName(v) {
  const n = cleanName(v);
  if (!n) return false;
  app.nick = n;
  app.nickSaved = true;
  save('sn.nick', n);
  return true;
}

function route() {
  const r = parseRoute();
  if (r.name === 'learn') {
    // Course page. An open table stays connected underneath so "Về bàn" returns to it as it was.
    app.ui.learn = { game: r.game, tab: r.tab };
    app.ui.drawer = false;
    app.route = r;
    if (r.tab === 'cert') makeCertificate();
    markSeen();
    return render();
  }
  app.ui.learn = null;
  if (r.name === 'table') {
    // Ask for a name before sitting down (once per device); "guest" skips without saving.
    if (!savedName() && !app.guestOk) {
      app.ui.askName = { code: r.code };
      app.route = { name: 'home' };
      return render();
    }
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
  if (!app.nick) app.nick = `Khách ${Math.floor(Math.random() * 900 + 100)}`; // guest name, not saved
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
function onSocketMessage(m) {
  const tb = app.table;
  if (!tb) return;
  if (m.t === 'state') {
    app.skew = m.now - Date.now();
    const prevHand = tb.state?.handNo;
    const prevState = tb.state;
    tb.state = m;
    if (prevState) for (const [name, at] of cuesFor(prevState, m)) sfx(name, at);
    if (m.you.isHost || m.game) rememberTable(tb.code, { game: m.game, host: m.you.isHost || undefined });
    const myTurn = !!m.hand?.actions && m.hand.phase !== 'done';
    if (myTurn && !tb.prevTurn) {
      try {
        if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(60);
      } catch {}
    }
    if (!m.hand?.actions?.raise) app.ui.raising = false;
    if (app.ui.sel?.size) {
      const mine = m.hand?.seats?.[m.you.seat]?.cards || [];
      for (const c of [...app.ui.sel]) if (!mine.includes(c)) app.ui.sel.delete(c);
    }
    if (prevHand !== m.handNo) {
      app.ui.bet = null;
      app.ui.sel = new Set();
      app.ui.mb = null;
      app.ui.give = [];
    }
    // Mậu binh: my local layout starts from what I submitted, or my cards sorted high → low.
    const mine = m.game === 'maubinh' ? m.hand?.seats?.[m.you.seat] : null;
    if (mine && m.hand.phase !== 'done' && (mine.cards || mine.arr) && !app.ui.mb) {
      app.ui.mb = { order: mine.arr ?? sortForArrange(mine.cards), pick: null };
    }
    if (m.game === 'tichu' && m.hand?.phase !== 'exchange') app.ui.give = [];
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
/** Rule options typed in the options sheet, kept per game while the sheet is closed. */
const draftOf = () => ((app.home.draft ||= {})[app.home.game] ||= {});

function applyDraft(form) {
  if (!form) return;
  for (const [id, v] of Object.entries(draftOf())) {
    const el = form.querySelector(`#${CSS.escape(id)}`);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
}

function readCreateOptions() {
  // Build the fields off-screen, apply the draft, and read them with the game's own reader.
  const form = document.createElement('form');
  form.innerHTML = rulesFields(app);
  applyDraft(form);
  const num = (id, d) => {
    const v = Number(form.querySelector(`#${id}`)?.value);
    return Number.isFinite(v) ? Math.round(v) : d;
  };
  return {
    startChips: num('o-startChips', 1000),
    turnSeconds: num('o-turnSeconds', 30),
    public: !!form.querySelector('#o-public')?.checked,
    game: GAME_VIEWS[app.home.game].readOptions(form, 'o-'),
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
  setTable: (d) => {
    if (!['vegas', 'macau', 'phuquoc', 'cambodia'].includes(d.v)) return;
    app.tableTheme = d.v;
    save('sn.table', d.v);
    applyTheme();
    sfx('shuffle');
    refreshSettings();
  },
  setBirthYear: () => {
    const y = Math.round(Number(document.getElementById('birthYear')?.value));
    if (!isBirthYear(y)) {
      app.birthYear = null;
      save('sn.birthYear', null);
      return refreshSettings();
    }
    app.birthYear = y;
    save('sn.birthYear', y);
    document.getElementById('birthYear')?.removeAttribute('data-dirty');
    // Pick the most favourable colour for that mệnh the first time.
    const best = suggestedAccent(y);
    if (best) actions.setAccent({ v: best });
    refreshSettings();
  },
  setAccent: (d) => {
    if (!ACCENTS.includes(d.v)) return;
    app.accent = d.v;
    save('sn.accent', d.v);
    applyTheme();
    refreshSettings();
  },
  toggleTheme: () => {
    app.theme = app.theme === 'light' ? 'dark' : 'light';
    save('sn.theme', app.theme);
    applyTheme();
    refreshSettings();
  },
  toggleSound: () => {
    app.sound = !app.sound;
    save('sn.sound', app.sound);
    setSoundEnabled(app.sound);
    sfx('turn');
    refreshSettings();
  },
  setVolume: (d) => {
    app.volume = Math.min(1, Math.max(0, Number(d.v)));
    save('sn.volume', app.volume);
    setVolume(app.volume);
    sfx('chip');
  },
  async createTable() {
    if (app.busy) return;
    app.busy = true;
    app.home.error = '';
    render();
    const r = await api.createTable(app.secret, app.home.game, readCreateOptions()).catch(() => ({ ok: false, data: {} }));
    app.busy = false;
    if (!r.ok) {
      app.home.error =
        r.data?.error === 'too_many_tables'
          ? t('tooMany')
          : r.data?.error === 'create_rate'
            ? t('createRate', Math.max(1, Math.ceil((r.data.retryAfter || 60) / 60)))
            : t('createFailed');
      return render();
    }
    rememberTable(r.data.code, { game: app.home.game, host: true });
    go(`/t/${r.data.code}`);
  },
  homeTab: (d) => {
    app.home.mtab = ['play', 'recent', 'learn'].includes(d.v) ? d.v : 'play';
    app.home.page = 0;
    render();
  },
  async joinRandom() {
    if (app.busy) return;
    app.busy = true;
    render();
    // Prefer the selected game, then any game.
    let r = await api.randomTable(app.home.game).catch(() => ({ ok: false }));
    if (!r.ok) r = await api.randomTable().catch(() => ({ ok: false }));
    app.busy = false;
    if (!r.ok || !r.data?.code) {
      render();
      return toast(t('randomNone'));
    }
    go(`/t/${r.data.code}`);
  },
  togglePublic: () => {
    const on = !app.table?.state?.opts?.public;
    send({ t: 'setPublic', on });
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
  // Hold'em
  hdFold: () => send({ t: 'fold' }),
  hdCheck: () => send({ t: 'check' }),
  hdCall: () => send({ t: 'call' }),
  hdAllin: () => send({ t: 'allin' }),
  raiseOpen: () => {
    app.ui.raising = true;
    app.ui.raise = null;
    render();
  },
  raiseCancel: () => {
    app.ui.raising = false;
    render();
  },
  raisePreset: (d) => {
    app.ui.raise = Number(d.v);
    render();
  },
  raiseConfirm: () => {
    const a = app.table?.state?.hand?.actions;
    if (!a?.raise) return;
    const v = clampRaise(app.ui.raise ?? a.raise.min, a);
    app.ui.raising = false;
    send(v >= a.raise.max ? { t: 'allin' } : { t: 'raise', amount: v });
  },
  settingsOpen: (d) => {
    const wasOpen = !!app.ui.settings;
    app.ui.settings = d.v || 'table';
    if (wasOpen) return refreshSettings(); // switching tabs inside the sheet
    app.ui.drawer = false;
    render();
  },
  settingsClose: () => {
    app.ui.settings = null;
    render();
  },
  rulesTab: (d) => {
    app.ui.rulesTab = d.v;
    render();
  },
  rulesOpen: () => {
    app.ui.rules = true;
    app.ui.rulesTab = 'general';
    render();
  },
  rulesClose: () => {
    app.ui.rules = false;
    render();
  },
  rulesReset: () => {
    if (app.home.draft) app.home.draft[app.home.game] = {};
    app.ui.rules = false;
    render();
    app.ui.rules = true;
    render();
  },
  // ----- learn: courses, exams, certificates -----
  learnOpen: (d) => {
    const game = COURSE_IDS.includes(d.game) ? d.game : app.table?.state?.game || app.home.game;
    learnGo(game, d.tab, false);
  },
  learnGame: (d) => {
    if (COURSE_IDS.includes(d.v)) learnGo(d.v, null, true);
  },
  learnTab: (d) => {
    if (app.ui.learn) learnGo(app.ui.learn.game, d.v, true);
  },
  learnClose: () => {
    // Back to wherever the course was opened from (home or the table); a direct link goes home.
    if (app.learnFrom) {
      const from = app.learnFrom;
      app.learnFrom = null;
      go(from);
    } else go('/');
  },
  examStart: () => {
    const game = app.ui.learn.game;
    app.ui.exam = { game, qs: COURSES[game].exam(learnLang()), i: 0, score: 0, picked: null };
    render();
  },
  examPick: (d) => {
    const ex = app.ui.exam;
    if (!ex || ex.picked != null || ex.i >= ex.qs.length) return;
    ex.picked = d.v;
    if (d.v === ex.qs[ex.i].answer) {
      ex.score += 1;
      sfx('chip');
    } else sfx('pass');
    render();
  },
  examNext: () => {
    const ex = app.ui.exam;
    if (!ex || ex.picked == null) return;
    ex.i += 1;
    ex.picked = null;
    if (ex.i >= ex.qs.length) {
      const prog = app.learnProg[ex.game];
      if (ex.score > prog.best) prog.best = ex.score;
      if (ex.score >= PASS_SCORE && !prog.passedAt) prog.passedAt = new Date().toISOString();
      save('sn.learnProg', app.learnProg);
      sfx(ex.score >= PASS_SCORE ? 'bigwin' : 'lose');
    }
    render();
  },
  certMake: () => {
    const el = document.getElementById('certName');
    if (!setName(el?.value)) {
      el?.focus();
      return toast(t('askNameRequired'));
    }
    el?.removeAttribute('data-dirty');
    makeCertificate(app.nick);
  },
  askNameSave: () => {
    const el = document.getElementById('askName');
    if (!setName(el?.value)) {
      el?.focus();
      return toast(t('askNameRequired'));
    }
    const code = app.ui.askName?.code;
    app.ui.askName = null;
    if (code) route();
    else render();
  },
  askNameGuest: () => {
    app.guestOk = true;
    app.ui.askName = null;
    route();
  },
  certDownload: () => {
    const c = app.ui.cert;
    if (!c?.url) return;
    const a = document.createElement('a');
    a.href = c.url;
    a.download = `song-nha-chung-chi-${c.game}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  handHelp: () => actions.learnOpen({ game: 'holdem', tab: 'rankings' }),
  // Mậu binh: tap a card, then another to swap them (across chi too)
  mbTap: (d) => {
    const mb = app.ui.mb;
    if (!mb) return;
    if (!mb.pick) mb.pick = d.card;
    else if (mb.pick === d.card) mb.pick = null;
    else {
      const i = mb.order.indexOf(mb.pick);
      const j = mb.order.indexOf(d.card);
      if (i >= 0 && j >= 0) [mb.order[i], mb.order[j]] = [mb.order[j], mb.order[i]];
      mb.pick = null;
    }
    render();
  },
  mbAuto: () => {
    const s = app.table?.state;
    const mine = s?.hand?.seats?.[s.you.seat]?.cards;
    if (!mine || !app.ui.mb) return;
    app.ui.mb = { order: bestArrangement(mine, s.opts.game), pick: null };
    render();
  },
  mbSubmit: () => {
    if (app.ui.mb) send({ t: 'arrange', cards: app.ui.mb.order.slice() });
  },
  mbEdit: () => send({ t: 'unready' }),
  // Tichu
  tcGrand: (d) => send({ t: 'grand', call: d.v === '1' }),
  tcTichu: () => send({ t: 'tichu' }),
  tcGiveTap: (d) => {
    if (!d.card) return;
    const give = (app.ui.give ||= []);
    const i = give.indexOf(d.card);
    if (i >= 0) give[i] = null;
    else {
      const free = [0, 1, 2].find((k) => !give[k]);
      if (free == null) return;
      give[free] = d.card;
    }
    render();
  },
  tcGiveHint: () => {
    const s = app.table?.state;
    const mine = s?.hand?.seats?.[s.you.seat]?.cards;
    if (!mine) return;
    app.ui.give = botExchange(mine);
    render();
  },
  tcGive: () => {
    const g = app.ui.give || [];
    if (g.filter(Boolean).length === 3) send({ t: 'exchange', cards: g.slice(0, 3) });
  },
  tcPlay: () => {
    const st = tichuSelection(app);
    if (!st.ok) return;
    const msg = { t: 'play', cards: sortTichu([...app.ui.sel]) };
    const w = Number(document.getElementById('tcWish')?.value);
    if (st.mj && Number.isInteger(w) && w >= 2 && w <= 14) msg.wish = w;
    send(msg);
  },
  tcHint: () => {
    const s = app.table?.state;
    const h = s?.hand;
    const me = s?.you.seat;
    const mine = h?.seats?.[me]?.cards;
    if (!mine) return;
    const pIdx = h.players.indexOf(me);
    const partner = h.players[(pIdx + 2) % 4];
    const opp = [h.players[(pIdx + 1) % 4], h.players[(pIdx + 3) % 4]].filter((p) => h.seats[p].count > 0);
    const pick = botPlay(mine, {
      prev: h.trick?.combo ?? null,
      wish: h.wish,
      partnerOwns: false, // a hint always looks for a play
      partnerOut: h.seats[partner].count === 0,
      partnerCount: h.seats[partner].count,
      oppMinCount: opp.length ? Math.min(...opp.map((p) => h.seats[p].count)) : 99,
      myCount: mine.length,
    });
    app.ui.sel = new Set(pick?.cards || []);
    if (!pick) toast(t('tl_noPlay'));
    render();
  },
  tcDragon: (d) => send({ t: 'giveDragon', seat: Number(d.seat) }),
  // Tiến lên
  toggleCard: (d) => {
    const sel = (app.ui.sel ||= new Set());
    if (sel.has(d.card)) sel.delete(d.card);
    else sel.add(d.card);
    render();
  },
  playSel: () => {
    if (!selectionState(app).ok) return;
    send({ t: 'play', cards: sortCards([...app.ui.sel]) });
  },
  pass: () => {
    app.ui.sel = new Set();
    send({ t: 'pass' });
  },
  hint: () => {
    const h = app.table?.state?.hand;
    const mine = h?.seats?.[app.table.state.you.seat]?.cards;
    if (!mine) return;
    const cards = suggestPlay(mine, h.trick?.combo ?? null, app.table.state.opts.game, h.mustInclude);
    app.ui.sel = new Set(cards || []);
    if (!cards) toast(t('tl_noPlay'));
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
    const gv = GAME_VIEWS[app.table.state.game];
    send({ t: 'settings', options: { turnSeconds, game: gv.readOptions(form, 's-') } });
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
  unlockAudio();
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  if (el.matches('button') && !['toggleSound', 'setVolume'].includes(el.dataset.act)) sfx(el.dataset.act === 'toggleCard' ? 'deal' : 'tap');
  if (el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset }, e);
});
// Bottom sheets (mobile): drag the top of a sheet down to close it.
let sheetDrag = null;
root.addEventListener('pointerdown', (e) => {
  if (innerWidth >= 1024) return;
  const sheet = e.target.closest('.overlay[data-act] > .sheet');
  if (!sheet || e.target.closest('button, input, select, textarea, a')) return;
  if (e.clientY - sheet.getBoundingClientRect().top > 56) return; // handle + title only
  sheetDrag = { sheet, y0: e.clientY, dy: 0, act: sheet.parentElement.dataset.act };
  sheet.classList.add('dragging');
  sheet.classList.remove('settle');
});
root.addEventListener('pointermove', (e) => {
  if (!sheetDrag) return;
  if (!sheetDrag.sheet.isConnected) return void (sheetDrag = null);
  sheetDrag.dy = Math.max(0, e.clientY - sheetDrag.y0);
  sheetDrag.sheet.style.transform = `translateY(${sheetDrag.dy}px)`;
});
const endSheetDrag = () => {
  if (!sheetDrag) return;
  const { sheet, dy, act } = sheetDrag;
  sheetDrag = null;
  sheet.classList.remove('dragging');
  if (dy > Math.min(120, sheet.offsetHeight * 0.25) && actions[act]) return void actions[act]({});
  sheet.classList.add('settle');
  sheet.style.transform = '';
};
root.addEventListener('pointerup', endSheetDrag);
root.addEventListener('pointercancel', endSheetDrag);
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
    app.nickSaved = !!cleanName(app.nick);
    save('sn.nick', app.nick);
  }
  recordDraft(el);
  if (el.id === 'raiseAmt') {
    app.ui.raise = Number(el.value);
    const go = document.getElementById('raiseGo');
    const a = app.table?.state?.hand?.actions;
    if (go && a?.raise) go.textContent = `${a.raise.bet ? t('hd_bet') : t('hd_raiseTo')} ${Number(el.value).toLocaleString('en-US')}`;
    root.querySelectorAll('[data-act=raisePreset]').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(el.value)));
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
function recordDraft(el) {
  if (!el.closest?.('#createForm') || !el.id) return;
  draftOf()[el.id] = el.type === 'checkbox' ? el.checked : el.value;
}
root.addEventListener('change', (e) => {
  recordDraft(e.target);
  if (e.target.id === 'volume') actions.setVolume({ v: e.target.value });
  if (e.target.matches?.('[data-keep]')) e.target.dataset.dirty = '1';
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.ui.settings) actions.settingsClose();
  else if (e.key === 'Escape' && app.ui.rules) actions.rulesClose();
  else if (e.key === 'Escape' && app.ui.learn) actions.learnClose();
  else if (e.key === 'Escape' && app.ui.invite) actions.inviteClose();
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
