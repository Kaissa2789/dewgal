# Dewgal · annonces vérifiées — mise en route

## Variables d'environnement (Vercel → Settings → Environment Variables)
| Nom | Valeur |
|---|---|
| SUPABASE_URL | Project URL Supabase |
| SUPABASE_SERVICE_KEY | clé service_role Supabase (secrète) |
| STRIPE_SECRET_KEY | clé secrète Stripe (sk_test_… pour tester, sk_live_… en vrai) |
| STRIPE_WEBHOOK_SECRET | whsec_… (Stripe → Développeurs → Webhooks, URL : https://dewgal.fr/api/stripe-webhook, événement checkout.session.completed) |
| RESEND_API_KEY | clé API Resend |
| EMAIL_FROM | Dewgal <contact@dewgal.fr> |
| ADMIN_EMAIL | email qui reçoit les nouvelles annonces à vérifier |
| ADMIN_PASSWORD | mot de passe de la page /admin.html |
| SITE_URL | https://dewgal.fr |
| CRON_SECRET | une phrase longue au hasard |

## Base de données
Supabase → SQL Editor → coller `supabase/schema.sql` → Run.

## Pages
- /annonces.html : annonces publiées + demande de mise en relation (9,90 €)
- /publier.html : publier une annonce (19 € ou 29 € À la une)
- /admin.html : valider / refuser les annonces
