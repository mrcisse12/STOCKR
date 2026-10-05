// Fonction Netlify : synchronisation des paquets entre appareils (/api/sync…), voir server/sync.mjs.
// Les documents vont dans Netlify Blobs (magasin « engram-sync »), sans réglage.
import { createSync, blobsBackend } from '../../server/sync.mjs';

const sync = createSync(process.env, { backend: blobsBackend() });

export default async request => (await sync.handle(request)) || new Response('Not found', { status: 404 });

export const config = { path: ['/api/sync', '/api/sync/*'] };
