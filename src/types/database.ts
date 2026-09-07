/**
 * Tipos de dominio de Conecta Ciénaga.
 *
 * Estos tipos reflejan el modelo de datos aprobado (Fase 06). Cuando la
 * primera migración exista en Supabase, se recomienda generar los tipos
 * oficiales con `supabase gen types typescript` y hacer convivir ambos
 * (los generados para las tablas tal cual, estos para DTOs de dominio
 * usados en la capa de servicios). No se generan aún porque no hay
 * proyecto de Supabase provisionado en este bloque.
 */

export type UserRole = 'USER' | 'BUSINESS' | 'ADMIN';

export type PostType = 'EMPLOYMENT' | 'SERVICE' | 'JOB_SEEKER';

export type PostStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'PAUSED'
  | 'EXPIRED'
  | 'DELETED';

export type ReportReason =
  | 'ESTAFA'
  | 'CONTENIDO_FALSO'
  | 'SPAM'
  | 'CONTENIDO_OFENSIVO'
  | 'OFERTA_SOSPECHOSA'
  | 'INFO_INCORRECTA'
  | 'OTRO';

export type ReportStatus = 'PENDING' | 'REVIEWED' | 'DISMISSED';

export interface Profile {
  id: string;
  role: UserRole;
  fullName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProfile {
  id: string;
  profileId: string;
  businessName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  createdAt: string;
}

export interface Location {
  id: number;
  municipio: string;
  departamento: string;
  pais: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
}

/**
 * Post público: lo que puede verse sin hacer clic en "ver contacto".
 * Nunca incluye contact_phone / contact_whatsapp / contact_email.
 */
export interface Post {
  id: string;
  authorId: string;
  type: PostType;
  categoryId: number;
  locationId: number;
  title: string;
  slug: string;
  description: string;
  address: string | null;
  status: PostStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * Datos de contacto de un post. Solo se obtienen mediante la función RPC
 * get_post_contact(post_id), nunca en el SELECT inicial del listado.
 */
export interface PostContact {
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
}

export interface Report {
  id: string;
  postId: string;
  reporterId: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
}

/**
 * Post con nombre de categoría y ubicación ya resueltos, para listados
 * y detalle. `contact*` solo viene poblado cuando quien consulta es el
 * propio autor (ver services/posts.ts) — para cualquier otro caso se
 * omite deliberadamente en la consulta a la base de datos.
 */
export interface PostWithRelations extends Post {
  categoryName: string;
  categorySlug: string;
  municipio: string;
  departamento: string;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  contactEmail?: string | null;
}

export interface CreatePostInput {
  type: PostType;
  categoryId: number;
  locationId: number;
  title: string;
  description: string;
  address: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
}

export type UpdatePostInput = Omit<CreatePostInput, 'type'>;

export type AuthorPostAction = 'PAUSED' | 'DELETED' | 'PENDING';

export interface UpdateProfileInput {
  fullName: string;
  phone: string | null;
  whatsapp: string | null;
}

export interface UpsertBusinessProfileInput {
  businessName: string;
  description: string | null;
}

/** Reporte con el título del post y el nombre de quien reportó, para el panel admin. */
export interface ReportWithRelations extends Report {
  postTitle: string;
  postSlug: string;
  postStatus: PostStatus;
  reporterName: string;
}

/** Post con el nombre del autor, para la cola de moderación. */
export interface PostWithAuthor extends PostWithRelations {
  authorName: string;
  authorEmail: string | null;
}

export interface DashboardStats {
  pendingPosts: number;
  publishedPosts: number;
  pausedPosts: number;
  rejectedPosts: number;
  pendingReports: number;
  totalUsers: number;
  businessUsers: number;
}

export type NotificationType = 'POST_PUBLISHED' | 'POST_REJECTED';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}
