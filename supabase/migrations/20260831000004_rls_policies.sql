-- ═══════════════════════════════════════════════════════════════
-- Migración 2.4 — Row Level Security
-- ═══════════════════════════════════════════════════════════════
-- Corresponde al Bloque 2.4 y a la Fase 07 (Seguridad) del estándar.
-- Principio: identidad → rol → permisos → recurso → acción.
-- La autorización NUNCA depende del frontend: cada regla de aquí se
-- cumple aunque alguien llame a la API de Supabase directamente.

-- ── Función auxiliar: ¿el usuario actual es ADMIN? ─────────────────
-- SECURITY DEFINER: se ejecuta con los privilegios del dueño de la
-- función (postgres), que no está sujeto a RLS. Esto evita el
-- problema de recursión que ocurriría si una policy sobre `profiles`
-- intentara consultar `profiles` bajo su propia RLS.
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

comment on function public.is_admin() is
  'Devuelve true si el usuario autenticado actual tiene role = ADMIN. Usada en las políticas RLS de todas las tablas.';

-- ═══════════════════════════════════════════════════════════════
-- profiles
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- profiles_insert: no se crea policy de INSERT para `authenticated`.
-- La fila se crea exclusivamente vía el trigger de la migración
-- 20260831000006 (on auth.users insert), que corre como SECURITY
-- DEFINER. Así se evita que cualquier usuario cree perfiles arbitrarios.

-- Protección de columna `role`: aunque la policy de UPDATE anterior
-- permite al propio usuario actualizar su fila, revocamos el
-- privilegio de columna sobre `role` para que ni siquiera puedan
-- intentar cambiarlo desde el cliente. Solo vía admin_set_role() más
-- abajo (que corre como SECURITY DEFINER y valida is_admin()).
revoke update on public.profiles from authenticated;
grant update (full_name, phone, whatsapp, avatar_url) on public.profiles to authenticated;

