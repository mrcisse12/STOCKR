// Fonction Netlify : les comptes d'Engram (/api/account/…), voir server/account.mjs.
// Les comptes vont dans Netlify Blobs (magasin « engram-accounts », clés « acct/… ») ; l'espace de synchronisation
// de chaque compte reste dans « engram-sync » (« u_<compte>/… »). Rien à régler pour l'e-mail et les clés d'accès.
// Variables facultatives : ENGRAM_SESSION_SECRET (sinon un secret tiré une fois et gardé dans le magasin),
// GOOGLE_CLIENT_ID (« Continuer avec Google »), APPLE_CLIENT_ID (« Continuer avec Apple »), ENGRAM_RP_ID.
import { createAccount } from '../../server/account.mjs';
import { blobsBackend } from '../../server/sync.mjs';

const account = createAccount(process.env, { backend: blobsBackend({ name: 'engram-accounts', usage: false }), syncBackend: blobsBackend() });

export default async (request, context) => (await account.handle(request, { ip: context?.ip || '?' })) || new Response('Not found', { status: 404 });

export const config = { path: ['/api/account', '/api/account/*'] };
