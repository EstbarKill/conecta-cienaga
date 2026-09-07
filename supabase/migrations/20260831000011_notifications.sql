-- ═══════════════════════════════════════════════════════════════
-- Migración 2.12 — Notificaciones en la app
-- ═══════════════════════════════════════════════════════════════
-- Notificaciones in-app (el contador junto al avatar). El envío de
-- correo (Edge Function + Database Webhook) es un mecanismo aparte,
-- configurado fuera de las migraciones — ver supabase/functions/
-- notify-post-status/ y las instrucciones en DATABASE.md.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('POST_PUBLISHED', 'POST_REJECTED')),
  message text not null,
  link text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Notificaciones in-app. Solo se crean desde funciones SECURITY DEFINER del sistema (ej. admin_review_post), nunca directamente por el cliente.';

create index notifications_user_unread_idx on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

-- El usuario ve y actualiza (marcar leído) solo sus propias
-- notificaciones. No hay policy de INSERT para `authenticated` — solo
-- se crean vía funciones SECURITY DEFINER, igual que profiles.
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── admin_review_post ahora también notifica al autor ───────────────
create or replace function public.admin_review_post(
  target_post_id uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_title text;
  v_slug text;
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
  where id = target_post_id
  returning author_id, title, slug into v_author_id, v_title, v_slug;

  if new_status = 'PUBLISHED' then
    insert into public.notifications (user_id, type, message, link)
    values (
      v_author_id, 'POST_PUBLISHED',
      format('Tu publicación "%s" fue aprobada y ya es visible.', v_title),
      '/oportunidad/' || v_slug
    );
  elsif new_status = 'REJECTED' then
    insert into public.notifications (user_id, type, message, link)
    values (
      v_author_id, 'POST_REJECTED',
      format('Tu publicación "%s" fue rechazada.%s', v_title,
             case when reason is not null then ' Motivo: ' || reason else '' end),
      '/oportunidad/' || v_slug
    );
  end if;
end;
$$;

comment on function public.admin_review_post(uuid, text, text) is
  'Único camino permitido para que un post pase a PUBLISHED/REJECTED/PAUSED/DELETED. Verifica is_admin() internamente y notifica al autor cuando el resultado es PUBLISHED o REJECTED.';
