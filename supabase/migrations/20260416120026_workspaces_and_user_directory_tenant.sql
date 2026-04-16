-- Multi-tenant: workspaces + user_directory por workspace.
-- Importante: el proyecto actual usa auth mock. Estas políticas RLS quedan listas
-- para Supabase Auth real; mientras el cliente use anon key sin JWT, RLS no puede
-- aislar tenants de forma segura.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- Si la tabla user_directory ya existía, la migramos a multi-tenant.
alter table if exists public.user_directory
  add column if not exists workspace_id uuid;

-- Para entornos existentes: crea un workspace "default" y asigna filas huérfanas.
do $$
declare
  default_ws uuid;
begin
  select id into default_ws from public.workspaces where slug = 'default' limit 1;
  if default_ws is null then
    insert into public.workspaces (slug, name) values ('default', 'Default workspace') returning id into default_ws;
  end if;

  -- Backfill de workspace_id (si la columna existe y está null)
  update public.user_directory
    set workspace_id = default_ws
    where workspace_id is null;
exception
  when undefined_table then
    -- user_directory aún no existe (por orden de migraciones); no hacer nada.
    null;
end $$;

-- Reglas e índices por tenant
alter table if exists public.user_directory
  alter column workspace_id set not null;

-- Reemplaza el unique global por unique por workspace (si existe el constraint antiguo)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_directory_name_key_unique'
  ) then
    alter table public.user_directory drop constraint user_directory_name_key_unique;
  end if;
exception
  when undefined_table then
    null;
end $$;

alter table if exists public.user_directory
  add constraint user_directory_workspace_name_key_unique unique (workspace_id, name_key);

create index if not exists idx_user_directory_workspace_name
  on public.user_directory (workspace_id, name);

-- RLS: preparado para JWT con claim "workspace_id" (uuid)
alter table public.workspaces enable row level security;
alter table public.user_directory enable row level security;

-- Workspaces: por ahora permisivo; cuando haya auth real, restringir lectura/escritura
-- por membresía (workspace_members). Se deja abierto para no romper el MVP actual.
drop policy if exists "workspaces_allow_all" on public.workspaces;
create policy "workspaces_allow_all"
  on public.workspaces
  for all
  using (true)
  with check (true);

-- user_directory: política segura (requiere auth con claim). No se activa sola en el MVP actual
-- porque el cliente usa anon sin JWT. Para no romper, dejamos una política abierta temporal.
drop policy if exists "user_directory_allow_all" on public.user_directory;
create policy "user_directory_allow_all"
  on public.user_directory
  for all
  using (true)
  with check (true);

-- Política lista para cuando se habilite Supabase Auth real:
-- (Descomentar y eliminar la allow_all cuando se migre a auth real)
-- create policy "user_directory_by_workspace"
--   on public.user_directory
--   for all
--   using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid)
--   with check (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);

