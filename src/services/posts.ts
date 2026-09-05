import type { SupabaseClient } from '@supabase/supabase-js';
import { generateUniqueSlug } from '../utils/slug';
import { sanitizeSearchText } from '../utils/search';
import type {
  AuthorPostAction,
  CreatePostInput,
  PostType,
  PostWithRelations,
  UpdatePostInput,
} from '../types/database';

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Forma cruda de una fila de `posts` tal como la devuelve Supabase con
 * el join a categories/locations. Se usa temporalmente en vez de tipos
 * generados automáticamente (`supabase gen types typescript`, ver
 * supabase/DATABASE.md) porque el proyecto real aún no tiene ese paso
 * de generación en el flujo de desarrollo. Cuando se agregue, este
 * tipo se reemplaza por el generado y esta capa queda igual.
 */
interface RawPostRow {
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
  contact_phone?: string | null;
  contact_whatsapp?: string | null;
  contact_email?: string | null;
  categories: { name: string; slug: string } | null;
  locations: { municipio: string; departamento: string } | null;
}

// Columnas que se exponen en listados/detalle público. NUNCA incluye
// contact_phone / contact_whatsapp / contact_email — esas solo viajan
// vía getPostContact() (RPC) o cuando quien consulta es el autor
// (getPostForOwner), donde sí se seleccionan explícitamente.
const PUBLIC_POST_COLUMNS: string =
  'id, author_id, type, category_id, location_id, title, slug, description, address, status, rejection_reason, created_at, updated_at, expires_at, categories ( name, slug ), locations ( municipio, departamento )';

const OWNER_POST_COLUMNS: string =
  'id, author_id, type, category_id, location_id, title, slug, description, address, status, rejection_reason, created_at, updated_at, expires_at, contact_phone, contact_whatsapp, contact_email, categories ( name, slug ), locations ( municipio, departamento )';

/**
 * Convierte el resultado crudo de Supabase (tipado como
 * `GenericStringError` porque el proyecto aún no usa tipos generados,
 * ver comentario de RawPostRow arriba) a la forma que realmente tiene
 * en tiempo de ejecución. Único punto de la capa de servicios donde se
 * hace esta conversión — todo lo demás usa tipos correctos.
 */
function asRawRows(data: unknown): RawPostRow[] {
  return (data ?? []) as RawPostRow[];
}

function asRawRow(data: unknown): RawPostRow | null {
  return (data ?? null) as RawPostRow | null;
}

function mapRow(row: RawPostRow, includeContact: boolean): PostWithRelations {
  return {
    id: row.id,
    authorId: row.author_id,
    type: row.type as PostWithRelations['type'],
    categoryId: row.category_id,
    locationId: row.location_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    address: row.address,
    status: row.status as PostWithRelations['status'],
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    categoryName: row.categories?.name ?? '',
    categorySlug: row.categories?.slug ?? '',
    municipio: row.locations?.municipio ?? '',
    departamento: row.locations?.departamento ?? '',
    ...(includeContact
      ? {
          contactPhone: row.contact_phone,
          contactWhatsapp: row.contact_whatsapp,
          contactEmail: row.contact_email,
        }
      : {}),
  };
}

/**
 * Crea una publicación nueva. `status` siempre inicia en PENDING (la
 * política RLS de INSERT no permite otro valor salvo DRAFT) — toda
 * publicación pasa por moderación, como se aprobó en el diseño.
 */
export async function createPost(
  supabase: SupabaseClient,
  authorId: string,
  input: CreatePostInput
): Promise<ServiceResult<{ slug: string }>> {
  const slug = await generateUniqueSlug(supabase, input.title);

  const { error } = await supabase.from('posts').insert({
    author_id: authorId,
    type: input.type,
    category_id: input.categoryId,
    location_id: input.locationId,
    title: input.title,
    slug,
    description: input.description,
    address: input.address,
    contact_phone: input.contactPhone,
    contact_whatsapp: input.contactWhatsapp,
    contact_email: input.contactEmail,
    status: 'PENDING',
  });

  if (error) {
    console.error('[posts] createPost', error.message);
    return { success: false, error: 'No pudimos publicar tu oportunidad. Intenta de nuevo.' };
  }

  return { success: true, data: { slug } };
}

/**
 * Actualiza los campos editables de una publicación propia. `status`
 * y `rejection_reason` quedan fuera a propósito: están protegidos a
 * nivel de columna en la base de datos (ver migración de RLS), así
 * que ni siquiera se intentan aquí.
 */
export async function updatePost(
  supabase: SupabaseClient,
  postId: string,
  input: UpdatePostInput
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from('posts')
    .update({
      title: input.title,
      description: input.description,
      address: input.address,
      category_id: input.categoryId,
      location_id: input.locationId,
      contact_phone: input.contactPhone,
      contact_whatsapp: input.contactWhatsapp,
      contact_email: input.contactEmail,
    })
    .eq('id', postId);

  if (error) {
    console.error('[posts] updatePost', error.message);
    return { success: false, error: 'No pudimos guardar los cambios. Intenta de nuevo.' };
  }

  return { success: true, data: null };
}

