# Krokanticas — entrega funcional y técnica para n8n

Versión preparada para entregar al responsable del negocio y al programador de n8n.

## 1. Objetivo y límites

El panel resuelve la parte visual y persistente de Krokanticas:

- acceso privado con correo, contraseña y recuperación;
- contactos y direcciones;
- conversaciones, mensajes, etiquetas y control del bot;
- catálogo, sinónimos y stock por variedad;
- comandas asociadas a contactos;
- derivaciones, reclamos y atención humana;
- configuración operativa del turno;
- PWA instalable y optimizada para celular.

n8n debe resolver las conexiones externas:

- webhook oficial de WhatsApp Business;
- envío y recepción de mensajes mediante Meta;
- descarga de audios de WhatsApp;
- transcripción de audio;
- agente de inteligencia artificial;
- memoria temporal del pedido antes de confirmarlo;
- cálculo de envío por zona;
- reglas de ambigüedad y confianza;
- notificaciones externas al equipo si se requieren.

Continúan fuera del alcance contratado: impresión automática, finanzas, materia prima y proveedores, ARCA y múltiples sucursales.

### Estado de entrega: listo en código vs. pendiente de conexión

Ya queda listo en el código del panel:

- login propio, permisos por empresa, roles, usuarios y sesión persistente;
- interfaz responsive y PWA instalable;
- almacenamiento y API de contactos, direcciones, conversaciones, mensajes, etiquetas, bot, stock, comandas, derivaciones y configuración;
- descuento y devolución automática de stock al crear, editar o eliminar comandas;
- webhook saliente de textos, imágenes y audios enviados por un operador desde el panel;
- almacenamiento temporal de imágenes y audios con limpieza programable;
- contratos y ejemplos de todos los endpoints descritos en este documento.

Queda para la etapa de integración externa:

- completar las credenciales y variables de producción;
- conectar el webhook oficial de Meta con n8n;
- descargar los archivos entrantes desde Meta, transcribir audios y ejecutar el agente de IA;
- implementar en n8n la memoria temporal, deduplicación, resolución de ambigüedades, zonas y confirmación explícita;
- recibir y enviar por WhatsApp los eventos que el panel entrega al webhook de Krokanticas;
- conectar `PASSWORD_RESET_WEBHOOK_URL` para enviar por correo o mensajería el enlace de recuperación generado por el panel;
- procesar en n8n los eventos `outbound_message` que entregan `/api/send-message`, `/api/upload-image` y `/api/upload-media`, y enviarlos por Meta;
- publicar la versión final, cargar usuarios autorizados y ejecutar el piloto.

Importante: el panel queda funcional con datos locales sin estas conexiones, pero ninguna automatización debe considerarse habilitada en producción hasta completar y aprobar las pruebas de la sección 9.

## 2. Datos que debe completar el responsable de Krokanticas

Antes de activar el flujo, el responsable del negocio debe entregar:

1. Cuenta de Meta Business verificada.
2. Número de WhatsApp Business oficial.
3. `phone_number_id` de WhatsApp Cloud API.
4. Token permanente o mecanismo de renovación definido por Meta.
5. Plantillas de WhatsApp aprobadas, si se enviarán mensajes fuera de la ventana de 24 horas.
6. Dirección y horarios reales del local.
7. Tabla definitiva de zonas y costo de envío.
8. Tiempo inicial de demora: 15, 30 o 45 minutos.
9. Criterio para “poco stock”.
10. Personas que recibirán derivaciones o reclamos.
11. Proveedor elegido para IA y transcripción de audios.
12. Textos legales o avisos que quieran enviar al cliente.

## 3. Datos técnicos generales

### URL base

```text
https://panel.tudominio.com
```

La URL debe confirmarse nuevamente cuando se publique la versión final.

### Empresa fija

```text
businessId = krokanticas
```

Nunca se debe aceptar el `businessId` enviado por el usuario final. En n8n debe ser un valor fijo de credencial o configuración.

### Autenticación de n8n

Las rutas marcadas como “n8n” aceptan una de estas cabeceras:

```http
Authorization: Bearer <BUSINESS_INTEGRATION_KEY>
```

o:

```http
x-business-key: <BUSINESS_INTEGRATION_KEY>
```

Recomendación: crear una credencial genérica de tipo Header Auth en n8n y no escribir la clave dentro de los nodos.

También se admite `x-business-id: krokanticas`, pero es preferible enviar `businessId` en el JSON o query string según cada endpoint.

### Variables que deben configurarse al conectar producción

```env
DATABASE_URL=<conexión PostgreSQL de Supabase; solo Vercel>
NEXT_PUBLIC_SUPABASE_URL=<URL del proyecto Supabase>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave pública de Supabase>
SUPABASE_SECRET_KEY=<clave secreta; solo Vercel>
SUPABASE_STORAGE_BUCKET=conversation-media
APP_BASE_URL=https://panel.tudominio.com
BUSINESS_INTEGRATION_KEY=<clave larga y aleatoria compartida con n8n>
N8N_WEBHOOK_URL=<webhook de producción que envía mensajes por WhatsApp>
MEDIA_CLEANUP_SECRET=<clave distinta para la limpieza programada de multimedia>
PASSWORD_RESET_WEBHOOK_URL=<webhook opcional que entrega enlaces de recuperación>
PASSWORD_RESET_WEBHOOK_SECRET=<secreto opcional para autenticar ese webhook>
```

