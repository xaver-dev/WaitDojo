const { ipcRenderer } = require('electron');

const $ = (id) => document.getElementById(id);

// ---- Tabs
function activateTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + name));
}
$('tabDecks').addEventListener('click', () => activateTab('decks'));
$('tabSettings').addEventListener('click', () => activateTab('settings'));

const themeNames = {
  default: 'Default (gold)',
  chinese: 'Chinese (red & gold frame)',
  nature: 'Nature (green)',
  medical: 'Medical (blue)',
  minimal: 'Minimal (grey)',
};
const presetAccents = {
  default: '#f0c674',
  chinese: '#e0b64a',
  nature: '#8fbf6f',
  medical: '#6fb7d6',
  minimal: '#cfd3da',
};

let data = null;
let editIndex = null; // welches Deck gerade das Edit-Formular offen hat

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

function setMsg(el, text, cls) {
  el.textContent = text || '';
  el.className = 'msg' + (cls ? ' ' + cls : '');
}

// ---- Decks pane
function renderDecks() {
  const listEl = $('deckList');
  listEl.innerHTML = '';
  data.decks.forEach((d) => {
    const div = document.createElement('div');
    div.className = 'deck' + (d.locked ? ' locked' : '');
    const badges =
      (d.active ? '<span class="badge active">active</span>' : '') +
      (d.locked ? '<span class="badge locked">free limit</span>' : '');
    const used = data.limits.popupsPerDay
      ? `${d.usedToday}/${data.limits.popupsPerDay} today`
      : `${d.usedToday} today`;
    const sub = d.ok
      ? `${d.cards} cards · ${used} · ${themeNames[d.theme] || d.theme}`
      : 'unreadable deck file';
    div.innerHTML = `
      <div class="deck-head">
        <div>
          <span class="deck-title">${esc(d.title)}</span>${badges}
          <div class="deck-sub">${esc(sub)}</div>
        </div>
        <div class="deck-actions">
          ${d.active || d.locked ? '' : `<button data-act="use">Use</button>`}
          <button data-act="edit">Edit</button>
          <button data-act="delete" class="danger" title="Move to data/.trash">Delete</button>
        </div>
      </div>
      <div class="deck-edit" hidden></div>
    `;
    div.querySelectorAll('button[data-act]').forEach((b) => {
      b.addEventListener('click', () => onDeckAction(b.dataset.act, d.index, div));
    });
    listEl.appendChild(div);
    if (editIndex === d.index) openEdit(d, div);
  });

  const note = $('deckLimitNote');
  if (data.limits.maxDecks > 0 && data.decks.length >= data.limits.maxDecks) {
    note.hidden = false;
    note.textContent = `Free version: up to ${data.limits.maxDecks} active decks. Decks beyond that are greyed out — delete one to make room.`;
  } else {
    note.hidden = true;
  }
}

async function onDeckAction(act, index, div) {
  setMsg($('deckMsg'), '');
  if (act === 'use') {
    const r = await ipcRenderer.invoke('menu-switch-deck', index);
    if (r && r.ok) refresh();
    else setMsg($('deckMsg'), 'Could not switch deck.', 'err');
  } else if (act === 'delete') {
    const r = await ipcRenderer.invoke('delete-deck', index);
    if (r && r.ok) { editIndex = null; refresh(); }
    else if (r && r.error) setMsg($('deckMsg'), r.error, 'err');
  } else if (act === 'edit') {
    const editEl = div.querySelector('.deck-edit');
    if (!editEl.hidden) { editEl.hidden = true; editEl.innerHTML = ''; editIndex = null; return; }
    editIndex = index;
    openEdit(data.decks.find((d) => d.index === index), div);
  }
}

