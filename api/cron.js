import { db, stripe, json, sendEmail, esc, DELAI_REPONSE_JOURS } from './_lib.js';

// Chaque matin (Vercel Cron) : demandes sans réponse → annulées + remboursées ; annonces expirées → retirées
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return json(res, 401, { error: 'Non autorisé' });
  const sb = db();
  const now = new Date();
  const limite = new Date(now.getTime() - DELAI_REPONSE_JOURS * 86400000).toISOString();

  const { data: vieilles } = await sb.from('demandes').select('*').eq('status', 'envoyee').lt('paid_at', limite);
  for (const d of vieilles || []) {
    if (d.payment_intent) { try { await stripe().refunds.create({ payment_intent: d.payment_intent }); } catch (e) { console.error(e); } }
    await sb.from('demandes').update({ status: 'expiree' }).eq('id', d.id);
    await sendEmail({ to: d.email, subject: 'Votre demande Dewgal a expiré',
      html: `<p>Bonjour ${esc(d.prenom)},</p><p>Votre demande n'a pas reçu de réponse sous ${DELAI_REPONSE_JOURS} jours. Vous êtes intégralement remboursé·e (sous 5 à 10 jours).</p><p>D'autres annonces vous attendent sur Dewgal.</p>` });
  }
  const { data: expirees } = await sb.from('annonces').update({ status: 'expiree' }).eq('status', 'publiee').lt('expires_at', now.toISOString()).select('id');
  const unAn = new Date(now.getTime() - 365 * 86400000).toISOString();
  await sb.from('messages').delete().lt('created_at', unAn);
  return json(res, 200, { demandesRemboursees: (vieilles || []).length, annoncesExpirees: (expirees || []).length });
}