No se deben reutilizar tokens de Meta como clave del panel.

### JSON y teléfonos

- Usar `Content-Type: application/json` excepto en subida de archivos.
- Los teléfonos se normalizan al formato `+` seguido por 6 a 18 dígitos.
- Ejemplo argentino: `+5491112345678`.
- Se aceptan espacios, guiones y paréntesis, pero n8n debería enviar siempre el formato normalizado.
- Los identificadores `id`, `contactId`, `orderId` y `productId` son UUID devueltos por la API. No deben inventarse.
- Fechas internas como `created_at` y `updated_at` están expresadas en milisegundos Unix.

### Errores comunes

Todas las rutas devuelven:

```json
{ "error": "Descripción del problema" }
```

Estados relevantes:

- `400`: parámetros ausentes o inválidos;
- `401`: falta la clave de integración;
- `403`: usuario del panel sin rol suficiente;
- `404`: contacto, variedad, comanda o derivación inexistente;
- `409`: conflicto o stock insuficiente;
- `413`: texto o archivo demasiado grande;
- `415`: formato de archivo no admitido;
- `500`: error interno.

n8n debe tratar `409` como una respuesta de negocio y volver a consultar stock; no debe reintentar una comanda automáticamente.

## 4. Flujo principal recomendado en n8n

### 4.1 Entrada desde WhatsApp

1. Recibir el webhook oficial de Meta.
2. Validar que el evento sea un mensaje real y no un estado de entrega.
3. Guardar el `wamid` de Meta en un Data Store de n8n.
4. Si ese `wamid` ya fue procesado, terminar el flujo. Esto evita pedidos duplicados cuando Meta reintenta el webhook.
5. Normalizar teléfono y nombre.
6. Consultar `GET /api/bot-status`.
7. Si `agent_active` es `false`, registrar el mensaje pero no ejecutar la IA.
8. Registrar el mensaje con `POST /api/ingest-message` o con la ruta multimedia correspondiente.
9. Consultar o crear el contacto.
10. Consultar configuración del turno y catálogo.
11. Interpretar la intención con IA.
12. Responder, pedir aclaración, derivar o construir un pedido preliminar.

### 4.2 Mensajes de audio

1. Recibir el ID de multimedia desde Meta.
2. Descargar el audio usando el token de WhatsApp.
3. Transcribir el audio con el proveedor elegido.
4. Subir el archivo a `POST /api/upload-media` con `sender=user`.
5. Usar la transcripción como entrada del agente.
6. Si se quiere mostrar también el texto transcripto en el panel, llamar adicionalmente a `POST /api/ingest-message` con la transcripción.

No enviar el audio como base64 dentro de JSON. La ruta usa `multipart/form-data`.

### 4.3 Catálogo y casos ambiguos

1. Consultar `GET /api/stock`.
2. Comparar el texto del cliente contra `name` y `aliases`.
3. Normalizar mayúsculas, tildes y espacios en n8n.
4. Si hay una sola coincidencia clara, usar su `id` como `productId`.
5. Si hay dos posibilidades razonables, preguntar al cliente; no adivinar.
6. Si la ambigüedad continúa o la confianza es baja, crear `POST /api/handoffs` con `reason=ambiguity`.
7. Nunca ofrecer una variedad `soldout`.
8. Para `limited`, respetar `stock_quantity` y volver a validar antes de confirmar.

### 4.4 Pedido preliminar y confirmación explícita

n8n debe mantener el pedido preliminar fuera de Cocina, por ejemplo en un Data Store, usando el teléfono como clave:

```json
{
  "phone_number": "+5491112345678",
  "items": [
    { "productId": "uuid", "name": "Jamón y queso", "quantity": 6 }
  ],
  "deliveryType": "delivery",
  "address": "Belgrano 325",
  "zone": "Pavón",
  "shippingCost": 4000,
  "paymentMethod": "transfer"
}
```

Antes de crear la comanda, responder al cliente con el resumen completo y una pregunta inequívoca:

```text
Tu pedido es: 6 Jamón y queso, envío a Belgrano 325, total $19.600. ¿Confirmás el pedido?
```

Solo ejecutar `POST /api/kitchen/create` cuando la respuesta sea una confirmación clara. Un saludo, una consulta o un cambio no son confirmación.

### 4.5 Creación y stock

1. Volver a consultar stock justo antes de confirmar.
2. Crear la comanda con `POST /api/kitchen/create`.
3. Guardar en n8n la relación entre el `wamid` de confirmación y el `order.id` devuelto.
4. Enviar al cliente el número `order.orderNumber`.
5. El servidor descuenta el stock limitado automáticamente.

Importante: después de crear una comanda no llamar a `/api/stock/adjust` para descontar los mismos productos. Eso produciría un doble descuento.

