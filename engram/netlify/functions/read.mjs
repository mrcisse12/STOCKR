// Fonction Netlify : lecture d'une page web pour en faire des fiches (/api/read?url=…), voir server/read.mjs.
import { createReader } from '../../server/read.mjs';

const reader = createReader(process.env);

export default async (request, context) =>
  (await reader.handle(request, { ip: context?.ip || request.headers.get('x-nf-client-connection-ip') || '?' })) || new Response('Not found', { status: 404 });

export const config = { path: '/api/read' };
