# Base de datos — Conecta Ciénaga

Este documento describe el modelo de datos aplicado en `supabase/migrations/`.
Todas las migraciones fueron validadas ejecutándolas contra una instancia
Postgres 16 local antes de esta entrega (incluyendo el caso crítico de
seguridad de la sección 34 del estándar).

## Diagrama de relaciones

```
auth.users (Supabase Auth)
    │ 1:1 (trigger on_auth_user_created)
    ▼
profiles ──────────────┬── 1:1 ──> business_profiles
    │ 1:N                │
    ▼                    │
  posts ◄─────────────────┘ (author_id también referencia profiles)
    │ N:1
    ├──> categories
    ├──> locations
    │ 1:N
    ▼
  reports ──> profiles (reporter_id)
```

## Tablas

| Tabla | Filas esperadas (MVP) | Notas |
|---|---|---|
| `profiles` | 1 por usuario | 1:1 con `auth.users`, creada por trigger |
| `business_profiles` | 1 por negocio | 1:1 con `profiles` cuando `role = BUSINESS` |
| `locations` | pocas decenas | Jerarquía municipio→departamento→país |
| `categories` | 17 (sembradas) | Gestionable solo por ADMIN |
| `posts` | crece con el uso | Entidad principal |
| `reports` | crece con el uso | Un reporte por (post, usuario) |

## Índices y su justificación

- `posts (status, expires_at)` — soporta la query del listado público (`WHERE status = 'PUBLISHED' AND expires_at > now()`), la más frecuente del sistema.
- `posts (category_id)`, `posts (location_id)`, `posts (author_id)` — filtros del buscador y de "mis publicaciones".
- `reports (post_id)`, `reports (status)` — panel de moderación.

No se crearon índices adicionales: siguiendo la sección 15 del estándar, se evita indexar preventivamente sin un patrón de consulta real que lo justifique.

## Políticas RLS (resumen operativo)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | propio o ADMIN | solo vía trigger de registro | propio o ADMIN (columna `role` protegida, ver abajo) | — |
| `business_profiles` | público | propio, solo si `role=BUSINESS` | propio o ADMIN | propio o ADMIN |
| `posts` | `PUBLISHED` no expirado, o propio, o ADMIN | propio, `status` inicial forzado a `DRAFT`/`PENDING` | propio o ADMIN (columnas de moderación protegidas, ver abajo) | propio o ADMIN |
| `reports` | solo ADMIN | propio (`reporter_id = auth.uid()`) | solo ADMIN | — (no se eliminan) |
| `categories` / `locations` | público | solo ADMIN | solo ADMIN | solo ADMIN |

### Protecciones a nivel de columna (más allá de RLS por fila)

Postgres permite `GRANT`/`REVOKE` por columna además de por fila. Se usó para dos casos donde una policy de fila no bastaba:

1. **`profiles.role`**: un usuario puede actualizar su propio perfil (RLS lo permite), pero se le revoca el privilegio de columna sobre `role` específicamente. Solo `admin_set_role()` (función `SECURITY DEFINER` que verifica `is_admin()`) puede cambiarlo.
2. **`posts.status` / `posts.rejection_reason`**: un autor puede editar título/descripción/categoría/contacto de su post, pero no puede moverlo a `PUBLISHED` él mismo. Solo `admin_review_post()` puede hacerlo. El autor sí puede pausar/eliminar/reactivar su propio post vía `author_set_post_status()`.

Esto se probó explícitamente: un intento directo de `UPDATE posts SET status = 'PUBLISHED'` por el propio autor fue rechazado por Postgres con `permission denied`, no solo ocultado en la UI.

### Funciones `SECURITY DEFINER`

| Función | Quién puede llamarla | Qué hace |
|---|---|---|
| `is_admin()` | cualquiera (uso interno en policies) | Verifica si `auth.uid()` tiene `role = ADMIN`, sin causar recursión de RLS |
| `admin_set_role(profile_id, role)` | valida ADMIN internamente | Único camino para cambiar el rol de un usuario |
| `admin_review_post(post_id, status, reason)` | valida ADMIN internamente | Único camino para `PUBLISHED`/`REJECTED`/`PAUSED`/`DELETED` |
| `author_set_post_status(post_id, status)` | valida autoría internamente | Permite al autor pausar/eliminar/reenviar a revisión su propio post |
| `get_post_contact(post_id)` | requiere sesión autenticada | Único camino para leer `contact_*`; el listado/detalle normal nunca los incluye |

## Caso crítico verificado (sección 34 del estándar)

> Usuario A intenta modificar una publicación de Usuario B → resultado esperado: DENEGADO.

Verificado localmente antes de esta entrega: `UPDATE ... WHERE author_id = B` ejecutado con la sesión de A devuelve `UPDATE 0` (RLS bloquea la fila silenciosamente, comportamiento estándar y esperado de Postgres RLS).

## Gotcha de RLS descubierto: `INSERT ... ON CONFLICT` necesita SELECT

Al automatizar la suite de tests (`tests/sql/rls-critical.test.sql`) se encontró que `INSERT ... ON CONFLICT DO NOTHING` sobre `reports` falla con "row-level security policy" para un usuario normal — aunque un `INSERT` simple (sin `ON CONFLICT`) al mismo tiempo funciona perfecto.

**Causa:** Postgres necesita evaluar la política de `SELECT` de la tabla para detectar si ya existe una fila en conflicto, y `reports_select_admin_only` solo permite `SELECT` a administradores. Un usuario normal no puede usar `ON CONFLICT` sobre `reports`, aunque sí pueda insertar.

**Impacto en la app real: ninguno.** `services/reports.ts` usa un `.insert()` simple (sin `ON CONFLICT`) y captura el código de error `23505` (unique_violation) para el mensaje "ya reportaste esta publicación" — el flujo correcto y ya usado no toca esta limitación.

**Para quien extienda esto después:** si en el futuro se usa `.upsert()` de Supabase (que sí genera `ON CONFLICT`) sobre una tabla donde `SELECT` está restringido a admin, un usuario normal recibirá un error de RLS confuso. Preferir INSERT simple + manejo del error de constraint único, como ya se hace aquí.

## Cómo aplicar esto a tu proyecto real

Ejecuta desde la raíz del proyecto (donde está la carpeta `supabase/`):

```sh
supabase login
supabase link --project-ref vwonikynwhesccunoore
supabase db push
```

Esto aplica las 6 migraciones en orden. El seed **no** se aplica con `db push` (solo corre automáticamente en `supabase db reset`, que es destructivo y solo debe usarse en local). Para producción, aplica `supabase/seed.sql` **una sola vez**, manualmente, desde el SQL Editor del dashboard de Supabase.

## Generar tipos TypeScript oficiales (recomendado, próximo paso)

Una vez migrado el proyecto remoto:

```sh
supabase gen types typescript --project-id vwonikynwhesccunoore > src/types/supabase.generated.ts
```

Esto complementa (no reemplaza) `src/types/database.ts`, que contiene los DTOs de dominio usados en la capa de servicios.
