// La clé d'un visiteur pour les limites (quota gratuit, débit, essais) : son adresse IPv4, ou le préfixe /64 de son adresse IPv6.
// Un abonnement à IPv6 reçoit tout un /64 (souvent plus) : compter chaque adresse à part offrirait un quota neuf à chacune.

export function ipKey(ip) {
  let s = String(ip || '?').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const m4 = s.match(/^(?:::ffff:(?:0:)?)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m4) return m4[1];
  if (!s.includes(':')) return s;
  // Développe « :: » puis garde les quatre premiers groupes.
  const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) { const b = v4[1].split('.').map(Number); s = s.slice(0, -v4[1].length) + ((b[0] << 8) | b[1]).toString(16) + ':' + ((b[2] << 8) | b[3]).toString(16); }
  const [head, rest] = s.split('::');
  const h = head ? head.split(':') : [], r = rest != null ? (rest ? rest.split(':') : []) : null;
  const groups = r == null ? h : [...h, ...Array(Math.max(0, 8 - h.length - r.length)).fill('0'), ...r];
  const top = groups.slice(0, 4).map(g => (parseInt(g, 16) || 0).toString(16));
  return top.length === 4 ? top.join(':') + '::/64' : s;
}
