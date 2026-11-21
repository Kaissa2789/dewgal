import { db, stripe, sendEmail, esc, photoNette, bouton, SITE, REMBOURSER_SI_REFUS } from './_lib.js';

function page(res, titre, texte) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dewgal</title><link rel="stylesheet" href="/assets/style.css"></head><body><main class="wrap narrow"><a class="logo" href="/">DEWGAL</a><h1>${titre}</h1><p class="lead">${texte}</p><a class="cta" href="/annonces.html">Voir les annonces</a></main></body></html>`);
}

// GET /api/repondre?t=TOKEN&r=oui|non ← lien cliqué dans l'email par la personne de l'annonce
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('t');
  const r = url.searchParams.get('r');
  if (!token || !['oui', 'non'].includes(r)) return page(res, 'Lien invalide', 'Ce lien n\'est pas valide.');

  const sb = db();
  const { data: d } = await sb.from('demandes').select('*').eq('token', token).single();
  if (!d) return page(res, 'Lien invalide', 'Cette demande est introuvable.');
  if (d.status !== 'envoyee') return page(res, 'Déjà traité', 'Vous avez déjà répondu à cette demande, ou elle a expiré.');
  const { data: a } = await sb.from('annonces').select('id, prenom, age, email, telephone, photo_path').eq('id', d.annonce_id).single();
  const now = new Date().toISOString();

  if (r === 'oui') {
    await sb.from('demandes').update({ status: 'acceptee', responded_at: now }).eq('id', d.id);
    const [photoA, photoD] = await Promise.all([photoNette(sb, a.photo_path), photoNette(sb, d.photo_path)]);
    const img = (u, n) => (u ? `<p><img src="${u}" alt="Photo de ${esc(n)}" style="max-width:240px;width:100%;display:block"></p>` : '');
    const coord = (p) => `<strong>${esc(p.prenom)}</strong>, ${p.age} ans<br>Email : <a href="mailto:${esc(p.email)}" style="color:#e3b3b0">${esc(p.email)}</a>${p.telephone ? `<br>Téléphone : ${esc(p.telephone)}` : ''}`;
    const conseil = '<p style="font-size:13px;color:#cdbfae">Conseils : faites connaissance d\'abord par message ou appel, retrouvez-vous dans un lieu public, et ne transmettez jamais d\'argent.</p>';
    await sendEmail({ to: d.email, replyTo: a.email, subject: `${a.prenom} a accepté votre demande 🎉`,
      html: `<p>Bonjour ${esc(d.prenom)},</p><p>Bonne nouvelle : ${esc(a.prenom)} souhaite aussi faire votre connaissance. Voici sa photo et ses coordonnées :</p>${img(photoA, a.prenom)}<p>${coord(a)}</p>${conseil}` });
    await sendEmail({ to: a.email, replyTo: d.email, subject: `Vos coordonnées ont été transmises à ${d.prenom}`,
      html: `<p>Bonjour ${esc(a.prenom)},</p><p>Vous avez accepté la demande de ${esc(d.prenom)}. Voici sa photo et ses coordonnées :</p>${img(photoD, d.prenom)}<p>${coord(d)}</p>${conseil}` });
    if (process.env.ADMIN_EMAIL)
      await sendEmail({ to: process.env.ADMIN_EMAIL, subject: `✅ Mise en relation acceptée · ${a.prenom} (N°${a.id}) et ${d.prenom}`,
        html: `<p>${esc(a.prenom)} a accepté la demande de ${esc(d.prenom)}. Les deux ont reçu par email la photo et les coordonnées de l'autre.</p><p><strong>Annonce N°${a.id}</strong><br>${coord(a)}</p><p><strong>Demande</strong><br>${coord(d)}</p>` });
    return page(res, 'C\'est fait 🎉', `Vos coordonnées et celles de ${esc(d.prenom)} viennent de vous être envoyées par email. Belle rencontre !`);
  }

  await sb.from('demandes').update({ status: 'refusee', responded_at: now }).eq('id', d.id);
  if (REMBOURSER_SI_REFUS && d.payment_intent) { try { await stripe().refunds.create({ payment_intent: d.payment_intent }); } catch (e) { console.error(e); } }
  await sendEmail({ to: d.email, subject: 'Une réponse à votre demande Dewgal',
    html: `<p>Bonjour ${esc(d.prenom)},</p>
<p>${esc(a.prenom)} a pris le temps de lire votre message avec attention, et vous remercie sincèrement pour votre démarche. Elle ou il a préféré ne pas donner suite cette fois-ci.</p>
<p>Ce n'est en rien un jugement sur vous : chacun cherche quelque chose de très personnel, et parfois les chemins ne se croisent simplement pas. Votre sincérité a de la valeur, ne la perdez pas.</p>
<p>La bonne personne est peut-être déjà sur Dewgal, ou sur le point d'y arriver. Prenez le temps de découvrir les autres annonces vérifiées 🤍</p>
${bouton(`${SITE}/annonces.html`, 'Voir les annonces')}
<p>Avec toute notre bienveillance,<br>L'équipe Dewgal</p>` });
  if (process.env.ADMIN_EMAIL)
    await sendEmail({ to: process.env.ADMIN_EMAIL, subject: `Mise en relation refusée · ${a.prenom} (N°${a.id}) / ${d.prenom}`,
      html: `<p>${esc(a.prenom)} a refusé la demande de ${esc(d.prenom)} (${esc(d.email)}).${REMBOURSER_SI_REFUS ? ' Remboursement automatique effectué.' : ''}</p>` });
  return page(res, 'C\'est noté', `${esc(d.prenom)} sera prévenu·e avec délicatesse. Merci d'avoir répondu.`);
}
