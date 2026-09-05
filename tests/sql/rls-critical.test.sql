-- ═══════════════════════════════════════════════════════════════
-- tests/sql/rls-critical.test.sql
-- ═══════════════════════════════════════════════════════════════
-- Suite de regresión de los casos críticos de seguridad exigidos por
-- la sección 34 del estándar técnico. Automatiza las pruebas que se
-- hicieron manualmente durante el desarrollo de cada bloque.
--
-- ⚠️  SOLO correr contra una base de datos DESECHABLE con el esquema
-- ya migrado (las 9 migraciones + este archivo). NUNCA contra
-- producción — crea e intenta modificar datos de prueba.
--
-- Cómo correrlo (con Supabase local):
--   supabase start
--   supabase db reset          # aplica migraciones + seed
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
--        -v ON_ERROR_STOP=1 -f tests/sql/rls-critical.test.sql
--
-- O contra cualquier Postgres con el esquema ya aplicado:
--   psql "postgres://user:pass@host:5432/dbname" \
--        -v ON_ERROR_STOP=1 -f tests/sql/rls-critical.test.sql
--
-- Si CUALQUIER prueba falla, el script se detiene inmediatamente
-- (ON_ERROR_STOP=1 + RAISE EXCEPTION) y muestra cuál fue.

\set ON_ERROR_STOP on

-- ── Helper de aserción ───────────────────────────────────────────
create or replace function pg_temp.assert(condition boolean, msg text)
returns void language plpgsql as $$
begin
  if not condition then
    raise exception 'FALLÓ: %', msg;
  end if;
  raise notice 'PASS: %', msg;
end;
$$;

-- ── Fixtures ─────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'test-usuario-a@example.com', '{"full_name":"Usuario A test","account_type":"USER"}'),
  ('a0000000-0000-0000-0000-000000000002', 'test-usuario-b@example.com', '{"full_name":"Usuario B test","account_type":"USER"}'),
  ('a0000000-0000-0000-0000-000000000003', 'test-negocio@example.com', '{"full_name":"Negocio test","account_type":"BUSINESS"}'),
  ('a0000000-0000-0000-0000-000000000004', 'test-admin@example.com', '{"full_name":"Admin test"}')
on conflict (id) do nothing;

update public.profiles set role = 'ADMIN' where id = 'a0000000-0000-0000-0000-000000000004';

insert into public.locations (municipio, departamento, pais)
values ('Ciénaga (test)', 'Magdalena', 'Colombia')
on conflict (municipio, departamento, pais) do nothing;

insert into public.categories (name, slug)
values ('Categoría de prueba', 'categoria-de-prueba-rls')
on conflict (slug) do nothing;

do $$
declare
  v_location_id int;
  v_category_id int;
begin
  select id into v_location_id from public.locations where municipio = 'Ciénaga (test)' limit 1;
  select id into v_category_id from public.categories where slug = 'categoria-de-prueba-rls' limit 1;

  insert into public.posts (
    id, author_id, type, category_id, location_id, title, slug, description,
    contact_whatsapp, status
  ) values (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002', -- autor: Usuario B
    'SERVICE', v_category_id, v_location_id,
    'Post de prueba de Usuario B', 'post-de-prueba-usuario-b-rls',
    'Descripción de prueba para el test de RLS, con longitud suficiente.',
    '3000000000', 'PENDING'
  )
  on conflict (id) do nothing;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- TEST 1 — El trigger de registro asigna el role correcto
-- ═══════════════════════════════════════════════════════════════
select pg_temp.assert(
  (select role from public.profiles where id = 'a0000000-0000-0000-0000-000000000001') = 'USER',
  'El trigger asigna USER cuando account_type = USER'
);
select pg_temp.assert(
  (select role from public.profiles where id = 'a0000000-0000-0000-0000-000000000003') = 'BUSINESS',
  'El trigger asigna BUSINESS cuando account_type = BUSINESS'
);
select pg_temp.assert(
  (select email from public.profiles where id = 'a0000000-0000-0000-0000-000000000001')
    = 'test-usuario-a@example.com',
  'El trigger copia el email desde auth.users'
);

-- ═══════════════════════════════════════════════════════════════
-- TEST 2 — Usuario A NO puede modificar el post de Usuario B
-- ═══════════════════════════════════════════════════════════════
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000001';

do $$
declare
  v_rows int;
begin
  update public.posts set title = 'Hackeado por A'
  where id = 'b0000000-0000-0000-0000-000000000001';
  get diagnostics v_rows = row_count;
  perform pg_temp.assert(v_rows = 0, 'Usuario A no puede modificar el post de Usuario B (RLS bloquea la fila)');
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════
-- TEST 3 — Usuario B SÍ puede modificar su propio post
-- ═══════════════════════════════════════════════════════════════
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000002';

do $$
declare
  v_rows int;
begin
  update public.posts set title = 'Post actualizado por su dueño'
  where id = 'b0000000-0000-0000-0000-000000000001';
  get diagnostics v_rows = row_count;
  perform pg_temp.assert(v_rows = 1, 'Usuario B puede modificar su propio post');
end $$;

