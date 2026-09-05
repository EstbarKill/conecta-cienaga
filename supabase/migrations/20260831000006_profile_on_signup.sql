-- ═══════════════════════════════════════════════════════════════
-- Migración 2.6 — Trigger: crear profile al registrarse
-- ═══════════════════════════════════════════════════════════════
-- Corresponde al Bloque 2.6. Cuando Supabase Auth inserta una fila en
-- auth.users (registro), este trigger crea automáticamente la fila
-- correspondiente en public.profiles con role = 'USER' por defecto.
--
-- full_name se toma de raw_user_meta_data si el formulario de
-- registro lo envía (ej. { "full_name": "Juan Pérez" }); si no viene,
-- se usa un placeholder editable después desde /perfil.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Usuario'),
    'USER'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Crea automáticamente la fila de profiles cuando Supabase Auth registra un nuevo usuario. role siempre inicia en USER; el cambio a BUSINESS/ADMIN se hace después vía admin_set_role().';
