-- ═══════════════════════════════════════════════════════════════
-- Migración 2.3 — reports y business_profiles
-- ═══════════════════════════════════════════════════════════════
-- Corresponde al Bloque 2.3.

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  business_name text not null
    constraint business_profiles_name_length check (char_length(business_name) between 2 and 120),
  slug text not null unique,
  description text,
  logo_url text,
  created_at timestamptz not null default now()
);

comment on table public.business_profiles is
  'Perfil público de negocio/empresa. 1-1 con profiles cuando role = BUSINESS.';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null
    constraint reports_reason_check check (
      reason in ('ESTAFA', 'CONTENIDO_FALSO', 'SPAM', 'CONTENIDO_OFENSIVO', 'OFERTA_SOSPECHOSA', 'INFO_INCORRECTA', 'OTRO')
    ),
  description text,
  status text not null default 'PENDING'
    constraint reports_status_check check (status in ('PENDING', 'REVIEWED', 'DISMISSED')),
  created_at timestamptz not null default now(),
  -- Regla de negocio: un usuario reporta una publicación una sola vez.
  constraint reports_unique_reporter_per_post unique (post_id, reporter_id)
);

comment on table public.reports is
  'Reporte de un usuario sobre una publicación. Un usuario solo puede reportar cada post una vez (constraint unique).';

create index reports_post_idx on public.reports (post_id);
create index reports_status_idx on public.reports (status);
