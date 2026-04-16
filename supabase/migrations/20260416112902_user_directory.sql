-- Directorio simple de usuarios (solo nombres) para "Localizado por".
-- Nota: hoy el proyecto usa auth mock; esta tabla es global.
-- Cuando haya auth real, se recomienda agregar workspace_id / user_id y políticas más estrictas.

create table if not exists public.user_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Clave normalizada (minúsculas + sin acentos) calculada en el cliente.
  name_key text not null,
  created_at timestamptz not null default now(),
  constraint user_directory_name_key_unique unique (name_key)
);

create index if not exists idx_user_directory_name
  on public.user_directory (name);

alter table public.user_directory enable row level security;

-- Proyecto actual: acceso con anon key desde el cliente (misma superficie que otras tablas).
-- Endurecer cuando exista auth real.
create policy "user_directory_allow_all"
  on public.user_directory
  for all
  using (true)
  with check (true);