### 4.6 Respuesta saliente

Hay dos orígenes posibles:

- Respuesta automática de n8n: n8n envía por Meta y después registra el texto con `POST /api/ingest-message`, usando `sender=agent`.
- Respuesta escrita desde el panel: el panel llama `POST /api/send-message`; esa ruta guarda el mensaje y envía un evento `outbound_message` al webhook de Krokanticas. Los adjuntos enviados desde el panel hacen lo mismo desde `/api/upload-image` o `/api/upload-media`. n8n debe enviarlos por Meta y devolver cualquier respuesta HTTP `2xx`.

El panel permite responder dentro de las 24 horas posteriores al último mensaje entrante del cliente. Fuera de esa ventana bloquea el envío interno y abre el chat en WhatsApp.

n8n no debe llamar a `/api/send-message`; esa ruta es panel → n8n y podría generar un circuito. Para persistir una respuesta enviada por el agente automático, usar `/api/ingest-message` con `sender=agent`.

### 4.7 Atención humana

Crear una derivación cuando ocurra cualquiera de estos casos:

- reclamo;
- cliente pide una persona;
- catálogo ambiguo sin resolución segura;
- cambio después de confirmar;
- error no recuperable;
- confianza del agente por debajo del umbral definido.

Acciones recomendadas:

1. `POST /api/handoffs`.
2. `POST /api/toggle-bot` con `agent_active=false` cuando no deba seguir respondiendo la IA.
3. `POST /api/assign-tags` con una etiqueta como `Reclamo` o `Atención humana`.
4. Informar al cliente que el caso fue derivado.

Cuando el equipo resuelva el caso puede reactivar el bot desde el panel o mediante `/api/toggle-bot`.

### 4.8 Recuperación de acceso al panel

El usuario solicita el enlace desde `/forgot-password`. El panel crea un token de un solo uso válido durante 30 minutos y, si `PASSWORD_RESET_WEBHOOK_URL` está configurada, llama ese webhook con:

```json
{
  "businessId": "krokanticas",
  "email": "usuario@krokanticas.com",
  "name": "Nombre del usuario",
  "resetUrl": "https://panel/reset-password?token=...",
  "expiresInMinutes": 30
}
```

Si existe `PASSWORD_RESET_WEBHOOK_SECRET`, el panel agrega `Authorization: Bearer <PASSWORD_RESET_WEBHOOK_SECRET>`. n8n debe entregar el enlace al correo o canal aprobado sin modificarlo ni registrarlo en logs visibles. El token queda inutilizado después del primer uso.

## 5. Inventario de endpoints

| Método | Endpoint | Acceso n8n | Uso |
|---|---|---:|---|
| POST | `/api/ingest-message` | Sí | Registrar texto entrante o saliente |
| GET | `/api/bot-status` | Sí | Consultar si la IA puede responder |
| POST | `/api/toggle-bot` | Sí | Activar o pausar IA por teléfono |
| POST | `/api/assign-tags` | Sí | Agregar etiquetas a una conversación |
| POST | `/api/remove-tags` | Sí | Quitar etiquetas |
| POST | `/api/upload-image` | Sí | Guardar una imagen y su mensaje |
| POST | `/api/upload-media` | Sí | Guardar un audio y su mensaje |
| GET | `/api/contacts` | Sí | Listar o buscar un contacto por teléfono |
| POST | `/api/contacts` | Sí | Crear contacto y dirección |
| PATCH | `/api/contacts` | Sí | Editar contacto y dirección |
| DELETE | `/api/contacts` | No | Eliminar contacto desde el panel |
| GET | `/api/stock` | Sí | Consultar catálogo, sinónimos y stock |
| POST | `/api/stock` | Sí | Crear variedad |
| PATCH | `/api/stock` | Sí | Editar variedad y estado |
| DELETE | `/api/stock` | No | Desactivar variedad |
| POST | `/api/stock/adjust` | Sí | Sumar o descontar stock manualmente |
| GET | `/api/settings` | Sí | Consultar apertura, demora y cadete |
| PATCH | `/api/settings` | Sí | Cambiar configuración operativa |
| GET | `/api/kitchen/orders` | Sí | Consultar comandas |
| POST | `/api/kitchen/create` | Sí | Crear comanda confirmada |
| PATCH / POST | `/api/kitchen/edit` | Sí | Editar comanda, productos o estado |
| DELETE / POST | `/api/kitchen/delete` | Sí | Eliminar comanda y devolver stock |
| GET | `/api/handoffs` | Sí | Consultar derivaciones |
| POST | `/api/handoffs` | Sí | Crear derivación |
| PATCH | `/api/handoffs` | Sí | Tomar, priorizar o resolver un caso |
| DELETE | `/api/handoffs` | No | Eliminar caso desde el panel |
| POST | `/api/send-message` | No | El panel entrega un mensaje a n8n |
| GET | `/api/chats` | No | Bandeja visual del panel |
| GET | `/api/messages` | No | Historial visual del panel |
| GET / POST / PATCH / DELETE | `/api/tags` | No | Administración visual de etiquetas |
| POST | `/api/delete-chat` | No | Borrar una conversación |
| POST | `/api/delete-all-chats` | No | Borrar todas las conversaciones |
| GET | `/api/cleanup-expired-media` | Secreto propio | Limpieza programada de archivos |
| GET | `/api/media/{ruta}` | URL generada | Leer multimedia almacenada |
| GET | `/api/auth/status` | No | Estado de sesión y alta inicial del panel |
| POST | `/api/auth/setup` | No | Crear el primer propietario |
| POST | `/api/auth/login` | No | Iniciar sesión con correo y contraseña |
| GET / POST | `/api/auth/logout` | No | Cerrar sesión |
| POST | `/api/auth/forgot-password` | No; llama webhook | Crear enlace de recuperación |
| POST | `/api/auth/reset-password` | No | Consumir el enlace y cambiar contraseña |
| POST | `/api/auth/change-password` | No | Reemplazar contraseña temporal |
| GET / POST / PATCH | `/api/users` | No | Administrar usuarios y roles |