/**
 * Publicación propia por ID (para el formulario de edición). Filtra
 * explícitamente por author_id además de confiar en RLS — defensa en
 * profundidad, y evita filtrar por RLS silenciosamente cuando en
 * realidad queremos un 404 claro si el post no es del usuario.
 */
export async function getPostById(
  supabase: SupabaseClient,
  postId: string,
  authorId: string
): Promise<PostWithRelations | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(OWNER_POST_COLUMNS)
    .eq('id', postId)
    .eq('author_id', authorId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[posts] getPostById', error.message);
    return null;
  }

  const row = asRawRow(data);
  if (!row) return null;
  return mapRow(row, true);
}

/** Publicaciones del usuario autenticado, en cualquier estado. */
export async function getMyPosts(
  supabase: SupabaseClient,
  authorId: string
): Promise<PostWithRelations[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(OWNER_POST_COLUMNS)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[posts] getMyPosts', error.message);
    return [];
  }

  return asRawRows(data).map((row) => mapRow(row, true));
}

/**
 * Detalle de una publicación por slug. Si `currentUserId` coincide
 * con el autor, se incluye el contacto directamente (son sus propios
 * datos) y se ve en cualquier estado. Si no, solo se ve si está
 * PUBLISHED y no expiró (lo aplica RLS; si la fila no es visible,
 * Supabase simplemente no la devuelve — de ahí sale un 404 natural).
 */
export async function getPostBySlug(
  supabase: SupabaseClient,
  slug: string,
  currentUserId: string | null
): Promise<{ post: PostWithRelations; isOwner: boolean } | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(currentUserId ? OWNER_POST_COLUMNS : PUBLIC_POST_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[posts] getPostBySlug', error.message);
    return null;
  }

  const row = asRawRow(data);
  if (!row) return null;

  const isOwner = currentUserId !== null && row.author_id === currentUserId;
  return { post: mapRow(row, isOwner), isOwner };
}

/**
 * Obtiene el contacto de una publicación pública vía la función RPC
 * get_post_contact (exige sesión y post PUBLISHED). Se usa solo tras
 * el clic explícito de "ver contacto" — nunca de forma automática.
 */
export async function getPostContact(
  supabase: SupabaseClient,
  postId: string
): Promise<ServiceResult<{ phone: string | null; whatsapp: string | null; email: string | null }>> {
  const { data, error } = await supabase.rpc('get_post_contact', { target_post_id: postId });

  if (error || !data || data.length === 0) {
    return {
      success: false,
      error:
        error?.message === 'Debes iniciar sesión para ver el contacto.'
          ? error.message
          : 'No pudimos cargar el contacto de esta publicación.',
    };
  }

  const row = data[0];
  return {
    success: true,
    data: { phone: row.contact_phone, whatsapp: row.contact_whatsapp, email: row.contact_email },
  };
}

/**
 * Cambia el estado de una publicación propia (pausar, eliminar
 * lógicamente, o reenviar a revisión) vía la función RPC
 * author_set_post_status, que valida autoría internamente.
 */
export async function setAuthorPostStatus(
  supabase: SupabaseClient,
  postId: string,
  action: AuthorPostAction
): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('author_set_post_status', {
    target_post_id: postId,
    new_status: action,
  });

  if (error) {
    console.error('[posts] setAuthorPostStatus', error.message);
    return { success: false, error: 'No pudimos actualizar la publicación.' };
  }

  return { success: true, data: null };
}

export interface SearchFilters {
  text?: string;
  categoryId?: number;
  type?: PostType;
  locationId?: number;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  posts: PostWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Búsqueda pública de oportunidades. Solo devuelve publicaciones
 * PUBLISHED y no expiradas — nunca se filtra por status desde fuera,
 * para que esta función no pueda usarse accidentalmente para listar
 * contenido no público.
 */
export async function searchPosts(
  supabase: SupabaseClient,
  filters: SearchFilters
): Promise<SearchResult> {
  const page = Math.max(1, filters.page);
  const pageSize = Math.min(Math.max(1, filters.pageSize), 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('posts')
    .select(PUBLIC_POST_COLUMNS, { count: 'exact' })
    .eq('status', 'PUBLISHED')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.locationId) query = query.eq('location_id', filters.locationId);

  const cleanText = filters.text ? sanitizeSearchText(filters.text) : '';
  if (cleanText) {
    const pattern = `%${cleanText}%`;
    query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[posts] searchPosts', error.message);
    return { posts: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const posts = asRawRows(data).map((row) => mapRow(row, false));
  const total = count ?? 0;

  return { posts, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Publicaciones recientes para la home. Caso especial de búsqueda sin
 * filtros con un tamaño de página pequeño — se mantiene como función
 * separada para no acoplar la home a la paginación de /explorar.
 */
export async function getRecentPosts(
  supabase: SupabaseClient,
  limit: number = 6
): Promise<PostWithRelations[]> {
  const result = await searchPosts(supabase, { page: 1, pageSize: limit });
  return result.posts;
}
