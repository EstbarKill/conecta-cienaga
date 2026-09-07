# Conecta Ciénaga

Plataforma web gratuita para conectar personas que buscan oportunidades laborales o quieren ofrecer sus servicios, con personas y negocios que necesitan contratar — comenzando en Ciénaga, Magdalena, Colombia.

## Problema

En Ciénaga (y municipios similares) no existe un canal digital local, confiable y gratuito donde un oficio, un negocio pequeño, o alguien sin experiencia formal pueda encontrar o publicar trabajo. Hoy eso pasa de forma completamente informal (WhatsApp, Facebook, voz a voz), sin estructura, sin búsqueda, sin ningún filtro de confianza.

## Solución

Una plataforma hiperlocal donde:
- Cualquier persona publica gratis lo que busca (empleo) o lo que ofrece (un servicio, un oficio).
- Cualquier negocio publica vacantes.
- Toda publicación pasa por moderación antes de ser visible.
- El contacto directo (WhatsApp/teléfono/correo) queda protegido: solo visible para usuarios autenticados que hacen clic explícito en "Ver contacto".

No es una copia de LinkedIn ni de Computrabajo — es deliberadamente más simple, pensado para gente sin experiencia técnica.

## Características

- Registro como Persona o Negocio, con perfil de negocio público para este último.
- Publicar oportunidades de 3 tipos: Empleo, Servicio, Busca empleo.
- Moderación obligatoria: toda publicación entra en revisión antes de mostrarse.
- Búsqueda y filtros (texto, tipo, categoría, municipio) con paginación.
- Mapa comunitario ilustrativo en la home, con las publicaciones activas ubicadas al azar.
- Sistema de reportes de usuarios + panel de administración para gestionarlos.
- Panel de administración completo: moderación, reportes, categorías, usuarios.
- SEO técnico: sitemap dinámico, robots.txt, Open Graph, datos estructurados `JobPosting`.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | Astro (SSR) + TypeScript |
| Backend / BaaS | Supabase (Auth, Postgres, Storage) |
| Autenticación SSR | `@supabase/ssr` (cookies httpOnly) |
| Hosting | Vercel |
| Testing | Vitest (unitarias) + suite SQL propia (RLS/seguridad) |
| CI | GitHub Actions |

Sin frameworks de UI, sin ORM, sin microservicios — proporcional al tamaño real del proyecto (ver sección "Decisiones técnicas").

## Arquitectura

Monolito modular sobre Astro (`output: 'server'`) + Supabase como backend completo. La autorización se aplica en **dos capas independientes**, nunca solo en el frontend:

1. **Middleware de Astro** (`src/middleware.ts`): protege rutas por sesión y por rol, verificando siempre contra la base de datos (nunca contra un valor cacheado).
2. **Row Level Security de Postgres**: la capa real de seguridad. Aunque el middleware fallara, ningún usuario podría leer o escribir datos que no le correspondan — se probó explícitamente (ver `tests/sql/rls-critical.test.sql`).

```
Browser ──> Astro SSR (Vercel)
              │
              ├── Supabase Auth (sesión vía cookies httpOnly)
              ├── Supabase Postgres (RLS en cada tabla)
              └── Supabase Storage (si se usa en el futuro)
```

Estructura de carpetas:

```
src/
├── components/    # Componentes reutilizables (ej. CommunityMap)
├── layouts/       # BaseLayout, AdminLayout
├── pages/         # Rutas (incluye API routes en pages/api/)
├── services/      # Única capa de acceso a Supabase — ninguna página llama a Supabase directo
├── utils/         # Funciones puras (slug, sanitización, mapeo de errores)
├── types/         # Tipos de dominio compartidos
├── config/        # Clientes de Supabase (público, admin, SSR)
└── styles/        # Sistema de diseño (global.css)
```

## Base de datos

Ver [`supabase/DATABASE.md`](supabase/DATABASE.md) para el modelo completo: relaciones, índices, políticas RLS documentadas tabla por tabla, y un gotcha real de RLS encontrado durante el desarrollo (`INSERT ... ON CONFLICT` con políticas de SELECT restrictivas).

Resumen de tablas: `profiles`, `business_profiles`, `posts`, `categories`, `locations`, `reports`.

## Seguridad

- **RLS en todas las tablas**, sin excepción. Ninguna tabla es de lectura/escritura libre.
- **Protección a nivel de columna** además de RLS por fila: `posts.status`, `profiles.role` y `profiles.is_active` no son modificables directamente ni por su propio dueño — solo a través de funciones `SECURITY DEFINER` que validan el rol del llamante (`admin_review_post`, `admin_set_role`, `admin_set_profile_active`).
- **Protección anti-autobloqueo**: un administrador no puede desactivar su propia cuenta ni quitarse el rol ADMIN a sí mismo (probado explícitamente).
- **Contacto protegido**: los datos de contacto de una publicación nunca viajan en el listado/detalle público — solo a través de la función `get_post_contact()`, que exige sesión activa, y solo tras un clic explícito del usuario.
- **Nunca se expone la Service Role Key** al navegador — separada explícitamente en `src/config/supabase.admin.ts`, con advertencias en el propio archivo.
- **Errores nunca exponen detalles internos**: todo error técnico se registra en consola del servidor y se traduce a un mensaje seguro para el usuario (ver `src/utils/authErrors.ts`).
- Vulnerabilidad conocida y documentada: `path-to-regexp` (dependencia transitiva de `@astrojs/vercel`), de build-time, sin exposición a input de usuarios — revisada en cada `npm audit` del CI.

