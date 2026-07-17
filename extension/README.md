# WaitDojo Companion (Chrome extension) — experimental

Makes ChatGPT trigger WaitDojo popups automatically, like Claude Code does via hooks: while ChatGPT is generating a long answer (deep research, long thinking), a quiz popup appears after ~30 seconds.

## How it works

- `content.js` runs on chatgpt.com and only watches the DOM: ChatGPT's stop button exists exactly while an answer is generating.
- `background.js` (service worker) is the only part that talks to WaitDojo (`http://127.0.0.1:4823/start` / `/stop`). Page-context requests from https to localhost are blocked by Chrome — that's why the split exists.
- If WaitDojo isn't running, the extension stays silent and does nothing.

## Install (unpacked — not on the Web Store yet)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Make sure WaitDojo is running (gold W in the tray)

## Status: experimental

- The stop-button selectors match the chatgpt.com DOM as of July 2026. When OpenAI changes their markup, detection breaks until the selectors in `content.js` are updated — the extension then simply does nothing (it never breaks ChatGPT itself).
- Trigger threshold is 30 seconds (shorter than Claude Code's 60, because chat answers are shorter than tool runs). Change `THRESHOLD_SECONDS` in `background.js` if you want a different one.
- Closed tabs and page reloads clean up their counters automatically.
