-- ═══════════════════════════════════════════════════════════════
-- Migración 2.1 — Tablas base: profiles, locations, categories
-- ═══════════════════════════════════════════════════════════════
-- Corresponde al Bloque 2.1 del plan de implementación aprobado.
-- Estas tres tablas no tienen dependencias entre sí (excepto profiles
-- que depende de auth.users, gestionado por Supabase Auth).

-- ── profiles ─────────────────────────────────────────────────────
-- Relación 1-1 con auth.users. Se crea automáticamente vía trigger
-- (ver migración 20260831000006) cuando alguien se registra.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'USER'
    constraint profiles_role_check check (role in ('USER', 'BUSINESS', 'ADMIN')),
  full_name text not null,
  phone text,
  whatsapp text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de cada usuario autenticado. 1-1 con auth.users. La columna role determina permisos vía RLS.';
comment on column public.profiles.role is
  'USER: persona buscando/ofreciendo. BUSINESS: negocio/empresa. ADMIN: moderador. Solo modificable vía función privilegiada, nunca directo desde el cliente (ver migración de RLS).';

-- ── locations ────────────────────────────────────────────────────
-- Jerarquía simple municipio → departamento → país. Se siembra con
-- Ciénaga/Magdalena/Colombia en el seed, pero la estructura ya
-- permite agregar otros municipios sin cambios de esquema.
create table public.locations (
  id serial primary key,
  municipio text not null,
  departamento text not null,
  pais text not null default 'Colombia',
  constraint locations_unique unique (municipio, departamento, pais)
);

comment on table public.locations is
  'Jerarquía Municipio → Departamento → País. Preparada para expansión más allá de Ciénaga sin cambios de esquema.';

-- ── categories ───────────────────────────────────────────────────
create table public.categories (
  id serial primary key,
  name text not null,
  slug text not null unique,
  is_active boolean not null default true
);

comment on table public.categories is
  'Categorías de publicaciones. Almacenadas en base de datos (no hardcodeadas en componentes), gestionables solo por ADMIN.';

-- ── updated_at automático en profiles ───────────────────────────
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
