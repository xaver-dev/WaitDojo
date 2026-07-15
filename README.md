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

On the **first start** a short setup wizard opens: either keep the bundled Chinese deck, or describe your own topic (e.g. "Physics, beginner"). For a custom topic the wizard builds a ready-to-paste prompt, you drop it into any AI chatbot, paste the JSON answer back, and your deck is created — no API key, nothing to configure. Its last step asks whether to **start with Windows** and/or add a **desktop shortcut**. You can reopen the wizard any time via tray → **New deck / setup…**.

The app lives in the system tray (look for the gold **W**). Prefer to start it yourself? Uncheck autostart in the wizard and use the desktop shortcut (or `npm start`).

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
- The footer shows today's count (`3/5`) and a pill per deck — click another deck's pill to switch topic on the spot.
- Tray menu → **Statistics** shows every card with its status: `new` / `learning` / `problem` / `good`.

## Free limits

WaitWords is free and open source. To keep the door open for an optional premium version later (if this project takes off), the free version has two limits from day one — no surprises down the road:

- **5 quiz popups per deck per day** (counter resets at midnight)
- **2 active decks** (additional configured decks appear greyed out)

With two decks that's up to 10 popups (~50 cards) a day — plenty for serious learning, and you can spread it across two topics. The tray tooltip always shows today's count for the active deck.

## Support

This project is free. If it helps you and you want to support development, you can contribute voluntarily via the "Support this project ♥" link in the tray menu. Supporting is a pure donation — every user gets the identical software either way.

## Make it about YOUR topic

1. Open [DECK_PROMPT.md](DECK_PROMPT.md), copy the prompt template.
2. Fill in topic, card count, answer language, difficulty. Paste into Claude/ChatGPT/etc.
3. Save the returned JSON as `data/deck.json` — or as a new file added to the `decks` list in `config.json`.
4. Restart WaitWords. With multiple decks, switch via tray menu → "Switch deck".

Switch or remove decks from the tray: **Switch deck** and **Delete deck**. Deleting asks for confirmation and moves the deck file to `data/.trash/` (recoverable) rather than erasing it. The free version keeps up to 2 active decks — delete one to make room for another.

Invalid deck files produce a clear error dialog on startup instead of a crash. Learning progress is stored per deck (`%APPDATA%\waitwords\progress-<deck-id>.json`), so switching decks keeps every deck's progress.

### Deck format

```json
{
  "meta": {
    "id": "physics-basics",
    "title": "Physics — quick break?",
    "instruction": "Type the answer, Enter = next field",
    "placeholder": "answer …",
    "theme": "medical",
    "accent": "#6fb7d6"
  },
  "cards": [
    { "id": "unit-force", "front": "SI unit of force?", "answers": ["Newton", "N"], "hint": "", "level": 1 }
  ]
}
```

- `front` — what you see. `answers` — every accepted answer (case-insensitive, leading articles der/die/das/ein/eine/the/a/an ignored).
- `hint` — optional disambiguation shown in grey. `level` — 1 or 2, shown in statistics.
- `meta.theme` — optional popup style preset: `default`, `chinese` (red & gold frame), `nature`, `medical`, `minimal`.
- `meta.accent` — optional hex color overriding the preset's accent.
- `meta.ui` — optional button-label translations, see [DECK_PROMPT.md](DECK_PROMPT.md).

## Configuration (`config.json`)

Optional — the app runs on sensible defaults without it. To customize, copy `config.example.json` to `config.json` and edit. Your `config.json` and any decks you create (except the bundled `data/deck.json`) are gitignored, so they stay on your machine.

| Field | Default | Meaning |
|---|---|---|
| `port` | 4823 | Local HTTP port (also change in `hook/notify.js` if you edit this) |
| `thresholdSeconds` | 60 | How long a tool must run before the popup fires |
| `cooldownMinutes` | 5 | Minimum gap between popups |
| `hotkey` | Ctrl+Alt+L | Global hotkey for instant popup |
| `wordsPerPopup` | 5 | Cards per popup |
| `autostart` | true | Default for "start with Windows" until the wizard sets your choice |
| `decks` | ["data/deck.json"] | Deck files; first 2 selectable in the free version |

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
