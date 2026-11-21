-- Dewgal · messagerie (à coller dans Supabase > SQL Editor > Run)
alter table demandes add column if not exists token_a uuid not null default gen_random_uuid();
alter table demandes add column if not exists token_d uuid not null default gen_random_uuid();
alter table demandes add column if not exists partage_a boolean not null default false;
alter table demandes add column if not exists partage_d boolean not null default false;
alter table demandes add column if not exists partage_at timestamptz;
alter table demandes add column if not exists notif_a_at timestamptz;
alter table demandes add column if not exists notif_d_at timestamptz;
alter table demandes add column if not exists signalee boolean not null default false;

create table if not exists messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  demande_id  bigint not null references demandes(id) on delete cascade,
  auteur      text not null check (auteur in ('a','d')),
  contenu     text not null check (char_length(contenu) between 1 and 2000)
);
create index if not exists messages_demande_idx on messages(demande_id, created_at);

alter table messages enable row level security;
revoke all on table messages from anon, authenticated;
grant all on table messages to service_role;
