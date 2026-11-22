import { db, json, readBody, clean, esc, decodeImage, sendEmail, flouUrl, SITE } from './_lib.js';

// Modification d'une annonce par son auteur, via le lien secret reçu par email (?t=edit_token)
//   GET  ?t=…                                  → champs modifiables
//   POST { t, action: 'enregistrer', … }       → texte modifié tout de suite (copie à l'admin)
//   POST { t, action: 'photo', photo, flou }   → nouvelle photo en attente de vérification
//   POST { t, action: 'retirer' }              → retire l'annonce
const UUID = /^[0-9a-f-]{36}$/i;
const CHAMPS = ['ville', 'profession', 'passions', 'enfants', 'veut_enfants', 'description', 'recherche'];

async function trouver(sb, t) {
  if (!UUID.test(t || '')) return null;
  const { data } = await sb.from('annonces').select('*').eq('edit_token', t).maybeSingle();
  return data;
}

async function traiter(req, res) {
  const sb = db();
  if (req.method === 'GET') {
    const t = new URL(req.url, 'http://x').searchParams.get('t');
    const a = await trouver(sb, t);
    if (!a) return json(res, 404, { error: 'Lien invalide.' });
    const out = { id: a.id, prenom: a.prenom, age: a.age, genre: a.genre, status: a.status, expires_at: a.expires_at,
      flou: flouUrl(a.flou_path), photo_en_attente: Boolean(a.photo_attente_path) };
    for (const k of CHAMPS) out[k] = a[k] ?? '';
    return json(res, 200, out);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });

  const b = await readBody(req);
  const a = await trouver(sb, b.t);
  if (!a) return json(res, 404, { error: 'Lien invalide.' });
  if (!['publiee', 'a_verifier'].includes(a.status)) return json(res, 409, { error: 'Cette annonce n’est plus en ligne.' });
  const admin = process.env.ADMIN_EMAIL;

  if (b.action === 'enregistrer') {
    const maj = {
      ville: clean(b.ville, 60), profession: clean(b.profession, 80), passions: clean(b.passions, 150),
      enfants: ['0', '1', '2', '3', '4+'].includes(b.enfants) ? b.enfants : null,
      veut_enfants: ['oui', 'ouvert', 'non'].includes(b.veut_enfants) ? b.veut_enfants : null,
      description: clean(b.description, 400), recherche: clean(b.recherche, 500),
    };
    if (!maj.description || !maj.recherche) return json(res, 400, { error: 'La description et la recherche sont obligatoires.' });
    const { error } = await sb.from('annonces').update(maj).eq('id', a.id);
    if (error) return json(res, 500, { error: 'Enregistrement impossible, réessayez.' });
    const avant = CHAMPS.filter((k) => (a[k] ?? '') !== (maj[k] ?? '')).map((k) => `<p><b>${k}</b><br><s>${esc(a[k] ?? '')}</s><br>${esc(maj[k] ?? '')}</p>`).join('');
    if (admin && avant) await sendEmail({ to: admin, subject: `✏️ Annonce modifiée · ${a.prenom} (N°${a.id})`, html: `<p>${esc(a.prenom)} a modifié son annonce N°${a.id} :</p>${avant}<p>Si quelque chose ne va pas : Supabase → annonces, ou « Retirer » dans l’admin.</p>` });
    return json(res, 200, { ok: true });
  }

  if (b.action === 'photo') {
    const photo = decodeImage(b.photo), flou = decodeImage(b.flou, 300_000);
    if (!photo || !flou) return json(res, 400, { error: 'Photo illisible, essayez une autre image.' });
    const t = Date.now();
    const pp = `annonce-${a.id}-${t}.${photo.ext}`, fp = `annonce-${a.id}-${t}.${flou.ext}`;
    const [r1, r2] = await Promise.all([
      sb.storage.from('photos').upload(pp, photo.buf, { contentType: photo.type }),
      sb.storage.from('flous').upload(fp, flou.buf, { contentType: flou.type }),
    ]);
    if (r1.error || r2.error) return json(res, 500, { error: 'Envoi de la photo impossible, réessayez.' });
    // une ancienne photo en attente est remplacée
    if (a.photo_attente_path) await sb.storage.from('photos').remove([a.photo_attente_path]);
    if (a.flou_attente_path) await sb.storage.from('flous').remove([a.flou_attente_path]);
    const { error } = await sb.from('annonces').update({ photo_attente_path: pp, flou_attente_path: fp }).eq('id', a.id);
    if (error) return json(res, 500, { error: 'Enregistrement impossible, réessayez.' });
    if (admin) await sendEmail({ to: admin, subject: `📷 Nouvelle photo à vérifier · ${a.prenom} (N°${a.id})`, html: `<p>${esc(a.prenom)} a envoyé une nouvelle photo pour l’annonce N°${a.id}. Elle attend ta validation dans l’admin.</p><p><a href="${SITE}/admin.html">Ouvrir l’admin</a></p>` });
    return json(res, 200, { ok: true });
  }

  if (b.action === 'retirer') {
    await sb.from('annonces').update({ status: 'expiree', expires_at: new Date().toISOString() }).eq('id', a.id);
    if (admin) await sendEmail({ to: admin, subject: `🗑️ Annonce retirée par ${a.prenom} (N°${a.id})`, html: `<p>${esc(a.prenom)} a retiré son annonce N°${a.id}${b.raison ? ` : « ${esc(clean(b.raison, 200))} »` : ''}.</p>` });
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Action inconnue' });
}

export default async function handler(req, res) {
  try { return await traiter(req, res); }
  catch (e) { console.error(e); return json(res, 500, { error: 'Erreur serveur, réessayez dans un instant.' }); }
}
