import { db, stripe, json, readBody, clean, isEmail, decodeImage, PRIX, SITE } from './_lib.js';

// POST /api/demande → demande de mise en relation avec une annonce, renvoie le lien de paiement
async function traiter(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });
  const b = await readBody(req);
  const annonce_id = parseInt(b.annonce_id, 10);
  const age = parseInt(b.age, 10);
  const d = {
    annonce_id,
    age,
    prenom: clean(b.prenom, 40),
    email: clean(b.email, 120),
    telephone: clean(b.telephone, 30),
    message: clean(b.message, 800),
  };
  if (!annonce_id || !d.prenom || !(age >= 18 && age <= 99) || !d.message)
    return json(res, 400, { error: 'Merci de remplir tous les champs.' });
  if (!isEmail(d.email)) return json(res, 400, { error: 'Adresse email invalide.' });
  if (b.consent !== true) return json(res, 400, { error: 'Merci de cocher la case de consentement.' });
  const photo = decodeImage(b.photo);
  if (!photo) return json(res, 400, { error: 'Merci d\'ajouter une photo de vous.' });

  const sb = db();
  const { data: a } = await sb.from('annonces').select('id, prenom, status, expires_at').eq('id', annonce_id).single();
  if (!a || a.status !== 'publiee' || a.expires_at < new Date().toISOString())
    return json(res, 404, { error: 'Cette annonce n\'est plus disponible.' });

  const { data: row, error } = await sb.from('demandes').insert(d).select('id').single();
  if (error) return json(res, 500, { error: 'Enregistrement impossible, réessayez.' });

  const photo_path = `demande-${row.id}-${Date.now()}.${photo.ext}`;
  const up = await sb.storage.from('photos').upload(photo_path, photo.buf, { contentType: photo.type });
  if (up.error) return json(res, 500, { error: 'Envoi de la photo impossible, réessayez.' });

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    allow_promotion_codes: true,
    customer_email: d.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: PRIX.demande,
        product_data: { name: `Demande de mise en relation · annonce N°${a.id} (${a.prenom})` },
      },
    }],
    metadata: { type: 'demande', id: String(row.id) },
    payment_intent_data: { metadata: { type: 'demande', id: String(row.id) } },
    success_url: `${SITE}/merci.html?type=demande`,
    cancel_url: `${SITE}/annonces.html?n=${a.id}`,
  });
  await sb.from('demandes').update({ stripe_session: session.id, photo_path }).eq('id', row.id);
  return json(res, 200, { url: session.url });
}

export default async function handler(req, res) {
  try {
    return await traiter(req, res);
  } catch (e) {
    console.error(e);
    const msg = e?.type?.startsWith?.('Stripe') ? `Paiement indisponible (${e.code || e.type}) : ${e.message}` : 'Une erreur est survenue, réessayez dans un instant.';
    return json(res, 500, { error: msg });
  }
}
