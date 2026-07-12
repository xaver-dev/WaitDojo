# WaitWords

Turn AI waiting time into learning time. WaitWords is a tiny Windows tray app: whenever a Claude Code tool call runs longer than 60 seconds, a small always-on-top popup appears in the corner with 5 quiz cards. Answer them while you wait, close it, get back to work.

Ships with a Chinese vocabulary deck (HSK 1–2, Pinyin → German), but works with **any topic** — physics, Spanish, history, anatomy. Generate your own deck in two minutes with any AI chatbot: see [DECK_PROMPT.md](DECK_PROMPT.md).

The app remembers, per card, what you get right, what you struggle with, and what you haven't seen yet — and picks accordingly: each popup mixes problem cards, new cards, and the occasional review of a card you know.

## Install

Requires [Node.js](https://nodejs.org) (18+).

```
git clone https://github.com/YOUR_USERNAME/WaitWords.git
cd WaitWords
npm install
npm start
```

The app lives in the system tray (look for the gold **W**). It registers itself to start with Windows (disable with `"autostart": false` in `config.json`).

### Hook up Claude Code (automatic popups)

```
npm run install-hooks
```

This adds three hooks to `~/.claude/settings.json` (backup written to `settings.json.bak`; `npm run uninstall-hooks` removes them). Hooks take effect in **new** Claude Code sessions. From then on: any tool call (build, long search, subagent, …) that runs 60+ seconds triggers the popup.

The hook script is fail-safe: if WaitWords isn't running it exits silently in ~150 ms and never blocks Claude Code.

### Everything else: hotkey

ChatGPT, Claude Desktop chat, Copilot and friends expose no "I'm busy" events. For those, press **`Ctrl+Alt+L`** whenever you find yourself waiting — popup appears instantly.

## Using the popup

- Type your answer, **Enter** jumps to the next field, last Enter checks everything.
- Wrong rows show the accepted solutions. Got marked wrong unfairly? Click **"I was right ✓"**.
- **Esc** or ✕ closes. Unanswered cards count as *skipped*, never as wrong.
- Popup never steals focus from your editor; max one popup per 5 minutes (tray menu has "Pause 1 hour").
- Tray menu → **Statistics** shows every card with its status: `new` / `learning` / `problem` / `good`.

## Make it about YOUR topic

1. Open [DECK_PROMPT.md](DECK_PROMPT.md), copy the prompt template.
2. Fill in topic, card count, answer language, difficulty. Paste into Claude/ChatGPT/etc.
3. Save the returned JSON as `data/deck.json` (or another file — set `deckPath` in `config.json`).
4. Restart WaitWords.

Invalid deck files produce a clear error dialog on startup instead of a crash. Learning progress is stored per deck (`%APPDATA%\waitwords\progress-<deck-id>.json`), so switching decks keeps every deck's progress.

### Deck format

```json
{
  "meta": {
    "id": "physics-basics",
    "title": "Physics — quick break?",
    "instruction": "Type the answer, Enter = next field",
    "placeholder": "answer …"
  },
  "cards": [
    { "id": "unit-force", "front": "SI unit of force?", "answers": ["Newton", "N"], "hint": "", "level": 1 }
  ]
}
```

- `front` — what you see. `answers` — every accepted answer (case-insensitive, leading articles der/die/das/ein/eine/the/a/an ignored).
- `hint` — optional disambiguation shown in grey. `level` — 1 or 2, shown in statistics.
- `meta.ui` — optional button-label translations, see [DECK_PROMPT.md](DECK_PROMPT.md).

## Configuration (`config.json`)

| Field | Default | Meaning |
|---|---|---|
| `port` | 4823 | Local HTTP port (also change in `hook/notify.js` if you edit this) |
| `thresholdSeconds` | 60 | How long a tool must run before the popup fires |
| `cooldownMinutes` | 5 | Minimum gap between popups |
| `hotkey` | Ctrl+Alt+L | Global hotkey for instant popup |
| `wordsPerPopup` | 5 | Cards per popup |
| `autostart` | true | Start with Windows |
| `deckPath` | data/deck.json | Active deck file |

## How detection works

Claude Code hooks ping `http://127.0.0.1:4823`:

- `PreToolUse` → `POST /start` (per-session counter up, 60 s timer starts)
- `PostToolUse` → `POST /stop` (counter down, timer cancelled at 0)
- `Stop` (turn end) → `POST /reset` (safety net)

A tool running 60 s without its stop event → popup. That's the whole trick.

## Debug endpoints

Only active when started with env `WAITWORDS_DEBUG=1`: `GET /debug/quiz`, `POST /debug/fill {"answers":[…]}`, `POST /debug/finish`, `POST /shot {"path":"out.png"}` (popup screenshot). Off in normal operation.

## Ideas / not built yet

- Browser extension (MV3) for chatgpt.com / Codex: content script watches the stop button, pings `/start` + `/stop` (server-side CORS is already open).
- Character mode for the Chinese deck (`extra` field already stores hanzi).
- Real spaced-repetition intervals.

## License

MIT
