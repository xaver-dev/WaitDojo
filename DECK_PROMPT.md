# Create Your Own Deck

WaitDojo quizzes you on whatever is in `data/deck.json`. To build a deck for **your** topic (physics, Spanish vocabulary, history dates, medical terms, …), paste the prompt below into any AI chatbot (Claude, ChatGPT, Gemini, …), fill in the placeholders, and save the JSON it returns.

## How to use

1. Copy the prompt template below.
2. Replace `{TOPIC}`, `{NUMBER}`, `{ANSWER LANGUAGE}`, and `{DIFFICULTY}`.
3. Paste it into your favorite AI chatbot.
4. Save the JSON response as `data/deck.json` in the WaitDojo folder (replace the example deck, or save under a different name and add it to the `decks` list in `config.json`).
5. Restart WaitDojo. If the file has a problem, the app shows an error dialog telling you what to fix. With multiple decks, switch via tray menu → "Switch deck".

Your learning progress is stored separately per deck (keyed by `meta.id`), so switching decks never loses progress.

## Prompt template

```
Create a quiz deck as a single JSON object for a flashcard app. Output ONLY the raw JSON, no markdown fences, no explanations.

Topic: {TOPIC}
Number of cards: {NUMBER}
Answer language: {ANSWER LANGUAGE}
Difficulty: {DIFFICULTY}   (e.g. "beginner", "high school", "university")

JSON schema:
{
  "meta": {
    "id": "<short-kebab-case-slug-for-this-deck>",
    "title": "<short friendly popup headline for this topic>",
    "instruction": "<one short line telling the user what to do>",
    "placeholder": "<placeholder text for the answer input>",
    "wordsPerPopup": "<ONLY for concept-style decks with lesson cards: the number 3 — omit entirely for fact-style decks>"
  },
  "cards": [
    {
      "id": "<unique short id>",
      "front": "<the question or term shown to the user — keep it SHORT, it must fit on one line>",
      "answers": ["<primary answer>", "<accepted synonym>", "<accepted abbreviation>"],
      "hint": "<optional short disambiguation hint in parentheses, omit if not needed>",
      "lesson": "<optional: 2-4 sentence mini-lesson with one concrete example — only for concept-style decks, omit for fact-style>",
      "extra": "<optional bonus shown next to the solution — a character, formula or short fact; omit if not needed>",
      "level": 1
    }
  ]
}

Rules:
- "front" is what the user sees; "answers" is every string that counts as correct. Include common synonyms, abbreviations, and spelling variants — the app compares case-insensitively and ignores leading articles (der/die/das/ein/eine/the/a/an).
- Answers should be 1–4 words. Never full sentences — the user types them into a small input field.
- Add "hint" only when the front alone is ambiguous.
- Add "extra" only when there is a natural bonus to reveal with the solution (the Chinese character for a Pinyin card, the formula behind a physics answer). It is shown after checking, never before.
- Decide the deck style from the topic. Fact-style topics (capitals, vocabulary, dates, units): plain Q&A cards without "lesson", about {NUMBER} cards. Concept-style topics (how something works, methods, study findings, learning a skill): lesson cards — each card carries a "lesson" of 2–4 sentences with ONE concrete example, and a "front" question that tests exactly that lesson; make about half of {NUMBER} cards and set meta.wordsPerPopup to 3.

Want a specific style instead of letting the chatbot decide? Replace that rule with either "Make plain Q&A cards only, no lesson fields" or "Every card carries a lesson" — the in-app wizard offers the same choice as a dropdown.
- "level": 1 for easier cards, 2 for harder ones. Mix both.
- All ids must be unique.
- Write meta.title, meta.instruction and meta.placeholder in {ANSWER LANGUAGE}.
- Do not use trick questions. Every card must have a clearly correct short answer.
```

## Example (3 physics cards)

```json
{
  "meta": {
    "id": "physics-basics",
    "title": "Physics — quick break?",
    "instruction": "Type the answer, Enter = next field",
    "placeholder": "answer …"
  },
  "cards": [
    { "id": "unit-force", "front": "SI unit of force?", "answers": ["Newton", "N"], "level": 1 },
    { "id": "speed-light", "front": "Speed of light in vacuum (km/s)?", "answers": ["300000", "300,000", "299792"], "hint": "(rounded)", "level": 1 },
    { "id": "second-law", "front": "Newton's second law (formula)?", "answers": ["F = ma", "F=ma", "F = m*a"], "level": 2 }
  ]
}
```

## Example lesson card (concept-style deck)

For concept topics ("learn ML basics", "findings of study X") the cards teach first, then ask — and `meta.wordsPerPopup` is set to 3 so popups stay readable:

```json
{
  "id": "learning-rate",
  "lesson": "Gradient descent tunes model weights step by step, and the learning rate controls the step size. Example: with lr=0.01 training converges slowly but safely; with lr=10 each step overshoots the minimum.",
  "front": "What does a too-high learning rate cause?",
  "answers": ["overshooting", "divergence", "overshoot"],
  "level": 2
}
```

## Optional: translate the button labels

The quiz buttons default to English (`Check`, `Done`, `Solution`, …). To localize them, add a `ui` object to `meta`:

```json
"ui": {
  "check": "Prüfen",
  "done": "Fertig",
  "solution": "Lösung",
  "wasRight": "war doch richtig ✓",
  "correct": "richtig",
  "allSkipped": "alles übersprungen"
}
```
