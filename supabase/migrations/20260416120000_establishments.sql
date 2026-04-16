-- Caché de establecimientos por libro/pestaña de Google Sheets.
-- Clave natural: (spreadsheet_id, sheet_tab, sheet_row_number) — evita duplicados al reimportar.

create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null,
  sheet_tab text not null default '',
  sheet_row_number integer not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint establishments_sheet_row_unique unique (spreadsheet_id, sheet_tab, sheet_row_number)
);

create index if not exists idx_establishments_spreadsheet_tab
  on public.establishments (spreadsheet_id, sheet_tab);

create index if not exists idx_establishments_updated_at
  on public.establishments (updated_at desc);

alter table public.establishments enable row level security;

-- Proyecto actual: acceso con anon key desde el cliente (misma superficie que la Edge Function).
-- Endurecer con auth real y políticas por usuario/organización cuando exista.
create policy "establishments_allow_all"
  on public.establishments
  for all
  using (true)
  with check (true);
