const { ipcRenderer, clipboard } = require('electron');

const steps = {
  1: document.getElementById('step1'),
  2: document.getElementById('step2'),
  3: document.getElementById('step3'),
};

function show(n) {
  Object.values(steps).forEach((s) => s.classList.remove('active'));
  steps[n].classList.add('active');
}

const $ = (id) => document.getElementById(id);

// ---- Step 1
$('bundledBtn').addEventListener('click', async () => {
  await ipcRenderer.invoke('finish-onboarding'); // schließt Fenster in main
});
$('createBtn').addEventListener('click', () => show(2));

// ---- Step 2
$('back2').addEventListener('click', () => show(1));

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
    msg.textContent = `Deck "${r.title}" created with ${r.cards} cards. You're all set — this window will close.`;
    setTimeout(() => ipcRenderer.invoke('finish-onboarding'), 1600);
  } else {
    msg.className = 'err';
    msg.textContent = 'Could not create the deck:\n' + ((r && r.error) || 'unknown error');
  }
});