function openEdit(d, div) {
  // nur ein Edit-Formular gleichzeitig offen
  document.querySelectorAll('.deck-edit').forEach((e) => { e.hidden = true; e.innerHTML = ''; });
  const editEl = div.querySelector('.deck-edit');
  editEl.hidden = false;
  const themeOpts = Object.entries(themeNames)
    .map(([v, n]) => `<option value="${v}"${v === d.theme ? ' selected' : ''}>${n}</option>`)
    .join('');
  editEl.innerHTML = `
    <label>Popup headline</label>
    <input type="text" class="e-title" spellcheck="false" autocomplete="off" value="${esc(d.title)}">
    <div class="rowflex">
      <div>
        <label>Design preset</label>
        <select class="e-theme">${themeOpts}</select>
      </div>
      <div class="shrink">
        <label>Accent</label>
        <input type="color" class="e-accent" value="${d.accent || presetAccents[d.theme] || '#f0c674'}">
      </div>
    </div>
    <div class="btns">
      <button class="primary e-save">Save</button>
      <button class="ghost danger e-reset">Reset progress</button>
    </div>
  `;
  editEl.querySelector('.e-theme').addEventListener('change', (ev) => {
    editEl.querySelector('.e-accent').value = presetAccents[ev.target.value] || presetAccents.default;
  });
  editEl.querySelector('.e-save').addEventListener('click', async () => {
    const r = await ipcRenderer.invoke('update-deck', {
      index: d.index,
      title: editEl.querySelector('.e-title').value,
      theme: editEl.querySelector('.e-theme').value,
      accent: editEl.querySelector('.e-accent').value,
    });
    if (r && r.ok) { editIndex = null; refresh(); setMsg($('deckMsg'), 'Deck saved.', 'ok'); }
    else setMsg($('deckMsg'), (r && r.error) || 'Could not save deck.', 'err');
  });
  editEl.querySelector('.e-reset').addEventListener('click', async () => {
    const r = await ipcRenderer.invoke('reset-progress', d.index);
    if (r && r.ok) setMsg($('deckMsg'), 'Progress reset — all cards are "new" again.', 'ok');
    else if (r && r.error) setMsg($('deckMsg'), r.error, 'err');
  });
}

$('newDeckBtn').addEventListener('click', () => ipcRenderer.send('open-onboarding'));
$('folderBtn').addEventListener('click', () => ipcRenderer.send('open-decks-folder'));

// ---- Settings pane
function renderSettings() {
  const s = data.settings;
  // cooldown: auf vorhandene Option mappen, sonst Option dynamisch ergänzen
  const sel = $('setCooldown');
  if (![...sel.options].some((o) => Number(o.value) === s.cooldownMinutes)) {
    const o = document.createElement('option');
    o.value = s.cooldownMinutes;
    o.textContent = `every ${s.cooldownMinutes} minutes at most`;
    sel.appendChild(o);
  }
  sel.value = String(s.cooldownMinutes);
  $('setThreshold').value = s.thresholdSeconds;
  $('setWords').value = s.wordsPerPopup;
  $('setHotkey').value = s.hotkey;
  $('setPosition').value = s.popupPosition;
  $('setSize').value = s.popupSize;
  $('setAutostart').checked = data.autostart;

  // 0 = unbegrenzt; wenn beide Limits offen sind, gibt es nichts anzumerken
  const note = $('setLimitNote');
  const parts = [];
  if (data.limits.popupsPerDay) parts.push(`${data.limits.popupsPerDay} quiz popups per deck per day`);
  if (data.limits.maxDecks) parts.push(`${data.limits.maxDecks} active decks`);
  note.hidden = parts.length === 0;
  note.textContent = parts.length ? `Free version: ${parts.join(', ')}.` : '';
}

$('saveBtn').addEventListener('click', async () => {
  const r = await ipcRenderer.invoke('save-settings', {
    cooldownMinutes: Number($('setCooldown').value),
    thresholdSeconds: Number($('setThreshold').value),
    wordsPerPopup: Number($('setWords').value),
    hotkey: $('setHotkey').value,
    popupPosition: $('setPosition').value,
    popupSize: $('setSize').value,
    autostart: $('setAutostart').checked,
  });
  if (r && r.hotkeyError) setMsg($('setMsg'), r.hotkeyError, 'err');
  else if (r && r.ok) setMsg($('setMsg'), 'Settings saved.', 'ok');
  else setMsg($('setMsg'), 'Could not save settings.', 'err');
  refresh(false); // Werte neu laden (geclampte Zahlen, behaltener Hotkey)
});

$('shortcutBtn').addEventListener('click', async () => {
  const r = await ipcRenderer.invoke('create-shortcut');
  if (r && r.ok) setMsg($('setMsg'), 'Desktop shortcut created.', 'ok');
  else setMsg($('setMsg'), 'Shortcut failed: ' + ((r && r.error) || 'unknown'), 'err');
});

// ---- Footer
$('statsLink').addEventListener('click', () => ipcRenderer.send('open-stats'));
$('supportLink').addEventListener('click', () => ipcRenderer.send('open-support'));

// ---- Laden
async function refresh(clearMsgs = true) {
  data = await ipcRenderer.invoke('get-menu-data');
  renderDecks();
  renderSettings();
  if (clearMsgs) { setMsg($('deckMsg'), ''); setMsg($('setMsg'), ''); }
}

// Beim Fokuswechsel zurück ins Fenster neu laden (Decks können sich via Wizard geändert haben)
window.addEventListener('focus', () => refresh(false));

refresh();
