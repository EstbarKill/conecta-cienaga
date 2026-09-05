# services/

Esta carpeta contiene la capa de acceso a datos y lógica de negocio.
Ningún componente o página debe llamar a `supabase` directamente: siempre
a través de un servicio.

Convención por archivo (ej. `posts.ts`, `auth.ts`, `reports.ts`):

- Cada función retorna un tipo explícito de `src/types/`, nunca `any`.
- Los errores de Supabase se capturan aquí y se traducen a errores de
  dominio con mensaje seguro para el usuario (nunca se propaga el error
  crudo de Postgres hacia la UI — ver sección 31 del estándar).
- Las funciones que requieren la Service Role Key deben marcarse
  explícitamente en el nombre o comentario (ej. `adminApprovePost`) y
  vivir separadas de las funciones que usan el cliente público.

Se implementará contenido real a partir del Bloque 4 (Publicaciones),
una vez existan las migraciones y políticas RLS del Bloque 2.
