import { db, json, readBody, clean, sendEmail, bouton, esc, photoNette, SITE } from './_lib.js';

const MAX_MESSAGES = 500;
const NOTIF_DELAI_MIN = 15; // pas plus d'un email « nouveau message » toutes les 15 min par personne

// Retrouve la conversation et le côté (a = personne de l'annonce, d = personne qui a demandé)
async function trouver(sb, token) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const champs = 'id, annonce_id, prenom, age, email, telephone, photo_path, status, token_a, token_d, partage_a, partage_d, partage_at, notif_a_at, notif_d_at, signalee';
  let { data: d } = await sb.from('demandes').select(champs).eq('token_a', token).maybeSingle();
  let cote = 'a';
  if (!d) { ({ data: d } = await sb.from('demandes').select(champs).eq('token_d', token).maybeSingle()); cote = 'd'; }
  if (!d || d.status !== 'acceptee') return null;
  const { data: a } = await sb.from('annonces').select('id, prenom, age, email, telephone, photo_path').eq('id', d.annonce_id).single();
  if (!a) return null;
  const moi = cote === 'a'
    ? { prenom: a.prenom, age: a.age, email: a.email, telephone: a.telephone, photo_path: a.photo_path }
    : { prenom: d.prenom, age: d.age, email: d.email, telephone: d.telephone, photo_path: d.photo_path };
  const autre = cote === 'a'
    ? { prenom: d.prenom, age: d.age, email: d.email, telephone: d.telephone, photo_path: d.photo_path, token: d.token_d }
    : { prenom: a.prenom, age: a.age, email: a.email, telephone: a.telephone, photo_path: a.photo_path, token: d.token_a };
  return { d, a, cote, autreCote: cote === 'a' ? 'd' : 'a', moi, autre };
}

function coordHtml(p) {
  return `<strong>${esc(p.prenom)}</strong>, ${p.age} ans<br>Email : <a href="mailto:${esc(p.email)}" style="color:#e3b3b0">${esc(p.email)}</a>${p.telephone ? `<br>Téléphone : ${esc(p.telephone)}` : ''}`;
}

