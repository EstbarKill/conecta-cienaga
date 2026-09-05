-- ═══════════════════════════════════════════════════════════════
-- Migración 2.10 — Funciones y datos para el panel de administración
-- ═══════════════════════════════════════════════════════════════
-- Bloque 7: el panel /admin necesita (a) poder identificar usuarios
-- por correo (no solo por nombre), y (b) una función para
-- activar/desactivar cuentas, ya que is_active está protegida a
-- nivel de columna igual que role. También se añade una protección
-- para que ningún admin pueda desactivarse o quitarse el rol ADMIN a
-- sí mismo por error.

-- ── profiles.email ───────────────────────────────────────────────
alter table public.profiles add column email text;

comment on column public.profiles.email is
  'Copia del correo de auth.users, mantenida por handle_new_user(). Existe porque auth.users no es consultable vía PostgREST/RLS desde el cliente — el panel admin necesita mostrar el correo de cada usuario.';

-- Backfill para cuentas creadas antes de esta migración. Se ejecuta
-- con privilegios de quien corre la migración (postgres/CLI), que sí
-- puede leer auth.users directamente.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- El trigger de registro ahora también copia el email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'account_type', 'USER');

  if requested_role not in ('USER', 'BUSINESS') then
    requested_role := 'USER';
  end if;

  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Usuario'),
    requested_role,
    new.email
  );
  return new;
end;
$$;

-- ── Protección anti-autobloqueo en admin_set_role ───────────────────
create or replace function public.admin_set_role(target_profile_id uuid, new_role text)
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

  if target_profile_id = auth.uid() and new_role <> 'ADMIN' then
    raise exception 'No puedes quitarte el rol ADMIN a ti mismo.';
  end if;

  update public.profiles set role = new_role where id = target_profile_id;
end;
$$;

-- ── Nueva función: activar/desactivar una cuenta ────────────────────
create function public.admin_set_profile_active(target_profile_id uuid, new_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado: se requiere rol ADMIN.';
  end if;

  if target_profile_id = auth.uid() and new_is_active = false then
    raise exception 'No puedes desactivar tu propia cuenta.';
  end if;

  update public.profiles set is_active = new_is_active where id = target_profile_id;
end;
$$;

comment on function public.admin_set_profile_active(uuid, boolean) is
  'Único camino para activar/desactivar una cuenta (is_active está protegida a nivel de columna). Verifica is_admin() y evita que un admin se desactive a sí mismo.';
