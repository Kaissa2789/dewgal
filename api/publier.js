import { db, stripe, json, readBody, clean, isEmail, decodeImage, PRIX, SITE } from './_lib.js';

// POST /api/publier → enregistre l'annonce + selfie, renvoie le lien de paiement Stripe
async function traiter(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée' });
  const b = await readBody(req);

  const genre = b.genre === 'lui' ? 'lui' : b.genre === 'elle' ? 'elle' : null;
  const formule = b.formule === 'une' ? 'une' : 'standard';
  const age = parseInt(b.age, 10);
  const annonce = {
    genre,
    formule,
    age,
    prenom: clean(b.prenom, 40),
    origine: clean(b.origine, 80),
    peuple: clean(b.peuple, 80),
    religion: clean(b.religion, 40),
    ville: clean(b.ville, 60),
    profession: clean(b.profession, 80),
    description: clean(b.description, 400),
    recherche: clean(b.recherche, 500),
    email: clean(b.email, 120),
    telephone: clean(b.telephone, 30),
    consent: b.consent === true,
  };
  if (!genre || !annonce.prenom || !(age >= 18 && age <= 99) || !annonce.description || !annonce.recherche)
    return json(res, 400, { error: 'Merci de remplir tous les champs obligatoires.' });
  if (!isEmail(annonce.email)) return json(res, 400, { error: 'Adresse email invalide.' });
  if (!annonce.consent) return json(res, 400, { error: 'Merci de cocher la case de consentement.' });

  // Images compressées dans le navigateur : selfie (vérification), photo nette, photo floutée
  const selfie = decodeImage(b.selfie);
  const photo = decodeImage(b.photo);
  const flou = decodeImage(b.flou, 300_000);
  if (!selfie) return json(res, 400, { error: 'Merci d\'ajouter votre selfie de vérification.' });
  if (!photo || !flou) return json(res, 400, { error: 'Merci d\'ajouter votre photo de profil.' });

  const sb = db();
  const { data: row, error } = await sb.from('annonces').insert(annonce).select('id').single();
  if (error) return json(res, 500, { error: 'Enregistrement impossible, réessayez.' });

  const t = Date.now();
  const selfie_path = `annonce-${row.id}-${t}.${selfie.ext}`;
  const photo_path = `annonce-${row.id}-${t}.${photo.ext}`;
  const flou_path = `annonce-${row.id}-${t}.${flou.ext}`;
  const ups = await Promise.all([
    sb.storage.from('selfies').upload(selfie_path, selfie.buf, { contentType: selfie.type }),
    sb.storage.from('photos').upload(photo_path, photo.buf, { contentType: photo.type }),
    sb.storage.from('flous').upload(flou_path, flou.buf, { contentType: flou.type }),
  ]);
  if (ups.some((u) => u.error)) return json(res, 500, { error: 'Envoi des photos impossible, réessayez.' });

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    allow_promotion_codes: true,
    customer_email: annonce.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: PRIX[formule],
        product_data: {
          name: formule === 'une' ? 'Annonce vérifiée À la une (30 jours, dont 7 en tête)' : 'Annonce vérifiée (30 jours)',
        },
      },
    }],
    metadata: { type: 'annonce', id: String(row.id) },
    payment_intent_data: { metadata: { type: 'annonce', id: String(row.id) } },
    success_url: `${SITE}/merci.html?type=annonce`,
    cancel_url: `${SITE}/publier.html?annule=1`,
  });

  await sb.from('annonces').update({ selfie_path, photo_path, flou_path, stripe_session: session.id }).eq('id', row.id);
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
