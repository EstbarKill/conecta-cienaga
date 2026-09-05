-- ═══════════════════════════════════════════════════════════════
-- Migración 2.2 — Tabla posts
-- ═══════════════════════════════════════════════════════════════
-- Corresponde al Bloque 2.2. Depende de profiles, categories, locations
-- (ya creadas en la migración anterior).

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    constraint posts_type_check check (type in ('EMPLOYMENT', 'SERVICE', 'JOB_SEEKER')),
  category_id integer not null references public.categories (id),
  location_id integer not null references public.locations (id),
  title text not null
    constraint posts_title_length check (char_length(title) between 5 and 120),
  slug text not null unique,
  description text not null
    constraint posts_description_length check (char_length(description) between 20 and 3000),
  -- Contacto: NUNCA se expone en el SELECT público directo. Solo vía
  -- la función RPC get_post_contact() (migración 20260831000005),
  -- que exige autenticación (decisión de negocio aprobada).
  contact_phone text,
  contact_whatsapp text,
  contact_email text,
  status text not null default 'DRAFT'
    constraint posts_status_check check (
      status in ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'PAUSED', 'EXPIRED', 'DELETED')
    ),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  -- Al menos un medio de contacto es obligatorio para que la
  -- publicación sea útil.
  constraint posts_at_least_one_contact check (
    contact_phone is not null or contact_whatsapp is not null or contact_email is not null
  )
);

comment on table public.posts is
  'Publicación de empleo, servicio u oferta de trabajo. El ciclo de vida de status se controla por RLS: el autor no puede auto-publicarse (ver migración de RLS).';
comment on column public.posts.contact_phone is
  'Solo accesible vía RPC get_post_contact(), nunca en SELECT directo (regla de negocio: contacto visible solo a usuarios autenticados que hacen clic explícito).';

create trigger posts_set_updated_at
  before update on public.posts
  for each row
  execute function public.set_updated_at();

-- ── Índices ──────────────────────────────────────────────────────
-- Justificados por los patrones de consulta reales del Bloque 5
-- (búsqueda/listado), no creados de forma indiscriminada.

-- Soporta la query principal del listado público:
-- WHERE status = 'PUBLISHED' AND expires_at > now()
create index posts_status_expires_idx on public.posts (status, expires_at);

-- Filtros del buscador (sección 24 del estándar)
create index posts_category_idx on public.posts (category_id);
create index posts_location_idx on public.posts (location_id);
create index posts_author_idx on public.posts (author_id);
