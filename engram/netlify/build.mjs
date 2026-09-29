// Prépare le dossier publié par Netlify (_site/) : seulement les fichiers de l'app,
// jamais le code du serveur ni ses dépendances.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const files = ['index.html', 'dossier.html', 'decouvrir', 'manifest.webmanifest', 'sw.js', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of files) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
// Numéro de version : change à chaque déploiement. Le même dans le cache hors ligne et dans la page,
// pour que l'app signale une nouvelle version et que le bilan de l'installation l'affiche.
const build = process.env.COMMIT_REF?.slice(0, 8) || String(Date.now());
const sw = path.join(out, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__BUILD__', build));
const page = path.join(out, 'index.html');
fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace("const BUILD = '__BUILD__';", `const BUILD = '${build}';`));
// Adresse publique du site (fournie par Netlify) : les liens de partage et d'invitation en partent,
// même quand l'app est ouverte ailleurs (dans l'app Claude, par exemple).
const site = (process.env.URL || '').replace(/\/+$/, '');
if (/^https:\/\/[^\s'"<>]+$/.test(site)) {
  fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace("const SITE = '__SITE__';", `const SITE = '${site}';`));
}
console.log('Engram → _site/ :', files.join(', '), '· version', build, site ? '· ' + site : '');