export default async function handler(req, res) {
  const sb = db();

  if (req.method === 'GET') {
    const t = new URL(req.url, 'http://x').searchParams.get('t');
    const c = await trouver(sb, t);
    if (!c) return json(res, 404, { error: 'Conversation introuvable ou expirée.' });
    const { data: msgs } = await sb.from('messages').select('id, auteur, contenu, created_at').eq('demande_id', c.d.id).order('created_at').limit(MAX_MESSAGES);
    const partageMoi = c.cote === 'a' ? c.d.partage_a : c.d.partage_d;
    const partageAutre = c.cote === 'a' ? c.d.partage_d : c.d.partage_a;
    const tousDeux = partageMoi && partageAutre;
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, {
      moi: { prenom: c.moi.prenom },
      autre: {
        prenom: c.autre.prenom,
        age: c.autre.age,
        photo: await photoNette(sb, c.autre.photo_path),
        ...(tousDeux ? { email: c.autre.email, telephone: c.autre.telephone } : {}),
      },
      annonce: c.a.id,
      partage: { moi: partageMoi, autre: partageAutre },
      messages: (msgs || []).map((m) => ({ id: m.id, de: m.auteur === c.cote ? 'moi' : 'autre', contenu: m.contenu, date: m.created_at })),
    });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });
  const b = await readBody(req);
  const c = await trouver(sb, b.t);
  if (!c) return json(res, 404, { error: 'Conversation introuvable ou expirée.' });
  const now = new Date();

  if (b.action === 'message') {
    const contenu = String(b.contenu || '').replace(/[<>]/g, '').trim().slice(0, 2000);
    if (!contenu) return json(res, 400, { error: 'Message vide.' });
    const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('demande_id', c.d.id);
    if ((count || 0) >= MAX_MESSAGES) return json(res, 429, { error: 'Cette conversation a atteint sa limite de messages. Partagez vos coordonnées pour continuer.' });
    const { error } = await sb.from('messages').insert({ demande_id: c.d.id, auteur: c.cote, contenu });
    if (error) return json(res, 500, { error: 'Envoi impossible, réessayez.' });

    // Prévenir l'autre par email (au plus une fois toutes les 15 min)
    const champNotif = c.autreCote === 'a' ? 'notif_a_at' : 'notif_d_at';
    const derniere = c.d[champNotif] ? new Date(c.d[champNotif]) : null;
    if (!derniere || now - derniere > NOTIF_DELAI_MIN * 60000) {
      await sb.from('demandes').update({ [champNotif]: now.toISOString() }).eq('id', c.d.id);
      await sendEmail({
        to: c.autre.email,
        subject: `${c.moi.prenom} vous a écrit 💬`,
        html: `<p>Bonjour ${esc(c.autre.prenom)},</p><p>${esc(c.moi.prenom)} vous a envoyé un message sur Dewgal.</p>${bouton(`${SITE}/conversation.html?t=${c.autre.token}`, 'Lire et répondre')}<p style="font-size:13px;color:#cdbfae">Ce lien est personnel : ne le transférez à personne.</p>`,
      });
    }
    return json(res, 200, { ok: true });
  }

  if (b.action === 'partager') {
    const champ = c.cote === 'a' ? 'partage_a' : 'partage_d';
    const autreDejaOk = c.cote === 'a' ? c.d.partage_d : c.d.partage_a;
    const maj = { [champ]: true };
    if (autreDejaOk && !c.d.partage_at) maj.partage_at = now.toISOString();
    await sb.from('demandes').update(maj).eq('id', c.d.id);
    const conseil = '<p style="font-size:13px;color:#cdbfae">Conseils : faites d\'abord connaissance par téléphone, retrouvez-vous dans un lieu public, et ne transmettez jamais d\'argent.</p>';
    if (autreDejaOk && !c.d.partage_at) {
      await sendEmail({ to: c.moi.email, replyTo: c.autre.email, subject: `Vos coordonnées et celles de ${c.autre.prenom} 🤍`,
        html: `<p>Bonjour ${esc(c.moi.prenom)},</p><p>Vous avez tous les deux accepté d'échanger vos coordonnées. Voici celles de ${esc(c.autre.prenom)} :</p><p>${coordHtml(c.autre)}</p>${conseil}` });
      await sendEmail({ to: c.autre.email, replyTo: c.moi.email, subject: `Vos coordonnées et celles de ${c.moi.prenom} 🤍`,
        html: `<p>Bonjour ${esc(c.autre.prenom)},</p><p>Vous avez tous les deux accepté d'échanger vos coordonnées. Voici celles de ${esc(c.moi.prenom)} :</p><p>${coordHtml(c.moi)}</p>${conseil}` });
      if (process.env.ADMIN_EMAIL)
        await sendEmail({ to: process.env.ADMIN_EMAIL, subject: `✅ Coordonnées échangées · ${c.a.prenom} (N°${c.a.id}) et ${c.d.prenom}`,
          html: `<p>Les deux personnes ont accepté d'échanger leurs coordonnées. Chacune a reçu celles de l'autre par email.</p><p><strong>Annonce N°${c.a.id}</strong><br>${coordHtml(c.cote === 'a' ? c.moi : c.autre)}</p><p><strong>Demande</strong><br>${coordHtml(c.cote === 'd' ? c.moi : c.autre)}</p>` });
    } else if (!autreDejaOk) {
      await sendEmail({ to: c.autre.email, subject: `${c.moi.prenom} souhaite échanger vos coordonnées`,
        html: `<p>Bonjour ${esc(c.autre.prenom)},</p><p>${esc(c.moi.prenom)} aimerait poursuivre la conversation par téléphone ou par email. Si vous êtes d'accord, cliquez sur « Partager mes coordonnées » dans votre conversation. Rien ne sera dévoilé tant que vous n'aurez pas accepté.</p>${bouton(`${SITE}/conversation.html?t=${c.autre.token}`, 'Ouvrir la conversation')}` });
    }
    return json(res, 200, { ok: true });
  }

  if (b.action === 'signaler') {
    const motif = clean(b.motif, 500) || 'Aucun motif précisé';
    await sb.from('demandes').update({ signalee: true }).eq('id', c.d.id);
    const { data: derniers } = await sb.from('messages').select('auteur, contenu, created_at').eq('demande_id', c.d.id).order('created_at', { ascending: false }).limit(20);
    const nom = (x) => (x === 'a' ? c.a.prenom : c.d.prenom);
    if (process.env.ADMIN_EMAIL)
      await sendEmail({ to: process.env.ADMIN_EMAIL, subject: `⚠️ Signalement · conversation ${c.a.prenom} (N°${c.a.id}) / ${c.d.prenom}`,
        html: `<p><strong>${esc(c.moi.prenom)}</strong> (${esc(c.moi.email)}) a signalé <strong>${esc(c.autre.prenom)}</strong> (${esc(c.autre.email)}).</p><p>Motif : ${esc(motif)}</p><p>Derniers messages :</p>${(derniers || []).reverse().map((m) => `<p style="border-left:2px solid #e3b3b0;padding-left:10px"><strong>${esc(nom(m.auteur))}</strong> · ${new Date(m.created_at).toLocaleString('fr-FR')}<br>${esc(m.contenu)}</p>`).join('')}` });
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Action inconnue' });
}