Los endpoints `/api/finances`, `/api/metrics` y `/api/pipeline/*` pertenecen a la base multiempresa. No deben conectarse para Krokanticas en esta etapa.

## 6. Contratos detallados

### 6.1 `POST /api/ingest-message`

Acceso: n8n.

```json
{
  "businessId": "krokanticas",
  "phone_number": "+5491112345678",
  "user_name": "Juan Pérez",
  "message": "Quiero seis de jamón y queso",
  "sender": "user"
}
```

- `sender`: `user` o `agent`; si se omite se usa `user`.
- `message`: obligatorio, máximo 10.000 caracteres.
- Si el contacto o chat no existe, se crea automáticamente.

Respuesta:

```json
{ "success": true }
```

### 6.2 `GET /api/bot-status`

Acceso: n8n.

```http
GET /api/bot-status?businessId=krokanticas&phone_number=%2B5491112345678
```

Respuesta:

```json
{ "agent_active": true }
```

Si todavía no existe chat, devuelve `true`.

### 6.3 `POST /api/toggle-bot`

Acceso: n8n.

```json
{
  "businessId": "krokanticas",
  "phone_number": "+5491112345678",
  "agent_active": false
}
```

Respuesta:

```json
{ "success": true, "agent_active": false }
```

Actualiza chat y contacto.

### 6.4 `POST /api/assign-tags`

Acceso: n8n.

```json
{
  "businessId": "krokanticas",
  "phone_number": "+5491112345678",
  "tags": ["Pedido confirmado", "Delivery"]
}
```

Respuesta:

```json
{ "success": true, "tags": ["Pedido confirmado", "Delivery"] }
```

Admite un texto o una lista, elimina duplicados y procesa como máximo 30 etiquetas.

### 6.5 `POST /api/remove-tags`

Mismo cuerpo que `assign-tags`.

Respuesta:

```json
{ "success": true, "removed": ["Delivery"] }
```

### 6.6 `POST /api/upload-image`

Acceso: n8n. Tipo: `multipart/form-data`.

Campos:

- `businessId=krokanticas`;
- `phone_number=+5491112345678`;
- `sender=user` o `agent`;
- `file`: imagen de hasta 10 MB con MIME `image/*`.

Respuesta:

```json
{
  "success": true,
  "url": "/api/media/businesses/krokanticas/images/...",
  "delivery": "sent"
}
```

Cuando `sender=agent`, el endpoint también llama al webhook con JSON:

```json
{
  "event": "outbound_message",
  "source": "krokanticas-panel",
  "businessId": "krokanticas",
  "phone_number": "+5491112345678",
  "message": "https://...supabase.co/storage/v1/object/sign/...",
  "type": "image",
  "media_url": "https://...supabase.co/storage/v1/object/sign/...",
  "content_type": "image/jpeg",
  "file_name": "comprobante.jpg"
}
```

`media_url` es temporal y permite que n8n descargue el archivo sin usar la sesión del panel.

### 6.7 `POST /api/upload-media`

Igual que `upload-image`, pero el archivo debe ser `audio/*`, admite hasta 25 MB y entrega `type=audio`. Los nombres se mantienen exactamente como en Ramayo: `upload-image` para imagen y `upload-media` para audio.

### 6.8 `GET /api/contacts`

Acceso: n8n.

Listar:

```http
GET /api/contacts?businessId=krokanticas
```

Buscar por teléfono:

```http
GET /api/contacts?businessId=krokanticas&phone_number=%2B5491112345678
```

Respuesta:

```json
{
  "contacts": [
    {
      "id": "uuid",
      "phone_number": "+5491112345678",
      "name": "Juan Pérez",
      "email": "juan@example.com",
      "address": "Belgrano 325",
      "notes": "Portón negro",
      "agent_active": 1,
      "created_at": 1760000000000,
      "updated_at": 1760000000000
    }
  ]
}
```

Una búsqueda sin coincidencia devuelve `{ "contacts": [] }`.

### 6.9 `POST /api/contacts`

