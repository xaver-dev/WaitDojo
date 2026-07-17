#!/usr/bin/env node
// Installs (or removes) the WaitDojo hooks in ~/.claude/settings.json.
// Idempotent: running it twice never duplicates entries.
//   node scripts/install-hooks.js            -> install
//   node scripts/install-hooks.js --remove   -> uninstall
// Also used by the app itself (tray -> Claude Code hooks) via require().

const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKER = 'notify.js'; // erkennt WaitDojo-Einträge unabhängig vom Installationspfad

function installHooks({ remove = false, notifyPath } = {}) {
  const NOTIFY = notifyPath || path.resolve(__dirname, '..', 'hook', 'notify.js');
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const log = [];

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      return { ok: false, error: `${settingsPath} exists but is not valid JSON — fix it first.\n${e.message}` };
    }
  } else if (!remove) {
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

    if (remove) {
      if (hadOurs) {
        settings.hooks[event] = withoutOurs;
        if (settings.hooks[event].length === 0) delete settings.hooks[event];
        changed = true;
        log.push(`removed: ${event}`);
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
        log.push(`updated: ${event}`);
      } else {
        settings.hooks[event] = [...list, wanted[event]];
        changed = true;
        log.push(`added:   ${event}`);
      }
    }
  }

  if (remove && Object.keys(settings.hooks).length === 0) delete settings.hooks;

  if (changed) {
    if (fs.existsSync(settingsPath)) {
      fs.copyFileSync(settingsPath, settingsPath + '.bak');
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  return { ok: true, changed, log, settingsPath };
}

if (require.main === module) {
  const r = installHooks({ remove: process.argv.includes('--remove') });
  if (!r.ok) {
    console.error('ERROR: ' + r.error);
    process.exit(1);
  }
  r.log.forEach((l) => console.log(l));
  if (!r.changed) {
    console.log('Nothing to do.');
  } else {
    const removed = process.argv.includes('--remove');
    console.log(`\n${removed ? 'Uninstalled from' : 'Installed into'} ${r.settingsPath} (backup: settings.json.bak)`);
    console.log('Hooks take effect in NEW Claude Code sessions.');
  }
}

module.exports = { installHooks };
