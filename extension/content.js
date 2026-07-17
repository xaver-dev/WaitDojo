// WaitDojo Companion — Content Script (nur DOM-Beobachtung, keine Netzwerkzugriffe).
// Erkennung: ChatGPTs Stop-Button existiert nur, während eine Antwort generiert wird.
// Die Selektoren sind Stand Juli 2026 — ändert OpenAI das DOM, hier nachziehen.

const SELECTORS = [
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop streaming"]',
].join(', ');

let busy = false;
let debounce = null;

function check() {
  const nowBusy = !!document.querySelector(SELECTORS);
  if (nowBusy !== busy) {
    busy = nowBusy;
    try { chrome.runtime.sendMessage({ type: busy ? 'start' : 'stop' }); } catch {}
  }
}

// Frische Seite = nichts läuft; evtl. hängengebliebenen Zähler dieses Tabs aufräumen
try { chrome.runtime.sendMessage({ type: 'reset' }); } catch {}

const observer = new MutationObserver(() => {
  if (debounce) return;
  debounce = setTimeout(() => { debounce = null; check(); }, 300);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
check();

// Reload/Navigation während einer Generierung: Zähler nicht hängen lassen
window.addEventListener('pagehide', () => {
  if (busy) { try { chrome.runtime.sendMessage({ type: 'reset' }); } catch {} }
});