create function public.admin_set_role(target_profile_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado: se requiere rol ADMIN.';
  end if;

  if new_role not in ('USER', 'BUSINESS', 'ADMIN') then
    raise exception 'Rol inválido: %', new_role;
  end if;

  update public.profiles set role = new_role where id = target_profile_id;
end;
$$;

comment on function public.admin_set_role(uuid, text) is
  'Único camino permitido para cambiar el role de un perfil. Verifica is_admin() internamente.';

-- Vista de perfil público (nombre y avatar) para mostrar autoría de
-- publicaciones a visitantes sin exponer teléfono/whatsapp. La vista
-- es propiedad de postgres (dueño de la migración), por lo que no
-- está sujeta a la RLS de `profiles` — es el patrón recomendado por
-- Supabase para exponer subconjuntos públicos de una tabla privada.
create view public.profiles_public as
  select id, full_name, avatar_url
  from public.profiles
  where is_active = true;

grant select on public.profiles_public to anon, authenticated;

comment on view public.profiles_public is
  'Subconjunto público y no sensible de profiles (nombre, avatar). Usar esta vista en listados públicos, nunca profiles directamente.';

-- ═══════════════════════════════════════════════════════════════
-- locations / categories — catálogos públicos, solo ADMIN escribe
-- ═══════════════════════════════════════════════════════════════
alter table public.locations enable row level security;
alter table public.categories enable row level security;

create policy "locations_select_all" on public.locations for select using (true);
create policy "locations_admin_write" on public.locations for all
  using (public.is_admin()) with check (public.is_admin());

create policy "categories_select_all" on public.categories for select using (true);
create policy "categories_admin_write" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- posts
-- ═══════════════════════════════════════════════════════════════
alter table public.posts enable row level security;

-- SELECT: público si está PUBLISHED y no ha expirado; el autor
-- siempre ve sus propios posts en cualquier estado; ADMIN ve todo.
create policy "posts_select_published_or_own_or_admin"
  on public.posts for select
  using (
    (status = 'PUBLISHED' and expires_at > now())
    or auth.uid() = author_id
    or public.is_admin()
  );

-- INSERT: el usuario solo puede crear posts a su propio nombre, y
-- únicamente en estado DRAFT o PENDING — nunca puede insertarse ya
-- PUBLISHED (regla de negocio aprobada: toda publicación pasa por
-- moderación).
create policy "posts_insert_own_pending_or_draft"
  on public.posts for insert
  with check (
    auth.uid() = author_id
    and status in ('DRAFT', 'PENDING')
  );

-- UPDATE: el autor puede editar su post, ADMIN puede editar cualquiera.
create policy "posts_update_own_or_admin"
  on public.posts for update
  using (auth.uid() = author_id or public.is_admin())
  with check (auth.uid() = author_id or public.is_admin());

-- Protección de columnas de moderación: un autor normal NO puede
-- cambiar `status` ni `rejection_reason` de su propio post (eso
-- movería su post a PUBLISHED sin pasar por un admin). Solo ADMIN,
-- que en la práctica siempre actúa desde el panel /admin usando su
-- propia sesión (is_admin() = true le da acceso vía la policy de
-- arriba; el REVOKE de columna no le afecta porque a continuación
-- le otorgamos el privilegio completo explícitamente).
revoke update on public.posts from authenticated;
grant update (
  title, slug, description, category_id, location_id,
  contact_phone, contact_whatsapp, contact_email
) on public.posts to authenticated;

-- Los ADMIN necesitan poder actualizar status/rejection_reason. Como
-- el rol `authenticated` es compartido por todos los usuarios
-- logueados (no hay un rol Postgres separado para ADMIN), se resuelve
-- con una función SECURITY DEFINER dedicada en vez de una columna
-- abierta a todo `authenticated`.
create function public.admin_review_post(
  target_post_id uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado: se requiere rol ADMIN.';
  end if;

  if new_status not in ('PUBLISHED', 'REJECTED', 'PAUSED', 'DELETED') then
    raise exception 'Transición de estado inválida para moderación: %', new_status;
  end if;

  update public.posts
  set status = new_status,
      rejection_reason = case when new_status = 'REJECTED' then reason else null end
  where id = target_post_id;
end;
$$;

comment on function public.admin_review_post(uuid, text, text) is
  'Único camino permitido para que un post pase a PUBLISHED/REJECTED/PAUSED/DELETED. Verifica is_admin() internamente.';

-- Un autor sí puede pausar o eliminar (lógicamente) su propio post,
-- eso es una acción legítima de autogestión, no de moderación.
create function public.author_set_post_status(target_post_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner boolean;
begin
  select (author_id = auth.uid()) into is_owner
  from public.posts where id = target_post_id;

  if not coalesce(is_owner, false) then
    raise exception 'No autorizado: no eres el autor de esta publicación.';
  end if;

  if new_status not in ('PAUSED', 'DELETED', 'PENDING') then
    raise exception 'Transición de estado inválida para el autor: %', new_status;
  end if;

  update public.posts set status = new_status where id = target_post_id;
end;
$$;

comment on function public.author_set_post_status(uuid, text) is
  'Permite al autor pausar, eliminar o reactivar (a PENDING, para re-moderación) su propia publicación.';

-- DELETE físico: preferimos DELETED lógico (arriba) para conservar
-- historial, pero se permite DELETE real al autor o admin por si se
-- requiere borrado definitivo de datos personales (ver Privacidad).
create policy "posts_delete_own_or_admin"
  on public.posts for delete
  using (auth.uid() = author_id or public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- business_profiles
-- ═══════════════════════════════════════════════════════════════
alter table public.business_profiles enable row level security;

create policy "business_profiles_select_all"
  on public.business_profiles for select
  using (true); -- por diseño, el perfil de negocio es público

create policy "business_profiles_insert_own"
  on public.business_profiles for insert
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'BUSINESS')
  );

create policy "business_profiles_update_own_or_admin"
  on public.business_profiles for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

create policy "business_profiles_delete_own_or_admin"
  on public.business_profiles for delete
  using (profile_id = auth.uid() or public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- reports
-- ═══════════════════════════════════════════════════════════════
alter table public.reports enable row level security;

create policy "reports_insert_own"
  on public.reports for insert
  with check (reporter_id = auth.uid());

create policy "reports_select_admin_only"
  on public.reports for select
  using (public.is_admin());

create policy "reports_update_admin_only"
  on public.reports for update
  using (public.is_admin())
  with check (public.is_admin());

-- No hay policy de DELETE: los reportes no se eliminan, quedan como
-- registro (se pueden marcar DISMISSED vía update).