Acceso: n8n.

```json
{
  "businessId": "krokanticas",
  "name": "Juan Pérez",
  "phone_number": "+5491112345678",
  "email": "juan@example.com",
  "address": "Belgrano 325 - Pavón",
  "notes": "Portón negro"
}
```

Respuesta `201`:

```json
{ "success": true, "id": "uuid-contacto" }
```

También crea o actualiza la entrada de chat.

### 6.10 `PATCH /api/contacts`

Acceso: n8n. Requiere `id`; los demás campos son opcionales.

```json
{
  "businessId": "krokanticas",
  "id": "uuid-contacto",
  "address": "Nueva dirección 456",
  "notes": "Timbre 2"
}
```

Respuesta:

```json
{ "success": true }
```

### 6.11 `GET /api/stock`

Acceso: n8n.

```http
GET /api/stock?businessId=krokanticas
```

Respuesta:

```json
{
  "products": [
    {
      "id": "uuid-producto",
      "name": "Jamón y queso",
      "description": "Jamón cocido, muzzarella y un toque de orégano",
      "price": 2600,
      "aliases": ["jamón", "jyq", "jamón queso"],
      "active": 1,
      "stock_status": "limited",
      "stock_quantity": 18,
      "made_to_order": true,
      "requires_human": true,
      "updated_at": 1760000000000
    }
  ]
}
```

Estados:

- `available`: disponible sin cantidad limitada; `stock_quantity` es `null`;
- `limited`: cantidad exacta disponible;
- `soldout`: agotado.

`made_to_order` y `requires_human` expresan la misma decisión operativa. Si cualquiera es `true`, n8n debe detener el flujo automático para ese pedido, no confirmar ni crear la comanda y ejecutar `POST /api/handoffs` para que una persona continúe la conversación.

Ejemplo de derivación obligatoria por producto encargado:

```json
{
  "businessId": "krokanticas",
  "contactId": "uuid-contacto",
  "phoneNumber": "+5493410000000",
  "customerName": "Nombre del cliente",
  "reason": "other",
  "summary": "Producto por encargo solicitado: Jamón y queso. Continuar el pedido manualmente.",
  "priority": "medium"
}
```

### 6.12 `POST /api/stock`

Acceso: n8n, aunque normalmente se administra desde el panel.

```json
{
  "businessId": "krokanticas",
  "name": "Nueva variedad",
  "description": "Descripción breve de los ingredientes o del producto",
  "price": 3000,
  "aliases": ["nuevo", "nv"],
  "active": true,
  "stockStatus": "limited",
  "stockQuantity": 20,
  "madeToOrder": true
}
```

Respuesta `201`:

```json
{ "success": true, "id": "uuid-producto" }
```

### 6.13 `PATCH /api/stock`

Acceso: n8n. Requiere `id`. Si se cambia a `available` o `soldout`, la cantidad queda en `null`.

```json
{
  "businessId": "krokanticas",
  "id": "uuid-producto",
  "name": "Jamón y queso",
  "description": "Jamón cocido y muzzarella",
  "price": 2800,
  "aliases": ["jamón", "jyq"],
  "stockStatus": "soldout",
  "madeToOrder": true,
  "active": true
}
```

También se aceptan los alias `made_to_order`, `porEncargo` y `por_encargo`. La respuesta incluye `made_to_order` y `requires_human`.

### 6.14 `POST /api/stock/adjust`

Acceso: n8n.

Forma recomendada:

```json
{
  "businessId": "krokanticas",
  "productId": "uuid-producto",
  "delta": -2
}
```

Forma alternativa:

```json
{
  "businessId": "krokanticas",
  "productId": "uuid-producto",
  "action": "sum",
  "amount": 5
}
```

Respuesta:

```json
{
  "success": true,
  "stockStatus": "limited",
  "stockQuantity": 16
}
```

No permite bajar de cero. Una cantidad final de cero cambia el estado a `soldout`.

### 6.15 `GET /api/settings`

Acceso: n8n.

```http
GET /api/settings?businessId=krokanticas
```

Respuesta:

```json
{
  "settings": {
    "store_open": 1,
    "delay_minutes": 30,
    "courier_active": 1,
    "updated_at": 1760000000000
  }
}
```

n8n debería impedir pedidos nuevos cuando `store_open=0` y avisar si no hay cadete para delivery.

### 6.16 `PATCH /api/settings`

Acceso: n8n.

```json
{
  "businessId": "krokanticas",
  "storeOpen": true,
  "delayMinutes": 30,
  "courierActive": true
}
```

La demora solo admite 15, 30 o 45.

### 6.17 `GET /api/kitchen/orders`

Acceso: n8n.

```http
GET /api/kitchen/orders?businessId=krokanticas&status=confirmed
```

`status` es opcional. Valores: `confirmed`, `in_kitchen`, `ready`, `delivered`, `cancelled` o `all`.

Respuesta resumida:

