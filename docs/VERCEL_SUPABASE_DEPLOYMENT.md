# Publicación de Nexo en Vercel con Supabase

## 1. Servicios y propiedad

El responsable del producto debe ser propietario de las cuentas de GitHub,
Vercel, Supabase, n8n, Meta Business y del dominio. Los programadores se agregan
como colaboradores; no se comparten contraseñas personales.

Arquitectura:

- Vercel ejecuta Next.js, el panel y todos los endpoints `/api/*`.
- Supabase aloja PostgreSQL y los archivos privados.
- n8n integra WhatsApp, IA, transcripción y automatizaciones.
- Una sola aplicación atiende a todas las empresas.

## 2. Crear Supabase

1. Crear una organización y un proyecto de producción.
2. Elegir una región cercana a los usuarios y a Vercel.
3. En Storage, crear el bucket privado `conversation-media`.
4. Guardar la URL del proyecto, la publishable key y la secret key.
5. Copiar la conexión PostgreSQL con pooler para `DATABASE_URL`.
6. Ejecutar la migración de `supabase/migrations/`.

## 3. Variables locales

Copiar `.env.example` como `.env.local` y completar:

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_STORAGE_BUCKET=conversation-media
APP_BASE_URL=http://localhost:3000
INITIAL_ADMIN_SETUP_TOKEN=
INITIAL_BUSINESS_ID=krokanticas
INITIAL_BUSINESS_NAME=Krokanticas
BUSINESS_INTEGRATION_KEY=
MEDIA_CLEANUP_SECRET=
N8N_WEBHOOK_URL=
PASSWORD_RESET_WEBHOOK_URL=
PASSWORD_RESET_WEBHOOK_SECRET=
```

`SUPABASE_SECRET_KEY`, `DATABASE_URL` y las claves internas son exclusivamente
de servidor. Nunca llevan el prefijo `NEXT_PUBLIC_` ni se envían al navegador.

## 4. Preparar GitHub

1. Crear un repositorio privado.
2. Confirmar que `.env.local` esté ignorado.
3. Subir la rama de trabajo y verificar Preview antes de unirla a `main`.
4. Mantener `main` como rama de producción.

## 5. Crear Vercel

1. Importar el repositorio privado desde GitHub.
2. Confirmar que Framework Preset sea Next.js.
3. Configurar todas las variables anteriores para Production.
4. Crear credenciales y base separadas para Preview.
5. No conectar Preview a la base de producción.
6. Desplegar primero una rama Preview.

## 6. Primer administrador

1. Generar un `INITIAL_ADMIN_SETUP_TOKEN` largo y aleatorio.
2. Configurarlo solo en Vercel Production.
3. Abrir `/login` y crear el primer propietario usando esa clave.
4. Eliminar `INITIAL_ADMIN_SETUP_TOKEN` de Vercel.
5. Volver a desplegar para cerrar definitivamente el alta inicial.

## 7. Multiempresa y módulos

Las tablas `businesses`, `memberships`, `business_modules` y
`business_integrations` controlan empresas, roles y funciones habilitadas.
Todas las tablas operativas incluyen `business_id`. El servidor valida la
membresía antes de permitir acceso.

Krokanticas inicia con:

- messages;
- contacts;
- settings;
- users;
- stock;
- kitchen;
- handoffs.

Cada empresa nueva debe recibir únicamente los módulos contratados.

## 8. Conectar n8n

n8n recibe solamente:

- URL final del panel;
- `businessId` autorizado;
- `BUSINESS_INTEGRATION_KEY`;
- documentación de endpoints;
- credenciales de Meta e IA guardadas en n8n Credentials.

No se entrega a n8n `DATABASE_URL` ni `SUPABASE_SECRET_KEY`. n8n se comunica con
el panel por endpoints protegidos.

## 9. Dominio y producción

1. Probar login, contactos, conversaciones, stock, cocina y archivos en Preview.
2. Agregar el dominio en Vercel.
3. Actualizar `APP_BASE_URL` con `https://panel.dominio.com`.
4. Configurar la URL final en n8n y Meta.
5. Unir la rama aprobada a `main`.
6. Verificar aislamiento entre empresas y vista móvil/PWA.

## 10. Resguardo

- Activar backups de Supabase según el plan contratado.
- Rotar claves ante cualquier exposición.
- Usar secretos diferentes en Preview y Production.
- Mantener el bucket de conversaciones privado.
- Revisar logs de Vercel, Supabase y n8n durante el piloto.
