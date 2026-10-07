// Fonction Netlify : synchronisation des paquets entre appareils (/api/sync…), voir server/sync.mjs.
// Les documents vont dans Netlify Blobs (magasin « engram-sync »), sans réglage.
// Avec un compte (en-tête x-engram-session), l'espace est « u_<compte> » : 25 Mo en gratuit, 300 Mo abonné.
import { createSync, blobsBackend } from '../../server/sync.mjs';
import { createAccount } from '../../server/account.mjs';

const backend = blobsBackend();
const accounts = createAccount(process.env, { backend: blobsBackend({ name: 'engram-accounts', usage: false }), syncBackend: backend });
const sync = createSync(process.env, { backend, accounts });

export default async request => (await sync.handle(request)) || new Response('Not found', { status: 404 });

export const config = { path: ['/api/sync', '/api/sync/*'] };
