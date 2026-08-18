# Nexo Panel Multiempresa

Panel PWA multiempresa para contactos, conversaciones, automatización, stock,
cocina, comandas y módulos configurables por negocio.

## Arquitectura de producción

- Next.js 16 en Vercel.
- PostgreSQL y almacenamiento privado en Supabase.
- Drizzle para esquema y migraciones.
- Login propio con sesiones HTTP-only y permisos por empresa.
- n8n como capa de automatización e integración con WhatsApp.

Los endpoints históricos de Ramayo conservan sus nombres exactos durante la
migración. El identificador `businessId` delimita todos los datos operativos.

## Requisitos

- Node.js `>=22.13.0`.
- Proyecto de Supabase.
- Bucket privado de Storage llamado `conversation-media`.
- Archivo `.env.local` basado en `.env.example`.

## Desarrollo

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

## Base de datos

El esquema está en `db/schema.ts`. La migración PostgreSQL generada para
Supabase está en `supabase/migrations/`.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

En producción las migraciones deben ejecutarse de forma controlada antes de
habilitar el primer acceso. Las credenciales nunca se guardan en el repositorio.

## Documentación

- `docs/VERCEL_SUPABASE_DEPLOYMENT.md`: publicación y credenciales.
- `docs/KROKANTICAS_API.md`: contratos de API.
- `docs/KROKANTICAS_N8N_HANDOFF.md`: integración completa para n8n.
