-- ═══════════════════════════════════════════════════════════════
-- Migración 2.8 — Columna address en posts
-- ═══════════════════════════════════════════════════════════════
-- Añadida durante el Bloque 5 a petición del cliente: se necesita un
-- campo de texto libre para la dirección específica del negocio o
-- servicio (calle, barrio, punto de referencia), independiente de
-- `location_id` (que sigue siendo la jerarquía municipio → departamento
-- → país, usada para filtrado/escalabilidad geográfica — sección 8 y
-- 41 del estándar). No se reemplaza location_id por texto libre
-- porque perdería la capacidad de filtrar por zona cuando la
-- plataforma crezca a otros municipios.

alter table public.posts add column address text
  constraint posts_address_length check (address is null or char_length(address) <= 300);

comment on column public.posts.address is
  'Dirección específica del negocio/servicio (calle, barrio, punto de referencia), texto libre y opcional. No confundir con location_id (jerarquía municipio/departamento/país para filtrado).';

-- Se otorga el privilegio de columna al mismo grupo de columnas
-- editables por el autor (ver migración 20260831000004_rls_policies).
-- GRANT es aditivo: esto amplía el conjunto existente, no lo reemplaza.
grant update (address) on public.posts to authenticated;
