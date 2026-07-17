#!/usr/bin/env node
// Claude-Code-Hook: liest Hook-JSON von stdin, pingt WaitDojo auf localhost.
// Muss IMMER schnell und leise enden — darf Claude Code nie blockieren.
// Aufruf: node notify.js start|stop|reset

const http = require('http');

const mode = process.argv[2] || 'start';
const PORT = 4823;

// Harte Obergrenze: nach 1,5 s ist Schluss, egal was passiert.
setTimeout(() => process.exit(0), 1500);

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  let sessionId = 'unknown';
  try {
    sessionId = JSON.parse(raw).session_id || 'unknown';
  } catch {}

  const body = JSON.stringify({ source: 'claude-code', sessionId });
  const req = http.request({
    host: '127.0.0.1',
    port: PORT,
    path: '/' + mode,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    timeout: 800,
  }, (res) => {
    res.resume();
    res.on('end', () => process.exit(0));
  });
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
});