```json
{
  "orders": [
    {
      "id": "uuid-comanda",
      "contact_id": "uuid-contacto",
      "order_number": 27,
      "customer_name": "Juan Pérez",
      "phone_number": "+5491112345678",
      "delivery_type": "delivery",
      "address": "Belgrano 325",
      "zone": "Pavón",
      "payment_method": "transfer",
      "scheduled_time": "21:30",
      "subtotal": 15600,
      "shipping_cost": 4000,
      "total": 19600,
      "status": "confirmed",
      "notes": "Llamar al llegar",
      "items": [
        {
          "id": "uuid-item",
          "product_id": "uuid-producto",
          "product_name": "Jamón y queso",
          "quantity": 6,
          "unit_price": 2600,
          "subtotal": 15600
        }
      ]
    }
  ]
}
```

### 6.18 `POST /api/kitchen/create`

Acceso: n8n. Solo después de la confirmación explícita.

```json
{
  "businessId": "krokanticas",
  "contactId": "uuid-contacto",
  "deliveryType": "delivery",
  "address": "Belgrano 325 - Pavón",
  "zone": "Pavón",
  "paymentMethod": "transfer",
  "scheduledTime": "21:30",
  "shippingCost": 4000,
  "receipt_url": "https://storage.ejemplo.com/comprobantes/pago-27.jpg",
  "notes": "Llamar al llegar",
  "items": [
    { "productId": "uuid-producto", "quantity": 6 }
  ]
}
```

Reglas del servidor:

- exige un contacto de la misma empresa;
- toma nombre, teléfono y dirección desde el contacto;
- para delivery exige dirección;
- valida que cada producto esté activo y no agotado;
- valida stock limitado;
- calcula subtotal y total usando el precio del servidor;
- para retiro fuerza `shippingCost=0`;
- descuenta stock limitado;
- guarda la URL del comprobante en `receipt_url`;
- crea la comanda con estado `confirmed`.

Para el comprobante, el nombre recomendado desde n8n es `receipt_url`. Por compatibilidad también se aceptan `receiptUrl`, `comprobante`, `comprobante_url`, `comprobanteUrl`, `url_comprobante`, `comprobante_transferencia`, `payment_receipt_url` y `proof_url`. Debe ser una URL completa `http://` o `https://`.

Respuesta `201`:

```json
{
  "success": true,
  "order": {
    "id": "uuid-comanda",
    "orderNumber": 27,
    "subtotal": 15600,
    "shippingCost": 4000,
    "total": 19600,
    "receiptUrl": "https://storage.ejemplo.com/comprobantes/pago-27.jpg",
    "receipt_url": "https://storage.ejemplo.com/comprobantes/pago-27.jpg"
  }
}
```

### 6.19 `PATCH /api/kitchen/edit`

Acceso: n8n. También acepta `POST` por compatibilidad.

```json
{
  "businessId": "krokanticas",
  "id": "uuid-comanda",
  "status": "in_kitchen",
  "deliveryType": "delivery",
  "address": "Belgrano 325",
  "zone": "Pavón",
  "paymentMethod": "cash",
  "scheduledTime": "21:45",
  "shippingCost": 4000,
  "receipt_url": "https://storage.ejemplo.com/comprobantes/pago-27-corregido.jpg",
  "notes": "Sin aceitunas",
  "items": [
    { "productId": "uuid-producto", "quantity": 8 }
  ]
}
```

Todos los campos salvo `businessId` e `id` son opcionales. Cuando se envía `items`, el servidor:

1. devuelve el stock limitado de los productos anteriores;
2. valida el nuevo pedido;
3. reemplaza los ítems;
4. descuenta el nuevo stock;
5. recalcula subtotal y total.

Respuesta:

```json
{
  "success": true,
  "order": {
    "id": "uuid-comanda",
    "status": "in_kitchen",
    "subtotal": 20800,
    "total": 24800,
    "receiptUrl": "https://storage.ejemplo.com/comprobantes/pago-27-corregido.jpg",
    "receipt_url": "https://storage.ejemplo.com/comprobantes/pago-27-corregido.jpg"
  }
}
```

### 6.20 `DELETE /api/kitchen/delete`

Acceso: n8n. También acepta `POST`.

```json
{
  "businessId": "krokanticas",
  "id": "uuid-comanda"
}
```

Elimina ítems y comanda, y devuelve el stock limitado descontado.

```json
{
  "success": true,
  "order": { "id": "uuid-comanda" }
}
```

### 6.21 `GET /api/handoffs`

Acceso: n8n.

```http
GET /api/handoffs?businessId=krokanticas&status=open
```

Estados: `open`, `in_progress`, `resolved` o `all`.

Respuesta:

```json
{
  "handoffs": [
    {
      "id": "uuid-caso",
      "contact_id": "uuid-contacto",
      "order_id": "uuid-comanda",
      "phone_number": "+5491112345678",
      "customer_name": "Juan Pérez",
      "reason": "complaint",
      "summary": "Reclama una demora",
      "priority": "high",
      "status": "open",
      "assigned_to": null,
      "created_at": 1760000000000,
      "updated_at": 1760000000000,
      "resolved_at": null
    }
  ]
}
```

