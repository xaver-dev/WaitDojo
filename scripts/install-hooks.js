#!/usr/bin/env node
// Installs (or removes) the WaitDojo hooks in ~/.claude/settings.json.
// Idempotent: running it twice never duplicates entries.
//   node scripts/install-hooks.js            -> install
//   node scripts/install-hooks.js --remove   -> uninstall

const fs = require('fs');
const os = require('os');
const path = require('path');

const REMOVE = process.argv.includes('--remove');
const NOTIFY = path.resolve(__dirname, '..', 'hook', 'notify.js');
const MARKER = 'notify.js'; // erkennt WaitDojo-Einträge unabhängig vom Installationspfad

const claudeDir = path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: ${settingsPath} exists but is not valid JSON — fix it first.\n${e.message}`);
    process.exit(1);
  }
} else if (!REMOVE) {
  fs.mkdirSync(claudeDir, { recursive: true });
}

settings.hooks = settings.hooks || {};

const cmd = (mode) => `node "${NOTIFY}" ${mode}`;

const wanted = {
  PreToolUse: { matcher: '*', hooks: [{ type: 'command', command: cmd('start') }] },
  PostToolUse: { matcher: '*', hooks: [{ type: 'command', command: cmd('stop') }] },
  Stop: { hooks: [{ type: 'command', command: cmd('reset') }] },
};

const isWaitDojoEntry = (entry) =>
  (entry.hooks || []).some((h) => typeof h.command === 'string' && h.command.toLowerCase().includes(MARKER));

let changed = false;

for (const event of Object.keys(wanted)) {
  const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
  const withoutOurs = list.filter((e) => !isWaitDojoEntry(e));
  const hadOurs = withoutOurs.length !== list.length;

  if (REMOVE) {
    if (hadOurs) {
      settings.hooks[event] = withoutOurs;
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
      changed = true;
      console.log(`removed: ${event}`);
    }
  } else {
    if (hadOurs) {
      const ours = list.filter(isWaitDojoEntry);
      if (ours.length === 1 && JSON.stringify(ours[0]) === JSON.stringify(wanted[event])) {
        continue; // schon exakt so installiert
      }
      // vorhandenen Eintrag ersetzen (Pfad könnte sich geändert haben)
      settings.hooks[event] = [...withoutOurs, wanted[event]];
      changed = true;
      console.log(`updated: ${event}`);
    } else {
      settings.hooks[event] = [...list, wanted[event]];
      changed = true;
      console.log(`added:   ${event}`);
    }
  }
}

if (REMOVE && Object.keys(settings.hooks).length === 0) delete settings.hooks;

if (!changed) {
  console.log('Nothing to do.');
  process.exit(0);
}

if (fs.existsSync(settingsPath)) {
  fs.copyFileSync(settingsPath, settingsPath + '.bak');
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`\n${REMOVE ? 'Uninstalled from' : 'Installed into'} ${settingsPath} (backup: settings.json.bak)`);
console.log('Hooks take effect in NEW Claude Code sessions.');
