const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, dialog, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- Config

const APP_DIR = __dirname;
const CONFIG_PATH = path.join(APP_DIR, 'config.json');

// Windows-Editoren (Notepad, PowerShell) schreiben oft UTF-8 mit BOM — JSON.parse verträgt das nicht
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const defaults = {
  port: 4823,
  thresholdSeconds: 60,
  cooldownMinutes: 5,
  hotkey: 'Ctrl+Alt+L',
  wordsPerPopup: 5,
  autostart: true,
  deckPath: 'data/deck.json',
};

let config = { ...defaults };
try {
  config = { ...defaults, ...readJson(CONFIG_PATH) };
} catch (e) {
  console.error('config.json unreadable, using defaults:', e.message);
}

// Free-Limits: bewusst Konstanten statt config — siehe README („Free limits").
// 5 Popups pro Deck und Tag, 2 aktive Decks.
const POPUPS_PER_DECK_PER_DAY = 5;
const MAX_DECKS = 2;
const SUPPORT_URL = 'https://github.com/YOUR_USERNAME/WaitWords#support';

// ---------------------------------------------------------------- Nutzung (Limits)

let usagePath;
// byDeck: Zähler pro Deck-id für den heutigen Tag; Mitternacht setzt zurück
let usage = { date: '', byDeck: {}, activeDeckIndex: 0 };

function localToday() {
  return new Date().toLocaleDateString('sv'); // YYYY-MM-DD, lokale Zeitzone
}

function loadUsage() {
  usagePath = path.join(app.getPath('userData'), 'usage.json');
  try {
    usage = { ...usage, ...readJson(usagePath) };
  } catch {}
  if (!usage.byDeck) usage.byDeck = {};
  rolloverUsage();
  saveUsage();
}

function saveUsage() {
  try {
    fs.writeFileSync(usagePath, JSON.stringify(usage, null, 2));
  } catch (e) {
    console.error('usage.json nicht schreibbar:', e.message);
  }
}

function rolloverUsage() {
  const t = localToday();
  if (usage.date !== t) {
    usage.date = t;
    usage.byDeck = {};
  }
}

function usedToday() {
  rolloverUsage();
  return usage.byDeck[meta.id] || 0;
}

function popupsLeft() {
  return Math.max(0, POPUPS_PER_DECK_PER_DAY - usedToday());
}

// ---------------------------------------------------------------- Deck

const metaDefaults = {
  id: 'default',
  title: 'Quick break?',
  instruction: 'Type your answer, Enter = next field',
  placeholder: 'answer …',
  ui: {},
};
const uiDefaults = {
  check: 'Check',
  done: 'Done',
  solution: 'Solution',
  wasRight: 'I was right ✓',
  correct: 'correct',
  allSkipped: 'all skipped',
};

let meta = { ...metaDefaults, ui: { ...uiDefaults } };
let words = []; // Karten des aktiven Decks

// decks-Array in config; altes deckPath-Feld bleibt als Fallback gültig
function deckList() {
  if (Array.isArray(config.decks) && config.decks.length > 0) return config.decks;
  return [config.deckPath];
}

function activeDeckPath() {
  const list = deckList();
  let i = usage.activeDeckIndex || 0;
  if (i >= list.length || i >= MAX_DECKS) i = 0; // Free: nur die ersten MAX_DECKS wählbar
  return list[i];
}