### 6.22 `POST /api/handoffs`

Acceso: n8n.

```json
{
  "businessId": "krokanticas",
  "contactId": "uuid-contacto",
  "orderId": "uuid-comanda-opcional",
  "reason": "complaint",
  "summary": "El cliente reclama una demora y pide una persona",
  "priority": "high"
}
```

También admite `customerName` y `phoneNumber` cuando no hay contacto. Motivos:

- `complaint`;
- `ambiguity`;
- `human_request`;
- `post_confirmation_change`;
- `other`.

Prioridades: `low`, `medium`, `high`.

Respuesta `201`:

```json
{ "success": true, "id": "uuid-caso" }
```

### 6.23 `PATCH /api/handoffs`

Acceso: n8n.

```json
{
  "businessId": "krokanticas",
  "id": "uuid-caso",
  "status": "in_progress",
  "priority": "high",
  "assignedTo": "Equipo Krokanticas",
  "summary": "Resumen actualizado"
}
```

Estados: `open`, `in_progress`, `resolved`. Al resolver se completa `resolved_at`.

### 6.24 `POST /api/send-message`

Acceso: solo panel autenticado.

```json
{
  "businessId": "krokanticas",
  "phone_number": "+5491112345678",
  "message": "Tu pedido está listo"
}
```

Guarda el mensaje como `agent` y llama al webhook de Krokanticas con:

```json
{
  "event": "outbound_message",
  "source": "krokanticas-panel",
  "businessId": "krokanticas",
  "phone_number": "+5491112345678",
  "message": "Tu pedido está listo",
  "type": "text"
}
```

Respuesta al panel:

```json
{ "success": true, "delivery": "sent" }
```

`delivery` puede ser `sent`, `failed` o `not_configured`.

### 6.25 `GET /api/cleanup-expired-media`

Ejecución global programada:

```http
Authorization: Bearer <MEDIA_CLEANUP_SECRET>
GET /api/cleanup-expired-media
```

Ejecución para Krokanticas:

```http
GET /api/cleanup-expired-media?businessId=krokanticas
```

Los archivos de imagen y audio se conservan 90 días. La ruta procesa hasta 2.000 elementos por ejecución y deja el mensaje histórico marcado como archivo vencido.

### 6.26 `GET /api/auth/status`

Acceso: navegador del panel. Responde sin caché:

```json
{
  "authenticated": false,
  "user": null,
  "needsSetup": true,
  "setupAllowed": true
}
```

`needsSetup` solo es verdadero mientras no existe ningún usuario. En producción el alta inicial requiere además el acceso privado de Sites.

### 6.27 `POST /api/auth/setup`

Acceso: únicamente durante el primer acceso.

```json
{
  "name": "Responsable Krokanticas",
  "email": "responsable@krokanticas.com",
  "password": "Contraseña segura 2026"
}
```

Crea al primer `owner`, inicia la sesión y deja de aceptar nuevas llamadas de setup. Respuestas especiales: `403` si el alta inicial no está autorizada y `409` si el propietario ya existe.

### 6.28 `POST /api/auth/login`

```json
{
  "email": "responsable@krokanticas.com",
  "password": "Contraseña segura 2026"
}
```

Al validar las credenciales entrega una cookie `HttpOnly`, `SameSite=Lax`, con 30 días de vigencia. Devuelve `401` con un mensaje genérico cuando las credenciales son incorrectas y `403` para usuarios desactivados.

### 6.29 `GET /api/auth/logout` o `POST /api/auth/logout`

Elimina la sesión actual, vence la cookie y redirige a `/login`. No requiere integración con n8n.

### 6.30 `POST /api/auth/forgot-password`

```json
{ "email": "responsable@krokanticas.com" }
```

Siempre devuelve un mensaje neutro para no revelar si un correo existe. Si el usuario está activo, genera el token y llama `PASSWORD_RESET_WEBHOOK_URL` con el payload documentado en 4.8. Solo en desarrollo local devuelve también `developmentResetUrl`.

### 6.31 `POST /api/auth/reset-password`

```json
{
  "token": "token-recibido-en-el-enlace",
  "password": "Nueva contraseña 2026"
}
```

Consume el token una sola vez, cambia la contraseña y cierra todas las sesiones anteriores.

### 6.32 `POST /api/auth/change-password`

Acceso: sesión del panel.

```json
{ "password": "Contraseña personal 2026" }
```

Se usa después de entrar con una contraseña temporal creada por un administrador. Renueva la sesión y habilita el acceso al resto del panel.

### 6.33 `GET`, `POST` y `PATCH /api/users`

Acceso: propietarios y administradores. `GET` requiere `businessId=krokanticas`. Para crear:

```json
{
  "businessId": "krokanticas",
  "name": "Operador Cocina",
  "email": "cocina@krokanticas.com",
  "role": "staff",
  "password": "Temporal 2026"
}
```

Para modificar rol, estado, nombre o contraseña temporal:

```json
{
  "businessId": "krokanticas",
  "id": "uuid-usuario",
  "name": "Operador Cocina",
  "role": "reception",
  "active": true,
  "password": "Nueva temporal 2026"
}
```

