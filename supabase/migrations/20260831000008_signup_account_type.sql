-- ═══════════════════════════════════════════════════════════════
-- Migración 2.9 — Tipo de cuenta elegible en el registro
-- ═══════════════════════════════════════════════════════════════
-- Bloque 6: para que el perfil de negocio (business_profiles) tenga
-- sentido, alguien debe poder llegar a role = 'BUSINESS'. Se permite
-- elegirlo en el registro (USER o BUSINESS) porque no es una
-- escalada de privilegios — BUSINESS no tiene más permisos que USER,
-- solo habilita crear un business_profile. ADMIN sigue siendo
-- exclusivo de admin_set_role() (solo otro ADMIN puede otorgarlo).
--
-- CREATE OR REPLACE conserva el OID de la función, así que el
-- trigger existente (on_auth_user_created) sigue funcionando sin
-- necesidad de recrearlo.

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
    requested_role := 'USER'; -- ADMIN nunca es alcanzable desde el registro público
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Usuario'),
    requested_role
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea automáticamente la fila de profiles al registrarse. role viene de account_type en el metadata del signup (USER o BUSINESS); cualquier otro valor, incluido ADMIN, se ignora y cae a USER.';
