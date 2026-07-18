const { ipcRenderer } = require('electron');

const $ = (id) => document.getElementById(id);

// Deck-Index kommt als Query-Parameter (loadFile mit { query: { deck: i } })
const deckIndex = Number(new URLSearchParams(location.search).get('deck')) || 0;

let deck = null;      // { meta, cards } — Arbeitskopie, Save schreibt die ganze Datei
let view = [];        // Indizes in deck.cards, die zum Filter passen
let pos = 0;          // Position innerhalb von view
let dirty = false;
let msgTimer = null;

function setMsg(text, cls) {
  $('msg').textContent = text || '';
  $('msg').className = 'msg' + (cls ? ' ' + cls : '');
  clearTimeout(msgTimer);
  if (cls === 'ok') msgTimer = setTimeout(() => setMsg(''), 1500);
}

function slugify(s) {
  return String(s || 'card')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'card';
}

function uniqueId(base) {
  const ids = new Set(deck.cards.map((c) => c.id));
  let id = base, n = 2;
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}

// ---- Filter / Ansicht

function applyFilter() {
  const q = $('filter').value.trim().toLowerCase();
  view = deck.cards
    .map((_, i) => i)
    .filter((i) => {
      if (!q) return true;
      const c = deck.cards[i];
      return (c.front || '').toLowerCase().includes(q) ||
        (c.answers || []).some((a) => String(a).toLowerCase().includes(q));
    });
  pos = 0;
  render();
}

function currentCard() {
  return view.length ? deck.cards[view[pos]] : null;
}

function render() {
  const c = currentCard();
  $('editor').hidden = !c;
  $('empty').hidden = !!c;
  $('deckTitle').textContent = deck.meta.title || 'Card library';
  $('deckSub').textContent = `${deck.cards.length} cards`;
  $('jump').value = view.length ? String(pos + 1) : '0';
  $('total').textContent = `/ ${view.length}`;
  $('prevBtn').disabled = pos <= 0;
  $('nextBtn').disabled = pos >= view.length - 1;
  if (!c) return;
  $('f-front').value = c.front || '';
  $('f-answers').value = (c.answers || []).join('\n');
  $('f-hint').value = c.hint || '';
  $('f-level').value = String(c.level === 2 ? 2 : 1);
  $('f-lesson').value = c.lesson || '';
  $('f-extra').value = c.extra || '';
  dirty = false;
}

// ---- Speichern

function collectInto(c) {
  c.front = $('f-front').value.trim();
  c.answers = $('f-answers').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const hint = $('f-hint').value.trim();
  const lesson = $('f-lesson').value.trim();
  const extra = $('f-extra').value.trim();
  if (hint) c.hint = hint; else delete c.hint;
  if (lesson) c.lesson = lesson; else delete c.lesson;
  if (extra) c.extra = extra; else delete c.extra;
  c.level = Number($('f-level').value) === 2 ? 2 : 1;
}

async function saveCard() {
  const c = currentCard();
  if (!c) return true;
  collectInto(c);
  if (!c.front) { setMsg('The question (front) must not be empty.', 'err'); return false; }
  if (c.answers.length === 0) { setMsg('At least one accepted answer is required.', 'err'); return false; }
  const r = await ipcRenderer.invoke('save-deck-file', { index: deckIndex, deck });
  if (r && r.ok) { setMsg('Saved.', 'ok'); dirty = false; return true; }
  setMsg((r && r.error) || 'Could not save the deck.', 'err');
  return false;
}

// Beim Blättern ungespeicherte Änderungen mitnehmen (Auto-Save wie im Menü)
async function goTo(newPos) {
  if (dirty && !(await saveCard())) return; // Validierungsfehler blockiert Blättern
  pos = Math.max(0, Math.min(newPos, view.length - 1));
  render();
}

// ---- Aktionen

$('saveBtn').addEventListener('click', saveCard);

$('addBtn').addEventListener('click', async () => {
  if (dirty && !(await saveCard())) return;
  const c = { id: uniqueId('new-card'), front: '', answers: [], level: 1 };
  const at = view.length ? view[pos] + 1 : deck.cards.length;
  deck.cards.splice(at, 0, c);
  $('filter').value = ''; // neue Karte darf nicht am Filter vorbeirutschen
  applyFilter();
  pos = view.indexOf(at);
  render();
  setMsg('New card — fill it in and save.', 'ok');
  $('f-front').focus();
});

$('delBtn').addEventListener('click', async () => {
  const c = currentCard();
  if (!c) return;
  if (deck.cards.length <= 1) { setMsg('A deck needs at least one card.', 'err'); return; }
  if (!confirm(`Delete this card?\n\n"${c.front || '(empty)'}"`)) return;
  deck.cards.splice(view[pos], 1);
  const r = await ipcRenderer.invoke('save-deck-file', { index: deckIndex, deck });
  if (r && r.ok) {
    applyFilter();
    pos = Math.min(pos, Math.max(0, view.length - 1));
    render();
    setMsg('Card deleted.', 'ok');
  } else {
    setMsg((r && r.error) || 'Could not save the deck.', 'err');
  }
});

$('prevBtn').addEventListener('click', () => goTo(pos - 1));
$('nextBtn').addEventListener('click', () => goTo(pos + 1));

$('jump').addEventListener('change', () => {
  const n = Number($('jump').value);
  if (Number.isInteger(n) && n >= 1 && n <= view.length) goTo(n - 1);
  else $('jump').value = String(pos + 1);
});

$('filter').addEventListener('input', () => applyFilter());

['f-front', 'f-answers', 'f-hint', 'f-level', 'f-lesson', 'f-extra'].forEach((id) => {
  $(id).addEventListener('input', () => { dirty = true; });
  $(id).addEventListener('change', () => { dirty = true; });
});

// Alt+Pfeile blättern auch aus Eingabefeldern heraus
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goTo(pos - 1); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goTo(pos + 1); }
});

// ---- Laden

ipcRenderer.invoke('get-deck-file', deckIndex).then((r) => {
  if (!r || !r.ok) {
    document.body.innerHTML = `<p style="color:#ff9caa">${(r && r.error) || 'Could not load deck.'}</p>`;
    return;
  }
  deck = r.deck;
  applyFilter();
});
