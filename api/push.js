import { db, json, readBody } from './_lib.js';

// POST /api/push { t, subscription } → enregistre l'abonnement aux notifications pour cette conversation
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });
  const b = await readBody(req);
  const t = String(b.t || '');
  const s = b.subscription || {};
  if (!/^[0-9a-f-]{36}$/i.test(t) || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth)
    return json(res, 400, { error: 'Abonnement invalide' });
  const sb = db();
  const { data: d } = await sb.from('demandes').select('id, status').or(`token_a.eq.${t},token_d.eq.${t}`).maybeSingle();
  if (!d || d.status !== 'acceptee') return json(res, 404, { error: 'Conversation introuvable' });
  const { error } = await sb.from('push_abonnements').upsert(
    { token: t, endpoint: s.endpoint.slice(0, 1000), p256dh: String(s.keys.p256dh).slice(0, 200), auth: String(s.keys.auth).slice(0, 100) },
    { onConflict: 'endpoint' }
  );
  if (error) return json(res, 500, { error: 'Enregistrement impossible' });
  return json(res, 200, { ok: true });
}
