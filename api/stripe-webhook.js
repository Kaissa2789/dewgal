import { db, stripe, json, sendEmail, bouton, esc, addDays, SITE, DELAI_REPONSE_JOURS } from './_lib.js';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

// POST /api/stripe-webhook ← Stripe nous prévient quand un paiement est réussi
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });
  let event;
  try {
    event = stripe().webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return json(res, 400, { error: 'Signature invalide' });
  }
  if (event.type !== 'checkout.session.completed') return json(res, 200, { ok: true });

  const s = event.data.object;
  if (s.payment_status !== 'paid') return json(res, 200, { ok: true });
  const { type, id } = s.metadata || {};
  const sb = db();
  const now = new Date().toISOString();

  if (type === 'annonce') {
    const { data: a } = await sb.from('annonces')
      .update({ status: 'a_verifier', paid_at: now, payment_intent: s.payment_intent })
      .eq('id', id).eq('status', 'attente_paiement').select('*').single();
    if (a) {
      await sendEmail({
        to: a.email,
        subject: 'Votre annonce Dewgal est en cours de vérification',
        html: `<p>Bonjour ${esc(a.prenom)},</p><p>Merci, votre paiement est bien reçu. Votre annonce va être relue par une vraie personne sous 48 h. Vous recevrez un email dès qu'elle sera en ligne.</p><p>Si elle n'est pas validée, vous serez remboursé·e intégralement.</p>`,
      });
      if (process.env.ADMIN_EMAIL)
        await sendEmail({
          to: process.env.ADMIN_EMAIL,
          subject: `Nouvelle annonce à vérifier · ${a.prenom}, ${a.age} ans`,
          html: `<p>Une nouvelle annonce (${a.formule === 'une' ? 'À la une, 29 €' : '19 €'}) attend ta validation.</p>${bouton(`${SITE}/admin.html`, 'Ouvrir l\'admin')}`,
        });
    }
  }

  if (type === 'demande') {
    const { data: d } = await sb.from('demandes')
      .update({ status: 'envoyee', paid_at: now, payment_intent: s.payment_intent })
      .eq('id', id).eq('status', 'attente_paiement').select('*').single();
    if (d) {
      const { data: a } = await sb.from('annonces').select('id, prenom, email').eq('id', d.annonce_id).single();
      const base = `${SITE}/api/repondre?t=${d.token}`;
      await sendEmail({
        to: a.email,
        subject: `${d.prenom}, ${d.age} ans, souhaite faire votre connaissance`,
        html: `<p>Bonjour ${esc(a.prenom)},</p>
<p>Une personne a lu votre annonce N°${a.id} sur Dewgal et souhaite faire votre connaissance :</p>
<p style="border-left:2px solid #e3b3b0;padding-left:14px"><strong>${esc(d.prenom)}, ${d.age} ans</strong><br>${esc(d.message).replace(/\n/g, '<br>')}</p>
<p>Si vous acceptez, vous recevrez tous les deux vos coordonnées par email. Si vous refusez, la personne est prévenue avec délicatesse.</p>
${bouton(`${base}&r=oui`, 'J\'accepte la mise en relation')}
<p><a href="${base}&r=non" style="color:#cdbfae">Je préfère refuser</a></p>
<p style="font-size:13px;color:#cdbfae">Sans réponse sous ${DELAI_REPONSE_JOURS} jours, la demande sera annulée.</p>`,
      });
      if (process.env.ADMIN_EMAIL)
        await sendEmail({ to: process.env.ADMIN_EMAIL, subject: `Nouvelle demande · ${d.prenom}, ${d.age} ans → ${a.prenom} (N°${a.id})`,
          html: `<p>${esc(d.prenom)} (${esc(d.email)}) a payé 9,90 € pour rencontrer ${esc(a.prenom)} (annonce N°${a.id}). L'email « J'accepte / Je refuse » vient de partir.</p>` });
      await sendEmail({
        to: d.email,
        subject: 'Votre demande a bien été transmise',
        html: `<p>Bonjour ${esc(d.prenom)},</p><p>Votre demande a été transmise à ${esc(a.prenom)} (annonce N°${a.id}). Vous serez prévenu·e par email de sa réponse.</p><p>Sans réponse sous ${DELAI_REPONSE_JOURS} jours, vous serez remboursé·e automatiquement.</p>`,
      });
    }
  }
  return json(res, 200, { ok: true });
}
