import { db, json, PUBLIC_FIELDS, flouUrl } from './_lib.js';

const CHAMPS = PUBLIC_FIELDS.split(',').map((k) => k.trim());

// GET /api/annonces → annonces publiées, « À la une » en premier
export default async function handler(req, res) {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('annonces')
    .select('*')
    .eq('status', 'publiee')
    .gt('expires_at', now)
    .order('published_at', { ascending: false });
  if (error) return json(res, 500, { error: 'Chargement impossible' });
  const annonces = (data || [])
    .map((r) => Object.fromEntries(CHAMPS.map((k) => [k, r[k] ?? null])))
    .map(({ flou_path, ...a }) => ({ ...a, flou: flouUrl(flou_path), une: Boolean(a.featured_until && a.featured_until > now) }))
    .sort((a, b) => Number(b.une) - Number(a.une));
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return json(res, 200, { annonces });
}
