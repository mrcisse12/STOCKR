// Fonction Netlify : le relais de l'IA d'Engram, à la même adresse que le serveur Node
// (/api/ai et /api/ai/health). L'app le détecte seule, sans réglage.
// Variables à définir dans Netlify (Site configuration → Environment variables) :
// ANTHROPIC_API_KEY (obligatoire), ENGRAM_ACCESS_CODE (conseillé), ENGRAM_MODEL_* …
import { createEngram } from '../../server/core.mjs';

const engram = createEngram(process.env);

export default async (request, context) =>
  (await engram.handle(request, { ip: context?.ip || request.headers.get('x-nf-client-connection-ip') || '?' })) ||
  new Response('Not found', { status: 404 });

export const config = { path: ['/api/ai', '/api/ai/health'] };
