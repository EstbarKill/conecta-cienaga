/// <reference types="astro/client" />

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Profile } from './types/database';

declare global {
  namespace App {
    interface Locals {
      /** Cliente de Supabase ligado a la sesión de esta request (SSR, respeta RLS). */
      supabase: SupabaseClient;
      /** Usuario autenticado según Supabase Auth, o null si es visitante. */
      user: User | null;
      /** Perfil de dominio (rol, nombre, etc.), o null si es visitante o el perfil no existe. */
      profile: Profile | null;
      /** Notificaciones sin leer del usuario actual (0 si es visitante). */
      unreadNotifications: number;
    }
  }

  interface ImportMetaEnv {
    readonly PUBLIC_SUPABASE_URL: string;
    readonly PUBLIC_SUPABASE_ANON_KEY: string;
    readonly PUBLIC_SITE_URL: string;
    readonly SUPABASE_URL: string;
    readonly SUPABASE_SERVICE_ROLE_KEY: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
