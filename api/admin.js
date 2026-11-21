import { db, stripe, json, readBody, isAdmin, sendEmail, bouton, esc, addDays, SITE, DUREE_ANNONCE_JOURS, DUREE_UNE_JOURS } from './_lib.js';

// POST /api/admin  (en-tête x-admin-password)
//   { action: 'liste' }                         → annonces à vérifier + dernières publiées + stats
//   { action: 'valider', id }                   → publie l'annonce
//   { action: 'refuser', id, motif }            → refuse + rembourse
//   { action: 'retirer', id }                   → retire une annonce publiée (sans remboursement)
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });
  if (!isAdmin(req)) return json(res, 401, { error: 'Mot de passe incorrect' });
  const b = await readBody(req);
  const sb = db();

  if (b.action === 'liste') {
    const { data: aVerifier } = await sb.from('annonces').select('*').eq('status', 'a_verifier').order('paid_at');
    for (const a of aVerifier || []) {
      if (a.selfie_path) {
        const { data } = await sb.storage.from('selfies').createSignedUrl(a.selfie_path, 900);
        a.selfie_url = data?.signedUrl || null;
      }
      if (a.photo_path) {
        const { data } = await sb.storage.from('photos').createSignedUrl(a.photo_path, 900);
        a.photo_url = data?.signedUrl || null;
      }
    }
    const { data: publiees } = await sb.from('annonces').select('id, prenom, age, genre, formule, published_at, expires_at, featured_until').eq('status', 'publiee').order('published_at', { ascending: false }).limit(50);
    const { data: demandes } = await sb.from('demandes').select('id, annonce_id, prenom, status, created_at, signalee, partage_at').neq('status', 'attente_paiement').order('created_at', { ascending: false }).limit(50);
    return json(res, 200, { aVerifier: aVerifier || [], publiees: publiees || [], demandes: demandes || [] });
  }

  const id = parseInt(b.id, 10);
  const { data: a } = await sb.from('annonces').select('*').eq('id', id).single();
  if (!a) return json(res, 404, { error: 'Annonce introuvable' });

  if (b.action === 'valider') {
    if (a.status !== 'a_verifier') return json(res, 409, { error: 'Annonce déjà traitée' });
    const now = new Date();
    const maj = {
      status: 'publiee',
      published_at: now.toISOString(),
      expires_at: addDays(now, DUREE_ANNONCE_JOURS),
      featured_until: a.formule === 'une' ? addDays(now, DUREE_UNE_JOURS) : null,
      selfie_path: null,
    };
    await sb.from('annonces').update(maj).eq('id', id);
    if (a.selfie_path) await sb.storage.from('selfies').remove([a.selfie_path]); // selfie supprimé après vérification (RGPD)
    await sendEmail({ to: a.email, subject: 'Votre annonce Dewgal est en ligne ✓',
      html: `<p>Bonjour ${esc(a.prenom)},</p><p>Votre annonce N°${a.id} a été vérifiée et elle est en ligne pour 30 jours${a.formule === 'une' ? ', dont 7 jours en tête des annonces' : ''}.</p><p>Quand quelqu'un souhaitera faire votre connaissance, vous recevrez un email : vous serez libre d'accepter ou non.</p>${bouton(`${SITE}/annonces.html?n=${a.id}`, 'Voir mon annonce')}` });
    return json(res, 200, { ok: true });
  }

  if (b.action === 'refuser') {
    if (a.status !== 'a_verifier') return json(res, 409, { error: 'Annonce déjà traitée' });
    if (a.payment_intent) { try { await stripe().refunds.create({ payment_intent: a.payment_intent }); } catch (e) { console.error(e); } }
    await sb.from('annonces').update({ status: 'refusee', admin_note: (b.motif || '').slice(0, 300), selfie_path: null }).eq('id', id);
    if (a.selfie_path) await sb.storage.from('selfies').remove([a.selfie_path]);
    if (a.photo_path) await sb.storage.from('photos').remove([a.photo_path]);
    if (a.flou_path) await sb.storage.from('flous').remove([a.flou_path]);
    await sendEmail({ to: a.email, subject: 'Votre annonce Dewgal',
      html: `<p>Bonjour ${esc(a.prenom)},</p><p>Nous n'avons pas pu valider votre annonce${b.motif ? ` : ${esc(b.motif)}` : ''}.</p><p>Vous êtes intégralement remboursé·e (sous 5 à 10 jours). Vous pouvez en publier une nouvelle à tout moment.</p>` });
    return json(res, 200, { ok: true });
  }

  if (b.action === 'retirer') {
    await sb.from('annonces').update({ status: 'expiree' }).eq('id', id);
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Action inconnue' });
}
