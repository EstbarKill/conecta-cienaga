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
    }
  }

  interface ImportMetaEnv {
    readonly SUPABASE_URL: string;
    readonly SUPABASE_ANON_KEY: string;
    readonly SITE_URL: string;
    readonly SUPABASE_URL: string;
    readonly SUPABASE_SERVICE_ROLE_KEY: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
