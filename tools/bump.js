/* bump — one version, every string in a file, atomically.

   Hand-editing version strings shipped a game whose header said 0.4.1 while it ran
   0.10.0, a lobby serving ?v=062 against a 0.10.0 game, and two test files pinned to
   a version that had not existed for a month. The lint gate catches drift; this
   prevents it.

   Usage:  npm run bump -- mdeal 0.10.3
           npm run bump -- mafia 0.3.0
           npm run bump -- pool 0.1.1
           npm run bump -- lobby 1.2.0
*/
const fs = require('fs');
const path = require('path');

const TARGETS = {
  mdeal: 'coastline/index.html',
  mafia: 'mafia/index.html',
  pool: 'pool/index.html',
  lobby: 'index.html',
};

const [alias, version] = process.argv.slice(2);
if (!TARGETS[alias] || !/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('usage: npm run bump -- <' + Object.keys(TARGETS).join('|') + '> <X.Y.Z>');
  process.exit(1);
}

const file = path.join(__dirname, '..', TARGETS[alias]);
let s = fs.readFileSync(file, 'utf8');
const before = (/Version:\s*([0-9.]+)/.exec(s) || [])[1] || '?';

s = s.replace(/Version:\s*[0-9.]+/g, 'Version: ' + version);           // the header comment
s = s.replace(/<span class="ver">v[0-9.]+<\/span>/g, '<span class="ver">v' + version + '</span>');  // the in-game badge
s = s.replace(/v[0-9.]+ · INFINITE TABLE/g, 'v' + version + ' · INFINITE TABLE');                    // Mafia's badge
s = s.replace(/\?v=[0-9.]+/g, '?v=' + version);                        // every cache-buster

fs.writeFileSync(file, s);
console.log(alias + ': ' + before + ' → ' + version + '  (' + TARGETS[alias] + ')');
console.log('now run: npm run check');
