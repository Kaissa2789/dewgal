import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const PRIX = { standard: 1900, une: 2900, demande: 990 }; // en centimes
export const DUREE_ANNONCE_JOURS = 30;
export const DUREE_UNE_JOURS = 7;
export const DELAI_REPONSE_JOURS = 7;
export const REMBOURSER_SI_REFUS = true; // mettre false pour garder les 9,90 € quand la personne refuse

export const SITE = (process.env.SITE_URL || 'https://dewgal.fr').replace(/\/$/, '');

export function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export function clean(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/[<>]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

export function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000).toISOString();
}

// Champs visibles publiquement (jamais l'email ni le téléphone)
export const PUBLIC_FIELDS =
  'id, genre, prenom, age, origine, peuple, religion, ville, profession, description, recherche, formule, published_at, featured_until, flou_path';

export async function sendEmail({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email non envoyé, RESEND_API_KEY manquant]', to, subject);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Dewgal <contact@dewgal.fr>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: layout(html),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!r.ok) console.error('Resend', r.status, await r.text());
}

function layout(inner) {
  return `<div style="background:#2a0d16;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#f3e9dc">
<div style="max-width:520px;margin:0 auto">
<div style="font-family:Georgia,serif;letter-spacing:.3em;color:#e3b3b0;font-size:18px;margin-bottom:24px">DEWGAL</div>
<div style="font-size:15px;line-height:1.6">${inner}</div>
<p style="margin-top:32px;font-size:12px;color:#cdbfae">Dewgal · dewgal.fr · un projet Glow Hub SASU</p>
</div></div>`;
}

export function bouton(href, label) {
  return `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#f3e9dc;color:#2a0d16;text-decoration:none;padding:14px 22px;font-weight:bold;letter-spacing:.05em">${esc(label)}</a></p>`;
}

export function isAdmin(req) {
  const pass = req.headers['x-admin-password'];
  return Boolean(process.env.ADMIN_PASSWORD) && pass === process.env.ADMIN_PASSWORD;
}

// Image envoyée par le navigateur en base64 (déjà compressée) → { buf, ext, type }
export function decodeImage(dataUrl, max = 3_000_000) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > max) return null;
  return { buf, ext: m[1] === 'jpeg' ? 'jpg' : m[1], type: `image/${m[1]}` };
}

export function flouUrl(path) {
  return path ? `${process.env.SUPABASE_URL}/storage/v1/object/public/flous/${path}` : null;
}

// Lien temporaire (7 jours) vers une photo nette, pour l'email d'acceptation
export async function photoNette(sb, path) {
  if (!path) return null;
  const { data } = await sb.storage.from('photos').createSignedUrl(path, 7 * 86400);
  return data?.signedUrl || null;
}
