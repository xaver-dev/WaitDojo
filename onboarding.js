const { ipcRenderer, clipboard } = require('electron');

const steps = {
  1: document.getElementById('step1'),
  2: document.getElementById('step2'),
  3: document.getElementById('step3'),
  4: document.getElementById('step4'),
};

function show(n) {
  Object.values(steps).forEach((s) => s.classList.remove('active'));
  steps[n].classList.add('active');
}

const $ = (id) => document.getElementById(id);

// ---- Step 1
$('createBtn').addEventListener('click', () => show(2));

// Kurzbeschreibung je Beispiel-Deck; unbekannte Decks laufen ohne Untertitel
const sampleSubs = {
  'data/deck.json': 'Guess the capital — playable straight away, no prior knowledge needed',
  'data/deck-science.json': 'Physics, chemistry and biology fundamentals',
};

// Beispiel-Decks aus main laden und als Buttons anbieten
ipcRenderer.invoke('get-sample-decks').then((samples) => {
  const box = $('samples');
  (samples || []).forEach((s) => {
    const b = document.createElement('button');
    b.className = 'wide ghost';
    b.textContent = s.title; // main liefert schon den gekürzten Titel
    const sub = sampleSubs[s.path];
    if (sub) {
      const span = document.createElement('span');
      span.className = 'sub';
      span.textContent = sub;
      b.appendChild(span);
    }
    b.addEventListener('click', async () => {
      const r = await ipcRenderer.invoke('use-sample-deck', s.path);
      if (r && r.ok) show(4); // weiter zu den Startoptionen
      else {
        const m = $('msg1');
        m.className = 'err';
        m.textContent = (r && r.error) || 'Could not activate that deck.';
      }
    });
    box.appendChild(b);
  });
});

// ---- Step 2
$('back2').addEventListener('click', () => show(1));

// Farbfeld folgt dem Preset (Werte = --accent der Themes in popup.html); bleibt frei änderbar
const presetAccents = {
  default: '#f0c674',
  chinese: '#e0b64a',
  nature: '#8fbf6f',
  medical: '#6fb7d6',
  minimal: '#cfd3da',
};
$('theme').addEventListener('change', () => {
  $('accent').value = presetAccents[$('theme').value] || presetAccents.default;
});

function buildPrompt() {
  const topic = $('topic').value.trim() || 'general knowledge';
  const desc = $('desc').value.trim() || 'mixed difficulty';
  const lang = $('lang').value.trim() || 'German';
  const count = Math.max(5, Math.min(200, Number($('count').value) || 30));
  const title = $('title').value.trim() || `${topic} — quick break?`;

  return `Create a quiz deck as a single JSON object for a flashcard app. Output ONLY the raw JSON, no markdown fences, no explanations.

Topic: ${topic}
Learner description: ${desc}
Number of cards: ${count}
Answer language: ${lang}

JSON schema:
{
  "meta": {
    "id": "${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deck'}",
    "title": ${JSON.stringify(title)},
    "instruction": "Type the answer, Enter = next field",
    "placeholder": "answer …"
  },
  "cards": [
    {
      "id": "<unique short id>",
      "front": "<the question or term shown to the user — keep it SHORT, one line>",
      "answers": ["<primary answer>", "<accepted synonym or abbreviation>"],
      "hint": "<optional short hint in parentheses, omit if not needed>",
      "level": 1
    }
  ]
}

Rules:
- "front" is what the user sees; "answers" lists every string that counts as correct (synonyms, abbreviations, spelling variants). Comparison is case-insensitive and ignores leading articles (der/die/das/ein/eine/the/a/an).
- Answers must be 1–4 words, never full sentences.
- Add "hint" only when the front alone is ambiguous.
- Mix "level" 1 (easier) and 2 (harder).
- All ids must be unique.
- Match the learner description for difficulty and scope. Write meta text in ${lang}.
- No trick questions; every card has a clearly correct short answer.`;
}

$('buildBtn').addEventListener('click', () => {
  const prompt = buildPrompt();
  $('promptOut').textContent = prompt;
  clipboard.writeText(prompt);
  show(3);
});

// ---- Step 3
$('back3').addEventListener('click', () => show(2));
$('copyBtn').addEventListener('click', () => clipboard.writeText($('promptOut').textContent));

$('createDeckBtn').addEventListener('click', async () => {
  const msg = $('msg');
  const json = $('json').value.trim();
  if (!json) { msg.className = 'err'; msg.textContent = 'Paste the JSON answer first.'; return; }
  msg.className = ''; msg.textContent = 'Creating…';

  const r = await ipcRenderer.invoke('create-deck', {
    json,
    theme: $('theme').value,
    accent: $('accent').value,
    title: $('title').value.trim() || $('topic').value.trim(),
  });

  if (r && r.ok) {
    msg.className = 'ok';
    msg.textContent = `Deck "${r.title}" created with ${r.cards} cards.`;
    setTimeout(() => show(4), 700); // weiter zu den Startoptionen
  } else {
    msg.className = 'err';
    msg.textContent = 'Could not create the deck:\n' + ((r && r.error) || 'unknown error');
  }
});

// ---- Step 4: Startup options
// Desktop-Verknüpfung gibt es nur unter Windows
if (process.platform !== 'win32') {
  const label = $('optShortcut').closest('label');
  if (label) label.hidden = true;
  $('optShortcut').checked = false;
}

$('finishBtn').addEventListener('click', async () => {
  $('finishBtn').disabled = true;
  const res = await ipcRenderer.invoke('apply-startup', {
    autostart: $('optAutostart').checked,
    shortcut: $('optShortcut').checked,
    cooldownMinutes: Number($('optCooldown').value),
  });
  const m = $('msg4');
  if ($('optShortcut').checked && res && res.shortcut && !res.shortcut.ok) {
    m.textContent = 'Note: desktop shortcut could not be created (' + (res.shortcut.error || 'unknown') + '). Autostart is set.';
  }
  await ipcRenderer.invoke('finish-onboarding'); // schließt Fenster
});