## Instalación

Requiere **Node.js ≥ 22.12.0**.

```sh
git clone <tu-repositorio>
cd conecta-cienaga
npm install
cp .env.example .env   # completa con tus credenciales de Supabase
npm run dev
```

## Variables de entorno

Ver `.env.example` para la lista completa, con explicación de cuáles son públicas (`PUBLIC_*`, seguras de exponer al navegador — la seguridad real la da RLS) y cuáles son privadas (solo servidor).

## Desarrollo

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor local en `localhost:4321` |
| `npm run build` | Build de producción |
| `npm run preview` | Previsualizar el build |
| `npm run lint` | ESLint sobre todo el proyecto |
| `npm run typecheck` | Verificación de tipos (`astro check`) |
| `npm run test` | Pruebas unitarias (Vitest) |

### Aplicar migraciones a Supabase

```sh
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

Corre desde la **raíz del proyecto** (no desde dentro de `supabase/`). El `seed.sql` no se aplica con `db push` — pégalo una vez en el SQL Editor del dashboard.

## Testing

**Unitarias** (funciones puras — slugs, sanitización de búsqueda, mapeo de errores):
```sh
npm run test
```

**Seguridad / RLS** (suite SQL que automatiza los casos críticos del estándar — sección 34):
```sh
supabase start
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
     -v ON_ERROR_STOP=1 -f tests/sql/rls-critical.test.sql
```

Cubre: asignación de rol en el registro, aislamiento entre usuarios (Usuario A no puede tocar publicaciones de Usuario B), protección de columnas de moderación, funciones admin solo para admins, protección anti-autobloqueo, contacto protegido tras login, permisos de `business_profiles`, y el límite de un reporte por usuario/publicación. **Nunca correr contra producción** — crea y modifica datos de prueba.

## Deployment

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com), importa el repositorio (Vercel detecta Astro automáticamente).
3. Configura las variables de entorno de producción en el dashboard de Vercel (las mismas de `.env.example`, con valores reales — nunca subas `.env` a Git).
4. Aplica las migraciones a tu proyecto de Supabase de producción (`supabase db push`) y corre el seed manualmente.
5. En Supabase → Authentication → URL Configuration, agrega la URL de producción y `https://tu-dominio/api/auth/callback` a las Redirect URLs — si no, los correos de confirmación/recuperación fallarán.
6. Deploy. Vercel construye con el adaptador `@astrojs/vercel` (SSR) automáticamente.

CI en GitHub Actions (`.github/workflows/ci.yml`): lint → typecheck → build → audit de dependencias en cada push/PR.

## Decisiones técnicas relevantes

- **Sin microservicios, sin Kafka, sin Redis, sin GraphQL** — no hay necesidad demostrable a este tamaño (YAGNI, sección 2 del estándar).
- **Expiración de publicaciones**: se resuelve por consulta dinámica (`WHERE expires_at > now()`), no por cron job — más simple y suficientemente confiable para el volumen esperado.
- **`BUSINESS` es elegible en el registro** (no solo asignable por admin) porque no es una escalada de privilegios — no tiene más permisos que `USER`, solo habilita crear un perfil de negocio. `ADMIN` sigue siendo exclusivo de una función que solo otro admin puede ejecutar.
- **El mapa de la home es ilustrativo, no geográficamente preciso** — los límites oficiales de Ciénaga son datos del IGAC con licencia restringida a uso institucional. Se optó por un contorno costero estilizado, aclarado explícitamente en la UI, en vez de simular una precisión que no existe.
- **No se construyó una página de "configuraciones de la plataforma"** — no hay todavía ninguna configuración concreta que gestionar más allá de lo ya cubierto (categorías, usuarios, moderación); agregarla habría sido especulativa.

## Roadmap

**Implementado (MVP funcional completo, incluyendo iteraciones post-lanzamiento):** autenticación, CRUD de publicaciones con moderación, búsqueda con filtros, perfiles personales y de negocio (con página pública `/empresa/[slug]`), avatar con subida de imagen, panel de administración como dashboard con sidebar y **acciones masivas de moderación**, **señales de alerta semi-automáticas** (spam/estafa) en la cola de moderación, sistema de reportes, notificaciones in-app con contador junto al avatar, notificaciones por correo, cierre de sesión por inactividad, **compartir por WhatsApp**, SEO técnico, suite de pruebas de seguridad, mapa comunitario interactivo.

**Post-MVP / Futuro:**
- Google OAuth.
- Publicaciones y negocios destacados (monetización futura).
- Conversión de cuenta `USER` a `BUSINESS` después del registro (hoy requiere intervención de un admin).
- Expansión a otros municipios del Magdalena / región Caribe (la arquitectura de `locations` ya está preparada para esto).
- Marcado automático de publicaciones como `EXPIRED` vía Edge Function (hoy es una consulta dinámica, suficiente para el volumen actual).
- Notificaciones push/en tiempo real (hoy el contador se actualiza al navegar entre páginas, no al instante vía WebSocket).
- Alertas de búsqueda guardada ("avísame cuando haya un empleo en X categoría").
- Marcar una publicación como "ya resuelto/contratado" (distinto de eliminar).

## Contribución

Proyecto individual en su fase de MVP. Sugerencias y reportes de bugs son bienvenidos vía issues del repositorio.

## Licencia

Por definir antes de un lanzamiento público formal.
