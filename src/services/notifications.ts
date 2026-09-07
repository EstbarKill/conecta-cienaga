import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppNotification } from '../types/database';

/**
 * Cantidad de notificaciones sin leer. Se usa en el middleware para
 * mostrar el contador junto al avatar en cada página — se mantiene
 * como una consulta liviana (`count: 'exact', head: true`), sin traer
 * las filas completas.
 */
export async function getUnreadCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('[notifications] getUnreadCount', error.message);
    return 0;
  }

  return count ?? 0;
}

interface RawNotificationRow {
  id: string;
  user_id: string;
  type: string;
  message: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

function mapNotification(row: RawNotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as AppNotification['type'],
    message: row.message,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Las notificaciones más recientes del usuario (leídas y no leídas). */
export async function getMyNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, message, link, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[notifications] getMyNotifications', error.message);
    return [];
  }

  return (data as unknown as RawNotificationRow[]).map(mapNotification);
}

/** Marca todas las notificaciones sin leer del usuario como leídas. */
export async function markAllAsRead(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('[notifications] markAllAsRead', error.message);
  }
}
