import type { SupabaseClient } from '@supabase/supabase-js';
import { generateUniqueSlug } from '../utils/slug';
import type {
  Category,
  DashboardStats,
  Profile,
  PostWithAuthor,
  ReportWithRelations,
  ReportStatus,
} from '../types/database';

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string };

const MODERATION_POST_COLUMNS =
  'id, author_id, type, category_id, location_id, title, slug, description, address, status, rejection_reason, created_at, updated_at, expires_at, contact_phone, contact_whatsapp, contact_email, categories ( name, slug ), locations ( municipio, departamento ), profiles ( full_name, email )';

interface RawModerationRow {
  id: string;
  author_id: string;
  type: string;
  category_id: number;
  location_id: number;
  title: string;
  slug: string;
  description: string;
  address: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_email: string | null;
  categories: { name: string; slug: string } | null;
  locations: { municipio: string; departamento: string } | null;
  profiles: { full_name: string; email: string | null } | null;
}

function mapModerationRow(row: RawModerationRow): PostWithAuthor {
  return {
    id: row.id,
    authorId: row.author_id,
    type: row.type as PostWithAuthor['type'],
    categoryId: row.category_id,
    locationId: row.location_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    address: row.address,
    status: row.status as PostWithAuthor['status'],
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    categoryName: row.categories?.name ?? '',
    categorySlug: row.categories?.slug ?? '',
    municipio: row.locations?.municipio ?? '',
    departamento: row.locations?.departamento ?? '',
    contactPhone: row.contact_phone,
    contactWhatsapp: row.contact_whatsapp,
    contactEmail: row.contact_email,
    authorName: row.profiles?.full_name ?? 'Usuario',
    authorEmail: row.profiles?.email ?? null,
  };
}

/** Estadísticas rápidas para el resumen del dashboard. */
export async function getDashboardStats(supabase: SupabaseClient): Promise<DashboardStats> {
  const [pending, published, paused, rejected, reports, users, business] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'PAUSED'),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'REJECTED'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'BUSINESS'),
  ]);

  return {
    pendingPosts: pending.count ?? 0,
    publishedPosts: published.count ?? 0,
    pausedPosts: paused.count ?? 0,
    rejectedPosts: rejected.count ?? 0,
    pendingReports: reports.count ?? 0,
    totalUsers: users.count ?? 0,
    businessUsers: business.count ?? 0,
  };
}

/** Publicaciones en PENDING, las más antiguas primero (orden de llegada = orden de revisión). */
export async function getPendingPosts(supabase: SupabaseClient): Promise<PostWithAuthor[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(MODERATION_POST_COLUMNS)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[admin] getPendingPosts', error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawModerationRow[]).map(mapModerationRow);
}

/**
 * Aprueba, rechaza, pausa o elimina una publicación vía la función
 * RPC admin_review_post, que valida is_admin() internamente.
 */
export async function reviewPost(
  supabase: SupabaseClient,
  postId: string,
  status: 'PUBLISHED' | 'REJECTED' | 'PAUSED' | 'DELETED',
  reason: string | null = null
): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('admin_review_post', {
    target_post_id: postId,
    new_status: status,
    reason,
  });

  if (error) {
    console.error('[admin] reviewPost', error.message);
    return { success: false, error: 'No pudimos aplicar esa acción sobre la publicación.' };
  }

  return { success: true, data: null };
}

const REPORT_COLUMNS =
  'id, post_id, reporter_id, reason, description, status, created_at, posts ( title, slug, status ), profiles ( full_name )';

interface RawReportRow {
  id: string;
  post_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  posts: { title: string; slug: string; status: string } | null;
  profiles: { full_name: string } | null;
}

function mapReportRow(row: RawReportRow): ReportWithRelations {
  return {
    id: row.id,
    postId: row.post_id,
    reporterId: row.reporter_id,
    reason: row.reason as ReportWithRelations['reason'],
    description: row.description,
    status: row.status as ReportStatus,
    createdAt: row.created_at,
    postTitle: row.posts?.title ?? '(publicación eliminada)',
    postSlug: row.posts?.slug ?? '',
    postStatus: (row.posts?.status ?? 'DELETED') as ReportWithRelations['postStatus'],
    reporterName: row.profiles?.full_name ?? 'Usuario',
  };
}

