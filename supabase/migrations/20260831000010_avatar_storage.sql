-- ═══════════════════════════════════════════════════════════════
-- Migración 2.11 — Storage: bucket de avatares
-- ═══════════════════════════════════════════════════════════════
-- Bucket público (los avatares son visibles públicamente, igual que
-- el resto de un perfil vía profiles_public). Cada usuario solo puede
-- escribir dentro de su propia carpeta: avatars/{user_id}/archivo.ext
--
-- ⚠️ Esta migración no se pudo validar contra un Postgres local como
-- las anteriores: el esquema `storage` de Supabase (con sus funciones
-- como storage.foldername()) es parte de la plataforma gestionada, no
-- algo que se pueda recrear fácilmente en un Postgres genérico. Sigue
-- el patrón oficial y ampliamente documentado de Supabase para
-- avatares — pero pruébala en tu proyecto real después de aplicarla.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Cualquiera puede ver los avatares (son públicos por diseño).
create policy "avatar_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Un usuario autenticado solo puede subir dentro de su propia
-- carpeta: el primer segmento de la ruta debe ser su propio user id.
create policy "avatar_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