function loadDeck() {
  const deckPath = path.resolve(APP_DIR, activeDeckPath());
  let deck;
  try {
    deck = readJson(deckPath);
  } catch (e) {
    return `Deck file could not be read or is not valid JSON:\n${deckPath}\n\n${e.message}`;
  }
  const errors = [];
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    errors.push('"cards" must be a non-empty array.');
  } else {
    const seen = new Set();
    deck.cards.forEach((c, i) => {
      if (!c.id) errors.push(`Card ${i}: missing "id".`);
      else if (seen.has(c.id)) errors.push(`Card ${i}: duplicate id "${c.id}".`);
      else seen.add(c.id);
      if (!c.front || typeof c.front !== 'string') errors.push(`Card ${i} (${c.id || '?'}): missing "front".`);
      if (!Array.isArray(c.answers) || c.answers.length === 0) errors.push(`Card ${i} (${c.id || '?'}): "answers" must be a non-empty array.`);
    });
  }
  if (errors.length > 0) {
    return `Deck is invalid: ${deckPath}\n\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n… and ${errors.length - 10} more` : ''}`;
  }
  meta = { ...metaDefaults, ...(deck.meta || {}), ui: { ...uiDefaults, ...((deck.meta || {}).ui || {}) } };
  words = deck.cards;
  return null; // ok
}

let progressPath; // erst nach app.ready bekannt (userData)
let progress = {}; // { [cardId]: { correct, wrong, streak, lastSeen } }

function loadProgress() {
  progressPath = path.join(app.getPath('userData'), `progress-${meta.id}.json`);
  try {
    progress = readJson(progressPath);
  } catch {
    progress = {};
  }
}

function saveProgress() {
  try {
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  } catch (e) {
    console.error('progress.json nicht schreibbar:', e.message);
  }
}

function statsFor(id) {
  return progress[id] || { correct: 0, wrong: 0, streak: 0, lastSeen: 0 };
}

// new: nie gesehen | good: streak >= 3 | problem: gesehen + schon falsch + streak < 3 | learning: Rest
function statusOf(id) {
  const s = statsFor(id);
  if (!s.lastSeen) return 'new';
  if (s.streak >= 3) return 'good';
  if (s.wrong > 0) return 'problem';
  return 'learning';
}

// Auswahl: 2 problem + 2 new + 1 good; Lücken auffüllen (problem/learning -> new -> good).
// Innerhalb Pool: am längsten nicht gesehen zuerst.
function pickWords(n) {
  const pools = { problem: [], learning: [], new: [], good: [] };
  for (const w of words) pools[statusOf(w.id)].push(w);
  const byOldest = (a, b) => statsFor(a.id).lastSeen - statsFor(b.id).lastSeen;
  pools.problem.sort(byOldest);
  pools.learning.sort(byOldest);
  pools.good.sort(byOldest);
  shuffle(pools.new);

  const picked = [];
  const take = (pool, count) => {
    while (count > 0 && pool.length > 0) {
      picked.push(pool.shift());
      count--;
    }
  };
  take(pools.problem, 2);
  take(pools.new, 2);
  take(pools.good, 1);
  // Auffüllen bis n
  for (const pool of [pools.problem, pools.learning, pools.new, pools.good]) {
    take(pool, n - picked.length);
  }
  shuffle(picked);
  return picked.slice(0, n);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function applyResults(results) {
  const now = Date.now();
  for (const r of results) {
    const s = statsFor(r.id);
    if (r.result === 'correct') {
      s.correct++;
      s.streak++;
    } else if (r.result === 'wrong') {
      s.wrong++;
      s.streak = 0;
    } // 'skipped': nur lastSeen aktualisieren? Nein — übersprungen zählt gar nicht als gesehen.
    if (r.result !== 'skipped') s.lastSeen = now;
    if (r.result !== 'skipped') progress[r.id] = s;
  }
  saveProgress();
}

// ---------------------------------------------------------------- Popup / Statistik-Fenster

let popupWin = null;
let statsWin = null;
let tray = null;
let lastPopupAt = 0;
let pausedUntil = 0;

function popupAllowed() {
  const now = Date.now();
  if (now < pausedUntil) return false;
  if (now - lastPopupAt < config.cooldownMinutes * 60 * 1000) return false;
  return true;
}

function showPopup(force = false) {
  if (popupWin && !popupWin.isDestroyed()) return; // schon offen
  if (!force && !popupAllowed()) return;
  if (words.length === 0) return;
  if (popupsLeft() <= 0) { updateTrayTooltip(); return; } // Deck-Limit: still, kein Popup
  lastPopupAt = Date.now();
  usage.byDeck[meta.id] = usedToday() + 1;
  saveUsage();
  updateTrayTooltip();

  const { workArea } = screen.getPrimaryDisplay();
  const w = 380, h = 560;
  popupWin = new BrowserWindow({
    width: w,
    height: h,
    x: workArea.x + workArea.width - w - 16,
    y: workArea.y + workArea.height - h - 16,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  popupWin.loadFile('popup.html');
  popupWin.once('ready-to-show', () => {
    popupWin.showInactive(); // kein Fokusklau vom Editor
    // Debug-Screenshot wie bei PlanetDesk: env WAITWORDS_SHOT=<pfad.png>
    if (process.env.WAITWORDS_SHOT) {
      setTimeout(() => {
        if (!popupWin || popupWin.isDestroyed()) return;
        popupWin.webContents.capturePage().then((img) => {
          fs.writeFileSync(process.env.WAITWORDS_SHOT, img.toPNG());
        }).catch(() => {});
      }, 1500);
    }
  });
  popupWin.on('closed', () => { popupWin = null; lastQuiz = []; });
}

function showStats() {
  if (statsWin && !statsWin.isDestroyed()) { statsWin.focus(); return; }
  statsWin = new BrowserWindow({
    width: 560,
    height: 640,
    title: 'WaitWords — Statistics',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  statsWin.loadFile('stats.html');
  statsWin.on('closed', () => { statsWin = null; });
}

// ---------------------------------------------------------------- IPC

let lastQuiz = [];
ipcMain.handle('get-quiz-words', () => {
  lastQuiz = pickWords(config.wordsPerPopup).map((w) => ({ ...w, status: statusOf(w.id) }));
  return {
    meta,
    words: lastQuiz,
    usage: { used: usedToday(), limit: POPUPS_PER_DECK_PER_DAY },
  };
});

ipcMain.handle('submit-results', (_e, results) => {
  applyResults(results);
  return true;
});

ipcMain.handle('get-stats', () => {
  return words.map((w) => ({
    front: w.front,
    answers: w.answers,
    level: w.level,
    status: statusOf(w.id),
    ...statsFor(w.id),
  }));
});

ipcMain.on('close-popup', () => {
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();
});

// ---------------------------------------------------------------- Job-Tracking + HTTP-API

// sessions: { [sessionId]: { count, timer } }
const sessions = new Map();

function jobStart(sessionId, thresholdSeconds) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { count: 0, timer: null };
    sessions.set(sessionId, s);
  }
  s.count++;
  if (!s.timer) {
    const secs = Number(thresholdSeconds) > 0 ? Number(thresholdSeconds) : config.thresholdSeconds;
    s.timer = setTimeout(() => {
      s.timer = null;
      if (s.count > 0) showPopup();
    }, secs * 1000);
  }
}

function jobStop(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.count = Math.max(0, s.count - 1);
  if (s.count === 0) {
    if (s.timer) clearTimeout(s.timer);
    sessions.delete(sessionId);
  }
}

function jobReset(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  sessions.delete(sessionId);
}

function startServer() {
  const server = http.createServer((req, res) => {
    // CORS offen — vorbereitet für V2-Browser-Extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    // Chrome Private Network Access: erlaubt Requests von öffentlichen Seiten an localhost
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/debug/quiz' && process.env.WAITWORDS_DEBUG === '1') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(lastQuiz));
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        app: 'waitwords',
        activeSessions: sessions.size,
        deck: meta.id,
        usage: { used: usedToday(), limit: POPUPS_PER_DECK_PER_DAY },
      }));
      return;
    }

    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (d) => { raw += d; if (raw.length > 65536) req.destroy(); });
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch {}
        const sessionId = String(body.sessionId || 'default');
        switch (req.url) {
          case '/start': jobStart(sessionId, body.thresholdSeconds); break;
          case '/stop': jobStop(sessionId); break;
          case '/reset': jobReset(sessionId); break;
          case '/trigger': showPopup(true); break;
          case '/shot': // nur mit WAITWORDS_DEBUG=1: Popup-Inhalt als PNG speichern
            if (process.env.WAITWORDS_DEBUG === '1' && popupWin && !popupWin.isDestroyed() && body.path) {
              popupWin.webContents.capturePage()
                .then((img) => fs.writeFileSync(body.path, img.toPNG()))
                .catch(() => {});
            }
            break;
          case '/debug/fill': // nur mit WAITWORDS_DEBUG=1: Antworten setzen + prüfen
            if (process.env.WAITWORDS_DEBUG === '1' && popupWin && !popupWin.isDestroyed()) {
              popupWin.webContents.send('debug-fill', body.answers || []);
            }
            break;
          case '/debug/finish': // nur mit WAITWORDS_DEBUG=1: Fertig + schließen
            if (process.env.WAITWORDS_DEBUG === '1' && popupWin && !popupWin.isDestroyed()) {
              popupWin.webContents.send('debug-finish');
            }
            break;
          default:
            res.writeHead(404); res.end(); return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });
  server.listen(config.port, '127.0.0.1');
  server.on('error', (e) => console.error('HTTP-Server-Fehler:', e.message));
}

// ---------------------------------------------------------------- Tray

function makeTrayIcon() {
  const iconPath = path.join(APP_DIR, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createEmpty();
}

function updateTrayTooltip() {
  if (!tray) return;
  tray.setToolTip(`WaitWords — ${usedToday()}/${POPUPS_PER_DECK_PER_DAY} today (${meta.title})`);
}

// Deck-Titel für Submenü (Dateiname als Fallback bei kaputtem/fehlendem Deck)
function deckTitle(p) {
  try {
    const d = readJson(path.resolve(APP_DIR, p));
    return (d.meta && d.meta.title) || path.basename(p);
  } catch {
    return `${path.basename(p)} (unreadable)`;
  }
}

function switchDeck(index) {
  usage.activeDeckIndex = index;
  saveUsage();
  if (popupWin && !popupWin.isDestroyed()) popupWin.close(); // altes Quiz gehört zum alten Deck
  const err = loadDeck();
  if (err) {
    dialog.showErrorBox('WaitWords — deck error', err);
    usage.activeDeckIndex = 0;
    saveUsage();
    loadDeck();
  }
  loadProgress();
  buildTrayMenu();
  updateTrayTooltip();
}

function buildTrayMenu() {
  const list = deckList();
  const deckItems = list.map((p, i) => ({
    label: deckTitle(p) + (i >= MAX_DECKS ? ' (free limit)' : ''),
    type: 'radio',
    checked: i === (usage.activeDeckIndex || 0),
    enabled: i < MAX_DECKS,
    click: () => switchDeck(i),
  }));
  const menu = Menu.buildFromTemplate([
    { label: 'Show popup now', click: () => showPopup(true) },
    { label: 'Statistics', click: () => showStats() },
    ...(list.length > 1 ? [{ label: 'Switch deck', submenu: deckItems }] : []),
    {
      label: 'Pause 1 hour',
      click: () => { pausedUntil = Date.now() + 60 * 60 * 1000; },
    },
    { type: 'separator' },
    { label: 'Support this project ♥', click: () => shell.openExternal(SUPPORT_URL) },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function setupTray() {
  tray = new Tray(makeTrayIcon());
  buildTrayMenu();
  updateTrayTooltip();
  tray.on('double-click', () => showStats());
}

// ---------------------------------------------------------------- App-Lifecycle

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadUsage(); // vor loadDeck — activeDeckIndex steht in usage.json
    const deckError = loadDeck();
    if (deckError) {
      dialog.showErrorBox('WaitWords — deck error', deckError);
      app.quit();
      return;
    }
    loadProgress();
    startServer();
    setupTray();

    if (config.hotkey) {
      const ok = globalShortcut.register(config.hotkey, () => showPopup(true));
      if (!ok) console.error('Hotkey nicht registrierbar:', config.hotkey);
    }

    if (config.autostart) {
      // Nicht gepackte Electron-App: execPath = electron.exe, App-Pfad als Argument
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: [APP_DIR],
      });
    }
  });

  // Tray-App: kein Quit wenn alle Fenster zu
  app.on('window-all-closed', () => {});

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
