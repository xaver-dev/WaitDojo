const { ipcRenderer } = require('electron');

let meta = {};
let quiz = [];      // [{ id, front, answers, hint?, level?, status }]
let results = [];   // [{ id, result: 'correct'|'wrong'|'skipped' }]
let checked = false;
let submitted = false;

const rowsEl = document.getElementById('rows');
const mainBtn = document.getElementById('mainBtn');
const summaryEl = document.getElementById('summary');

// "das Buch" zählt für answers:["Buch"], "the atom" für ["atom"]: Artikel vorn abschneiden
function normalize(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(der|die|das|ein|eine|the|a|an) /, '');
}

function isCorrect(input, accepted) {
  const n = normalize(input);
  if (!n) return false;
  return accepted.some((a) => normalize(a) === n);
}

async function init() {
  const payload = await ipcRenderer.invoke('get-quiz-words');
  meta = payload.meta;
  quiz = payload.words;

  document.getElementById('title').textContent = meta.title;
  document.getElementById('instruction').textContent = meta.instruction;
  mainBtn.textContent = meta.ui.check;

  rowsEl.innerHTML = '';
  quiz.forEach((w, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="top">
        <span class="front">${w.front}${w.hint ? ` <span class="hint">${w.hint}</span>` : ''}</span>
        <span class="badge ${w.status}">${w.status}</span>
      </div>
      <input type="text" data-i="${i}" placeholder="${meta.placeholder}" autocomplete="off" spellcheck="false">
      <div class="solution" hidden></div>
    `;
    rowsEl.appendChild(row);
  });

  rowsEl.querySelectorAll('input').forEach((inp, i) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const next = rowsEl.querySelector(`input[data-i="${i + 1}"]`);
        if (next) next.focus();
        else check();
      }
    });
  });

  const first = rowsEl.querySelector('input');
  if (first) first.focus();
}

function check() {
  if (checked) return;
  checked = true;
  results = [];

  quiz.forEach((w, i) => {
    const row = rowsEl.children[i];
    const inp = row.querySelector('input');
    const sol = row.querySelector('.solution');
    const val = inp.value;
    inp.readOnly = true;

    let result;
    if (!val.trim()) {
      result = 'skipped';
      row.classList.add('skipped');
      sol.innerHTML = `${meta.ui.solution}: <b>${w.answers[0]}</b>`;
      sol.hidden = false;
    } else if (isCorrect(val, w.answers)) {
      result = 'correct';
      row.classList.add('correct');
    } else {
      result = 'wrong';
      row.classList.add('wrong');
      sol.innerHTML = `${meta.ui.solution}: <b>${w.answers.join(' / ')}</b>
        <button class="override" data-i="${i}">${meta.ui.wasRight}</button>`;
      sol.hidden = false;
    }
    results.push({ id: w.id, result });
  });

  rowsEl.querySelectorAll('.override').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      results[i].result = 'correct';
      const row = rowsEl.children[i];
      row.classList.remove('wrong');
      row.classList.add('correct');
      btn.remove();
      updateSummary();
    });
  });

  updateSummary();
  mainBtn.textContent = meta.ui.done;
}

function updateSummary() {
  const correct = results.filter((r) => r.result === 'correct').length;
  const answered = results.filter((r) => r.result !== 'skipped').length;
  summaryEl.textContent = answered ? `${correct}/${answered} ${meta.ui.correct}` : meta.ui.allSkipped;
}

async function submitAndClose() {
  if (checked && !submitted) {
    submitted = true;
    await ipcRenderer.invoke('submit-results', results);
  }
  ipcRenderer.send('close-popup');
}

mainBtn.addEventListener('click', () => {
  if (!checked) check();
  else submitAndClose();
});

document.getElementById('closeBtn').addEventListener('click', submitAndClose);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') submitAndClose();
});

// Debug-Hooks (main sendet nur bei WAITWORDS_DEBUG=1)
ipcRenderer.on('debug-fill', (_e, answers) => {
  rowsEl.querySelectorAll('input').forEach((inp, i) => {
    if (answers[i] !== undefined) inp.value = answers[i];
  });
  check();
});
ipcRenderer.on('debug-finish', () => submitAndClose());

init();