La API impide desactivar el usuario propio, impide que un administrador modifique propietarios y exige que siempre quede al menos un propietario activo.

## 7. Rutas exactas heredadas de Ramayo

Estos nombres no deben modificarse en n8n:

```text
/api/assign-tags
/api/bot-status
/api/cleanup-expired-media
/api/delete-all-chats
/api/delete-chat
/api/ingest-message
/api/remove-tags
/api/send-message
/api/toggle-bot
/api/upload-image
/api/upload-media
```

## 8. Nodos mínimos sugeridos para n8n

### Workflow A — WhatsApp entrante

1. Webhook Meta.
2. Validar y extraer evento.
3. Data Store: deduplicar `wamid`.
4. HTTP Request: `bot-status`.
5. HTTP Request: `ingest-message` o subida multimedia.
6. HTTP Request: buscar contacto.
7. IF: crear o actualizar contacto.
8. HTTP Request: `settings`.
9. HTTP Request: `stock`.
10. Agente IA.
11. Switch: consulta, pedido, ambigüedad, reclamo o humano.
12. Envío por WhatsApp Cloud API.
13. HTTP Request: `ingest-message` con `sender=agent`.

### Workflow B — Confirmar pedido

1. Recibir confirmación clara.
2. Recuperar borrador del Data Store.
3. Volver a consultar stock.
4. HTTP Request: `kitchen/create`.
5. Guardar `order.id` y `orderNumber`.
6. Etiquetar conversación.
7. Enviar confirmación por WhatsApp.
8. Eliminar borrador temporal.

### Workflow C — Mensaje enviado desde el panel

1. Recibir `event=outbound_message` en el webhook de Krokanticas.
2. Validar una clave propia del webhook si se agrega.
3. Si `type=text`, enviar `message` al `phone_number` usando Meta.
4. Si `type=image` o `type=audio`, descargar `media_url` y enviar el archivo usando Meta.
5. Responder HTTP `200` o `204` al panel.

No volver a llamar a `ingest-message` en este workflow: `/api/send-message` ya guardó el mensaje antes de invocar n8n.

### Workflow D — Limpieza de multimedia

1. Schedule Trigger diario.
2. HTTP Request a `cleanup-expired-media` con `MEDIA_CLEANUP_SECRET`.
3. Registrar `cleaned`, `missing_files` y errores.

## 9. Pruebas de aceptación antes de habilitar clientes reales

1. Texto entrante aparece en Conversaciones.
2. Audio aparece y se puede reproducir.
3. Transcripción interpreta correctamente cantidades y variedades.
4. Bot apagado no responde automáticamente.
5. Contacto nuevo guarda nombre, teléfono y dirección.
6. Contacto existente se encuentra por teléfono.
7. Variedad agotada nunca se ofrece.
8. Poco stock impide superar la cantidad real.
9. Ambigüedad genera pregunta, no una suposición.
10. Reclamo crea derivación prioritaria.
11. No se crea comanda antes de una confirmación explícita.
12. Un webhook repetido con el mismo `wamid` no duplica la comanda.
13. Crear comanda descuenta stock una sola vez.
14. Editar productos reconcilia stock y total.
15. Eliminar comanda devuelve stock.
16. Retiro fuerza costo de envío cero.
17. Delivery exige dirección y usa el costo correcto de zona.
18. Mensaje escrito en el panel llega a WhatsApp.
19. Respuesta automática aparece en el historial como `agent`.
20. El panel instalado como PWA conserva login y operación móvil.

## 10. Checklist final de producción

### Responsable del negocio

- [ ] Meta Business y número oficial listos.
- [ ] Zonas y costos aprobados.
- [ ] Horarios y demoras aprobados.
- [ ] Catálogo, precios y sinónimos revisados.
- [ ] Responsables de reclamos definidos.
- [ ] Mensajes y tono del agente aprobados.

### Programador de n8n

- [ ] Credenciales guardadas en n8n.
- [ ] `BUSINESS_INTEGRATION_KEY` aplicada a todos los HTTP Request del panel.
- [ ] Webhook Meta verificado.
- [ ] Deduplicación por `wamid` activa.
- [ ] Memoria temporal del pedido implementada.
- [ ] Confirmación explícita obligatoria.
- [ ] Resolución de aliases y ambigüedad implementada.
- [ ] Cálculo de zona y envío implementado.
- [ ] Flujo de reclamos y atención humana implementado.
- [ ] Webhook de salida del panel implementado.
- [ ] Webhook de recuperación de contraseña configurado y probado.
- [ ] Limpieza de multimedia programada.
- [ ] Pruebas de aceptación completadas.

### Panel y despliegue

- [ ] Configurar las tres variables de producción.
- [ ] Publicar la versión final.
- [ ] Autorizar usuarios del cliente.
- [ ] Crear el propietario inicial y reemplazar todas las contraseñas temporales.
- [ ] Probar instalación PWA en Android e iPhone.
- [ ] Ejecutar un piloto controlado antes de anunciar el número.
