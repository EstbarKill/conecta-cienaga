-- ═══════════════════════════════════════════════════════════════
-- Seed inicial — Bloque 2.7
-- ═══════════════════════════════════════════════════════════════
-- Este archivo se ejecuta automáticamente en `supabase db reset`
-- (entorno local). Para producción, aplícalo una sola vez manualmente
-- (SQL Editor del dashboard o `psql` contra tu proyecto) — el CLI de
-- Supabase no lo empuja junto con `db push`.

insert into public.locations (municipio, departamento, pais) values
  ('Ciénaga', 'Magdalena', 'Colombia')
on conflict (municipio, departamento, pais) do nothing;

insert into public.categories (name, slug) values
  ('Administración', 'administracion'),
  ('Construcción', 'construccion'),
  ('Gastronomía', 'gastronomia'),
  ('Transporte', 'transporte'),
  ('Ventas', 'ventas'),
  ('Tecnología', 'tecnologia'),
  ('Servicios generales', 'servicios-generales'),
  ('Educación', 'educacion'),
  ('Salud', 'salud'),
  ('Oficios', 'oficios'),
  ('Trabajo remoto', 'trabajo-remoto'),
  ('Turismo', 'turismo'),
  ('Agricultura', 'agricultura'),
  ('Pesca', 'pesca'),
  ('Hogar y cuidado', 'hogar-y-cuidado'),
  ('Comercio', 'comercio'),
  ('Otros', 'otros')
on conflict (slug) do nothing;
