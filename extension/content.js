// WaitDojo Companion — Content Script (nur DOM-Beobachtung, keine Netzwerkzugriffe).
// Erkennung: ChatGPTs Stop-Button existiert nur, während eine Antwort generiert wird.
// Der Composer-Hauptbutton wechselt data-testid: "send-button" (idle) <-> "stop-button"
// (generiert). Stand Juli 2026 auf chatgpt.com verifiziert, sprachunabhängig — das
// aria-label ist lokalisiert ("Antwort stoppen"/"Stop streaming"), die testid nicht.

const SELECTOR = '[data-testid="stop-button"]';

let busy = false;
let debounce = null;

function check() {
  const nowBusy = !!document.querySelector(SELECTOR);
  if (nowBusy !== busy) {
    busy = nowBusy;
    try { chrome.runtime.sendMessage({ type: busy ? 'start' : 'stop' }); } catch {}
  }
}

// Frische Seite = nichts läuft; evtl. hängengebliebenen Zähler dieses Tabs aufräumen
try { chrome.runtime.sendMessage({ type: 'reset' }); } catch {}

// Attribute mitbeobachten: ChatGPT tauscht den Button am Ende teils nur per
// data-testid um, ohne den Knoten zu ersetzen — reines childList verpasst das
// und die Session bliebe offen.
const observer = new MutationObserver(() => {
  if (debounce) return;
  debounce = setTimeout(() => { debounce = null; check(); }, 300);
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-testid'],
});
check();

// Sicherheitsnetz: verpasst der Observer trotzdem einen Übergang, korrigiert der
// nächste Tick den Zustand — ohne ihn bliebe busy dauerhaft hängen.
setInterval(check, 3000);

// Reload/Navigation während einer Generierung: Zähler nicht hängen lassen
window.addEventListener('pagehide', () => {
  if (busy) { try { chrome.runtime.sendMessage({ type: 'reset' }); } catch {} }
});
