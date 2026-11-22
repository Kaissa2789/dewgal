-- Dewgal · annonces vérifiées
-- À coller dans Supabase > SQL Editor > New query > Run

create table if not exists annonces (
  id            bigint generated always as identity (start with 21) primary key,
  created_at    timestamptz not null default now(),
  genre         text not null check (genre in ('elle','lui')),
  prenom        text not null,
  age           int  not null check (age between 18 and 99),
  origine       text,
  peuple        text,
  religion      text,
  ville         text,
  profession    text,
  description   text not null,
  recherche     text not null,
  email         text not null,
  telephone     text,
  formule       text not null check (formule in ('standard','une')),
  selfie_path   text,
  photo_path    text,   -- photo nette (privée, envoyée après acceptation)
  flou_path     text,   -- photo floutée (publique, affichée sur l'annonce)
  consent       boolean not null default false,
  status        text not null default 'attente_paiement'
                check (status in ('attente_paiement','a_verifier','publiee','refusee','expiree')),
  stripe_session text,
  payment_intent text,
  paid_at       timestamptz,
  published_at  timestamptz,
  expires_at    timestamptz,
  featured_until timestamptz,
  admin_note    text
);

create table if not exists demandes (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  annonce_id    bigint not null references annonces(id) on delete cascade,
  prenom        text not null,
  age           int  not null check (age between 18 and 99),
  email         text not null,
  telephone     text,
  message       text not null,
  photo_path    text,
  token         uuid not null default gen_random_uuid(),
  status        text not null default 'attente_paiement'
                check (status in ('attente_paiement','envoyee','acceptee','refusee','expiree')),
  stripe_session text,
  payment_intent text,
  paid_at       timestamptz,
  responded_at  timestamptz
);

create index if not exists annonces_status_idx on annonces(status);
create index if not exists demandes_status_idx on demandes(status);

-- Sécurité : personne ne lit les tables depuis le navigateur.
-- Seul le serveur (clé service_role, rangée dans Vercel) y a accès.
alter table annonces enable row level security;
alter table demandes enable row level security;

-- Stockage privé des selfies de vérification
insert into storage.buckets (id, name, public) values
  ('selfies', 'selfies', false),   -- selfies de vérification (supprimés après vérification)
  ('photos',  'photos',  false),   -- photos nettes, privées
  ('flous',   'flous',   true)     -- photos floutées, visibles sur les annonces
on conflict (id) do nothing;

-- Accès réservé au serveur (clé service_role) : aucun accès depuis le navigateur
revoke all on table annonces, demandes from anon, authenticated;
grant all on table annonces, demandes to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Fiche plus complète (22/11)
alter table annonces add column if not exists passions text;
alter table annonces add column if not exists enfants text;
alter table annonces add column if not exists veut_enfants text;
