// Prépare le dossier publié par Netlify (_site/) : seulement les fichiers de l'app,
// jamais le code du serveur ni ses dépendances.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const files = ['index.html', 'dossier.html', 'manifest.webmanifest', 'sw.js', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of files) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
// Numéro de version du cache hors-ligne : change à chaque déploiement.
const sw = path.join(out, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__BUILD__', process.env.COMMIT_REF?.slice(0, 8) || String(Date.now())));
console.log('Engram → _site/ :', files.join(', '));
