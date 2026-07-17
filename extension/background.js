// WaitDojo Companion — Service Worker.
// Nur hier darf der localhost-Fetch passieren: Seitenkontext-Fetches von https
// auf http://127.0.0.1 blockiert Chrome (deshalb die host_permissions).

const BASE = 'http://127.0.0.1:4823';

// ChatGPT-Antworten sind meist kürzer als Claude-Code-Tool-Läufe — niedrigere Schwelle
const THRESHOLD_SECONDS = 30;

async function ping(path, body) {
  try {
    await fetch(BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // WaitDojo läuft nicht — still bleiben, nichts blockieren
  }
}

// tabId -> sessionId, damit geschlossene Tabs ihre Zähler aufräumen
const sessions = new Map();

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !msg || !msg.type) return;
  const sessionId = 'chatgpt-tab-' + tabId;

  if (msg.type === 'start') {
    sessions.set(tabId, sessionId);
    ping('/start', { sessionId, thresholdSeconds: THRESHOLD_SECONDS });
  } else if (msg.type === 'stop') {
    ping('/stop', { sessionId });
  } else if (msg.type === 'reset') {
    ping('/reset', { sessionId });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessions.has(tabId)) {
    ping('/reset', { sessionId: sessions.get(tabId) });
    sessions.delete(tabId);
  }
});
