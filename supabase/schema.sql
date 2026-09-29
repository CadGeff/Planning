-- Semainier — schéma Supabase
-- À coller dans Supabase → SQL Editor → New query → Run.
-- Idempotent : tu peux le relancer sans casser l'existant.

-- ---------------------------------------------------------------- Table
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  kind        text not null check (kind in ('block', 'task')),
  start_date  date not null,
  time_from   time,
  time_to     time,
  recur       text not null default 'none' check (recur in ('none', 'daily', 'weekly', 'monthly')),
  days        smallint[] check (days is null or days <@ array[0,1,2,3,4,5,6]::smallint[]),
  cat         text not null default 'bleu' check (cat in ('bleu', 'vert', 'ambre', 'rose', 'gris')),
  done        jsonb not null default '{}'::jsonb check (jsonb_typeof(done) = 'object'),
  skipped     jsonb not null default '{}'::jsonb check (jsonb_typeof(skipped) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Heures : les deux ou aucune, et la fin après le début.
  constraint items_times_ok check (
    (time_from is null and time_to is null)
    or (time_from is not null and time_to is not null and time_to > time_from)
  ),
  -- Un créneau bloqué a forcément des heures.
  constraint items_block_timed check (kind <> 'block' or time_from is not null)
);

comment on table  public.items         is 'Semainier : créneaux bloqués et tâches, avec leur règle de récurrence.';
comment on column public.items.days    is 'Récurrence hebdo : jours actifs, 0 = lundi … 6 = dimanche.';
comment on column public.items.done    is 'Occurrences cochées : { "AAAA-MM-JJ": true }.';
comment on column public.items.skipped is 'Occurrences retirées de la série : { "AAAA-MM-JJ": true }.';

create index if not exists items_user_id_idx on public.items (user_id);

-- ----------------------------------------------------------- updated_at
create or replace function public.items_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.items_touch_updated_at();

-- -------------------------------------------------- Row Level Security
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes.
alter table public.items enable row level security;

drop policy if exists "items: lecture de ses lignes"      on public.items;
drop policy if exists "items: création de ses lignes"     on public.items;
drop policy if exists "items: modification de ses lignes" on public.items;
drop policy if exists "items: suppression de ses lignes"  on public.items;

create policy "items: lecture de ses lignes" on public.items
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "items: création de ses lignes" on public.items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "items: modification de ses lignes" on public.items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "items: suppression de ses lignes" on public.items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Les visiteurs non connectés n'ont aucun droit sur la table.
revoke all on public.items from anon;
grant select, insert, update, delete on public.items to authenticated;
