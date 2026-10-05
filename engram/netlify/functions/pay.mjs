// Fonction Netlify : les abonnements Stripe d'Engram (/api/pay/…), voir server/pay.mjs.
// Variable à définir dans Netlify : STRIPE_SECRET_KEY (la clé secrète Stripe, jamais dans le code).
import { createPay } from '../../server/pay.mjs';

const pay = createPay(process.env);

export default async request => (await pay.handle(request)) || new Response('Not found', { status: 404 });

export const config = { path: ['/api/pay/*'] };
