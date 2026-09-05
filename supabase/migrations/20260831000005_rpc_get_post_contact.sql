-- ═══════════════════════════════════════════════════════════════
-- Migración 2.5 — RPC get_post_contact
-- ═══════════════════════════════════════════════════════════════
-- Corresponde al Bloque 2.5. Implementa la decisión de negocio
-- aprobada: el contacto solo es visible para usuarios autenticados
-- que hacen clic explícito ("ver contacto"). Las columnas de contacto
-- de `posts` nunca viajan en el SELECT normal del listado/detalle.

create function public.get_post_contact(target_post_id uuid)
returns table (
  contact_phone text,
  contact_whatsapp text,
  contact_email text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para ver el contacto.'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  if not exists (
    select 1 from public.posts
    where id = target_post_id and status = 'PUBLISHED' and expires_at > now()
  ) then
    raise exception 'Publicación no disponible.';
  end if;

  return query
    select p.contact_phone, p.contact_whatsapp, p.contact_email
    from public.posts p
    where p.id = target_post_id;
end;
$$;

comment on function public.get_post_contact(uuid) is
  'Único camino para obtener datos de contacto de una publicación. Exige autenticación y que el post esté PUBLISHED. El frontend la llama solo tras un clic explícito en "ver contacto".';

-- Se otorga también a `anon` a propósito: así un visitante sin sesión
-- recibe el mensaje claro "Debes iniciar sesión..." generado dentro
-- de la función, en vez de un genérico "permission denied" de
-- Postgres que sería más difícil de traducir en la UI.
grant execute on function public.get_post_contact(uuid) to authenticated, anon;
