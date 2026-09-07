import type { SupabaseClient } from '@supabase/supabase-js';
import { generateUniqueSlug } from '../utils/slug';
import type { BusinessProfile, UpdateProfileInput, UpsertBusinessProfileInput } from '../types/database';

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Actualiza el perfil personal. `role` queda fuera a propósito: está
 * protegido a nivel de columna en la base de datos (ver migración de
 * RLS), así que ni se intenta enviar aquí.
 */
export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateProfileInput
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName,
      phone: input.phone,
      whatsapp: input.whatsapp,
    })
    .eq('id', userId);

  if (error) {
    console.error('[profile] updateProfile', error.message);
    return { success: false, error: 'No pudimos guardar los cambios de tu perfil.' };
  }

  return { success: true, data: null };
}

// MIME → extensión segura. Nunca se confía en el nombre de archivo
// que envía el navegador (podría contener caracteres raros o rutas);
// el nombre real en Storage siempre es fijo: {userId}/avatar.{ext}.
const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Sube un avatar a Supabase Storage y actualiza profiles.avatar_url.
 * Validaciones (sección 27 del estándar): tipo MIME permitido,
 * tamaño máximo. La ruta fija por usuario (upsert) evita acumular
 * archivos huérfanos y previene cualquier problema de nombre de
 * archivo controlado por el usuario.
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<ServiceResult<{ url: string }>> {
  const ext = ALLOWED_AVATAR_TYPES[file.type];
  if (!ext) {
    return { success: false, error: 'Formato no permitido. Usa una imagen JPG, PNG o WEBP.' };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { success: false, error: 'La imagen no puede pesar más de 2 MB.' };
  }
  if (file.size === 0) {
    return { success: false, error: 'El archivo está vacío.' };
  }

  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error('[profile] uploadAvatar (storage)', uploadError.message);
    return { success: false, error: 'No pudimos subir la imagen. Intenta de nuevo.' };
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Parámetro de caché para que el navegador/CDN muestren la imagen
  // nueva de inmediato en vez de servir la versión anterior cacheada
  // bajo la misma URL (mismo path siempre, por el upsert).
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);

  if (updateError) {
    console.error('[profile] uploadAvatar (profile update)', updateError.message);
    return { success: false, error: 'La imagen se subió, pero no pudimos actualizar tu perfil.' };
  }

  return { success: true, data: { url: publicUrl } };
}

/**
 * Sube el avatar inicial durante el registro, ANTES de que exista una
 * sesión del usuario (Supabase exige confirmar el correo primero, así
 * que no hay RLS-friendly session todavía). Usa el cliente con
 * Service Role Key (bypassa RLS) — es el único caso legítimo del
 * proyecto para esto fuera de las funciones administrativas.
 *
 * Importación dinámica a propósito: si falta
 * SUPABASE_SERVICE_ROLE_KEY en el entorno, el error queda CONTENIDO
 * aquí — el registro en sí (lo esencial) nunca debe romperse por
 * culpa de esta función opcional. Ver supabase.admin.ts.
 */
export async function adminSetInitialAvatar(userId: string, file: File): Promise<void> {
  try {
    const { supabaseAdmin } = await import('../config/supabase.admin');
    const result = await uploadAvatar(supabaseAdmin, userId, file);
    if (!result.success) {
      console.error('[profile] adminSetInitialAvatar', result.error);
    }
  } catch (err) {
    console.error('[profile] adminSetInitialAvatar — cliente admin no disponible, se omite el avatar', err);
  }
}

interface RawBusinessRow {
  id: string;
  profile_id: string;
  business_name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
}

function mapBusinessRow(row: RawBusinessRow): BusinessProfile {
  return {
    id: row.id,
    profileId: row.profile_id,
    businessName: row.business_name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logo_url,
    createdAt: row.created_at,
  };
}

/** Perfil de negocio del usuario autenticado, si ya lo creó. */
export async function getMyBusinessProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<BusinessProfile | null> {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('id, profile_id, business_name, slug, description, logo_url, created_at')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[profile] getMyBusinessProfile', error.message);
    return null;
  }

  return mapBusinessRow(data as unknown as RawBusinessRow);
}

/**
 * Crea o actualiza el perfil de negocio del usuario autenticado. Se
 * hace explícito (select → insert u update) en vez de usar `.upsert()`
 * para no arriesgarse a regenerar el slug (y romper la URL pública)
 * cada vez que alguien solo edita la descripción.
 */
export async function upsertBusinessProfile(
  supabase: SupabaseClient,
  profileId: string,
  input: UpsertBusinessProfileInput
): Promise<ServiceResult<{ slug: string }>> {
  const existing = await getMyBusinessProfile(supabase, profileId);

  if (existing) {
    const { error } = await supabase
      .from('business_profiles')
      .update({ business_name: input.businessName, description: input.description })
      .eq('profile_id', profileId);

    if (error) {
      console.error('[profile] upsertBusinessProfile (update)', error.message);
      return { success: false, error: 'No pudimos guardar los datos de tu negocio.' };
    }
    return { success: true, data: { slug: existing.slug } };
  }

  const slug = await generateUniqueSlug(supabase, input.businessName, 'business_profiles');
  const { error } = await supabase.from('business_profiles').insert({
    profile_id: profileId,
    business_name: input.businessName,
    slug,
    description: input.description,
  });

  if (error) {
    console.error('[profile] upsertBusinessProfile (insert)', error.message);
    return { success: false, error: 'No pudimos crear el perfil de tu negocio.' };
  }

  return { success: true, data: { slug } };
}

/**
 * Perfil público de negocio por slug, con sus publicaciones activas
 * (PUBLISHED, no expiradas). Página pública — no requiere sesión.
 */
export async function getBusinessProfileBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<BusinessProfile | null> {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('id, profile_id, business_name, slug, description, logo_url, created_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[profile] getBusinessProfileBySlug', error.message);
    return null;
  }

  return mapBusinessRow(data as unknown as RawBusinessRow);
}