/** Reportes filtrados por estado (por defecto, solo los pendientes de revisar). */
export async function getReports(
  supabase: SupabaseClient,
  status: ReportStatus = 'PENDING'
): Promise<ReportWithRelations[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(REPORT_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin] getReports', error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawReportRow[]).map(mapReportRow);
}

/** Marca un reporte como revisado o descartado (no se eliminan, quedan como historial). */
export async function updateReportStatus(
  supabase: SupabaseClient,
  reportId: string,
  status: 'REVIEWED' | 'DISMISSED'
): Promise<ServiceResult<null>> {
  const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);

  if (error) {
    console.error('[admin] updateReportStatus', error.message);
    return { success: false, error: 'No pudimos actualizar el reporte.' };
  }

  return { success: true, data: null };
}

/** Todas las categorías, incluidas las inactivas (a diferencia de getActiveCategories del catálogo público). */
export async function getAllCategories(supabase: SupabaseClient): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, is_active')
    .order('name');

  if (error) {
    console.error('[admin] getAllCategories', error.message);
    return [];
  }

  return data.map((c) => ({ id: c.id, name: c.name, slug: c.slug, isActive: c.is_active }));
}

export async function createCategory(supabase: SupabaseClient, name: string): Promise<ServiceResult<null>> {
  const slug = await generateUniqueSlug(supabase, name, 'categories');
  const { error } = await supabase.from('categories').insert({ name, slug });

  if (error) {
    console.error('[admin] createCategory', error.message);
    return { success: false, error: 'No pudimos crear la categoría.' };
  }

  return { success: true, data: null };
}

export async function setCategoryActive(
  supabase: SupabaseClient,
  categoryId: number,
  isActive: boolean
): Promise<ServiceResult<null>> {
  const { error } = await supabase.from('categories').update({ is_active: isActive }).eq('id', categoryId);

  if (error) {
    console.error('[admin] setCategoryActive', error.message);
    return { success: false, error: 'No pudimos actualizar la categoría.' };
  }

  return { success: true, data: null };
}

export async function deleteCategory(supabase: SupabaseClient, categoryId: number): Promise<ServiceResult<null>> {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId);

  if (error) {
    console.error('[admin] deleteCategory', error.message);
    // Violación de FK (23503): hay publicaciones usando esta categoría.
    if (error.code === '23503') {
      return { success: false, error: 'No se puede eliminar: hay publicaciones usando esta categoría. Desactívala en su lugar.' };
    }
    return { success: false, error: 'No pudimos eliminar la categoría.' };
  }

  return { success: true, data: null };
}

/** Usuarios más recientes primero. Sin paginación en el MVP — volumen bajo esperado. */
export async function getUsers(supabase: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, phone, whatsapp, avatar_url, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin] getUsers', error.message);
    return [];
  }

  return data.map((p) => ({
    id: p.id,
    role: p.role,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone,
    whatsapp: p.whatsapp,
    avatarUrl: p.avatar_url,
    isActive: p.is_active,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

export async function setUserActive(
  supabase: SupabaseClient,
  profileId: string,
  isActive: boolean
): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('admin_set_profile_active', {
    target_profile_id: profileId,
    new_is_active: isActive,
  });

  if (error) {
    console.error('[admin] setUserActive', error.message);
    return { success: false, error: error.message.includes('propia cuenta') ? error.message : 'No pudimos actualizar el usuario.' };
  }

  return { success: true, data: null };
}

export async function setUserRole(
  supabase: SupabaseClient,
  profileId: string,
  role: 'USER' | 'BUSINESS' | 'ADMIN'
): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('admin_set_role', {
    target_profile_id: profileId,
    new_role: role,
  });

  if (error) {
    console.error('[admin] setUserRole', error.message);
    return { success: false, error: error.message.includes('propio rol') ? error.message : 'No pudimos actualizar el rol.' };
  }

  return { success: true, data: null };
}