-- ── TEST 4 — Usuario B NO puede auto-publicarse (columna protegida) ──
do $$
begin
  begin
    update public.posts set status = 'PUBLISHED'
    where id = 'b0000000-0000-0000-0000-000000000001';
    perform pg_temp.assert(false, 'Usuario B NO puede cambiar status directamente (se esperaba error)');
  exception when insufficient_privilege then
    perform pg_temp.assert(true, 'Usuario B no puede auto-publicarse (columna status protegida)');
  end;
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════
-- TEST 5 — Solo ADMIN puede aprobar publicaciones (admin_review_post)
-- ═══════════════════════════════════════════════════════════════
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000002'; -- Usuario B (no admin)

do $$
begin
  begin
    perform public.admin_review_post('b0000000-0000-0000-0000-000000000001', 'PUBLISHED', null);
    perform pg_temp.assert(false, 'Usuario no-admin NO debería poder aprobar posts (se esperaba error)');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%ADMIN%', 'Usuario no-admin no puede aprobar posts');
  end;
end $$;

reset role;
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000004'; -- Admin

do $$
begin
  perform public.admin_review_post('b0000000-0000-0000-0000-000000000001', 'PUBLISHED', null);
  perform pg_temp.assert(
    (select status from public.posts where id = 'b0000000-0000-0000-0000-000000000001') = 'PUBLISHED',
    'Admin puede aprobar (PUBLISHED) una publicación vía admin_review_post()'
  );
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════
-- TEST 6 — get_post_contact exige sesión autenticada
-- ═══════════════════════════════════════════════════════════════
set role anon;
set myapp.uid = '';

do $$
begin
  begin
    perform * from public.get_post_contact('b0000000-0000-0000-0000-000000000001');
    perform pg_temp.assert(false, 'Visitante sin sesión NO debería poder ver el contacto (se esperaba error)');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%iniciar sesión%', 'Visitante sin sesión no puede ver el contacto de un post');
  end;
end $$;

reset role;
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000001';

do $$
declare
  v_whatsapp text;
begin
  select contact_whatsapp into v_whatsapp
  from public.get_post_contact('b0000000-0000-0000-0000-000000000001');
  perform pg_temp.assert(v_whatsapp = '3000000000', 'Usuario autenticado sí puede ver el contacto de un post PUBLISHED');
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════
-- TEST 7 — Un admin no puede desactivarse ni degradarse a sí mismo
-- ═══════════════════════════════════════════════════════════════
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000004';

do $$
begin
  begin
    perform public.admin_set_profile_active('a0000000-0000-0000-0000-000000000004', false);
    perform pg_temp.assert(false, 'Admin no debería poder desactivarse a sí mismo (se esperaba error)');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%propia cuenta%', 'Admin no puede desactivar su propia cuenta');
  end;

  begin
    perform public.admin_set_role('a0000000-0000-0000-0000-000000000004', 'USER');
    perform pg_temp.assert(false, 'Admin no debería poder quitarse ADMIN a sí mismo (se esperaba error)');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%ADMIN a ti mismo%', 'Admin no puede quitarse el rol ADMIN a sí mismo');
  end;
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════
-- TEST 8 — Solo BUSINESS puede crear business_profiles
-- ═══════════════════════════════════════════════════════════════
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000001'; -- Usuario A, role USER

do $$
begin
  begin
    insert into public.business_profiles (profile_id, business_name, slug)
    values ('a0000000-0000-0000-0000-000000000001', 'Negocio falso', 'negocio-falso-rls-test');
    perform pg_temp.assert(false, 'Usuario USER no debería poder crear business_profile (se esperaba error)');
  exception when insufficient_privilege then
    perform pg_temp.assert(true, 'Usuario con role USER no puede crear un business_profile');
  end;
end $$;

reset role;
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000003'; -- Negocio, role BUSINESS

do $$
declare
  v_rows int;
begin
  insert into public.business_profiles (profile_id, business_name, slug)
  values ('a0000000-0000-0000-0000-000000000003', 'Negocio de prueba', 'negocio-de-prueba-rls-test')
  on conflict (profile_id) do nothing;
  select count(*) into v_rows from public.business_profiles
  where profile_id = 'a0000000-0000-0000-0000-000000000003';
  perform pg_temp.assert(v_rows = 1, 'Usuario con role BUSINESS sí puede crear su business_profile');
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════
-- TEST 9 — Un usuario no puede reportar dos veces la misma publicación
-- ═══════════════════════════════════════════════════════════════
set role authenticated;
set myapp.uid = 'a0000000-0000-0000-0000-000000000001';

insert into public.reports (post_id, reporter_id, reason)
values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SPAM');

do $$
begin
  begin
    insert into public.reports (post_id, reporter_id, reason)
    values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'OTRO');
    perform pg_temp.assert(false, 'No debería permitirse un segundo reporte del mismo usuario sobre el mismo post');
  exception when unique_violation then
    perform pg_temp.assert(true, 'Un usuario no puede reportar dos veces la misma publicación (constraint unique)');
  end;
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════
-- Limpieza de datos de prueba
-- ═══════════════════════════════════════════════════════════════
delete from public.reports where post_id = 'b0000000-0000-0000-0000-000000000001';
delete from public.posts where id = 'b0000000-0000-0000-0000-000000000001';
delete from public.business_profiles where profile_id = 'a0000000-0000-0000-0000-000000000003';
delete from auth.users where id in (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004'
);
delete from public.categories where slug = 'categoria-de-prueba-rls';
delete from public.locations where municipio = 'Ciénaga (test)';

\echo '════════════════════════════════════════'
\echo '  TODAS LAS PRUEBAS PASARON ✅'
\echo '════════════════════════════════════════'
