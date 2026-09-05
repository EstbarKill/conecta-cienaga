import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportReason } from '../types/database';

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string };

export async function createReport(
  supabase: SupabaseClient,
  reporterId: string,
  postId: string,
  reason: ReportReason,
  description: string | null
): Promise<ServiceResult<null>> {
  const { error } = await supabase.from('reports').insert({
    post_id: postId,
    reporter_id: reporterId,
    reason,
    description,
  });

  if (error) {
    // Violación de unique (post_id, reporter_id): ya reportó este post antes.
    if (error.code === '23505') {
      return { success: false, error: 'Ya reportaste esta publicación anteriormente.' };
    }
    console.error('[reports] createReport', error.message);
    return { success: false, error: 'No pudimos enviar tu reporte. Intenta de nuevo.' };
  }

  return { success: true, data: null };
}
