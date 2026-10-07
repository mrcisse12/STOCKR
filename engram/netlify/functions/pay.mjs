// Fonction Netlify : les abonnements Stripe d'Engram (/api/pay/…), voir server/pay.mjs.
// Variable à définir dans Netlify : STRIPE_SECRET_KEY (la clé secrète Stripe, jamais dans le code).
// Avec un compte (en-tête x-engram-session), l'abonnement est rangé dans le compte : voir server/account.mjs.
import { createPay } from '../../server/pay.mjs';
import { createAccount } from '../../server/account.mjs';
import { blobsBackend } from '../../server/sync.mjs';

const accounts = createAccount(process.env, { backend: blobsBackend({ name: 'engram-accounts', usage: false }), syncBackend: blobsBackend() });
const pay = createPay(process.env, { accounts });

export default async request => (await pay.handle(request)) || new Response('Not found', { status: 404 });

export const config = { path: ['/api/pay/*'] };
