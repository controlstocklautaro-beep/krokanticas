# API del panel Krokanticas

La entrega completa para implementar n8n, incluidos flujos, responsabilidades, ejemplos y pruebas de aceptación, está en `docs/KROKANTICAS_N8N_HANDOFF.md`.

Todas las rutas usan JSON y requieren `businessId: "krokanticas"`. Las integraciones de n8n deben enviar `Authorization: Bearer <BUSINESS_INTEGRATION_KEY>` o `x-business-key`. El panel web utiliza su propia sesión segura mediante cookie `HttpOnly`; nunca se debe compartir esa cookie con n8n.

## Acceso y usuarios del panel

- `GET /api/auth/status`: informa si existe el administrador inicial y si hay una sesión activa.
- `POST /api/auth/setup`: crea el primer propietario cuando la base todavía no tiene usuarios.
- `POST /api/auth/login`: inicia sesión con correo y contraseña.
- `GET /api/auth/logout`: cierra la sesión actual.
- `POST /api/auth/forgot-password`: crea un enlace de recuperación de un solo uso.
- `POST /api/auth/reset-password`: restablece una contraseña mediante token.
- `POST /api/auth/change-password`: reemplaza una contraseña temporal después del primer ingreso.
- `GET /api/users?businessId=krokanticas`: lista usuarios para propietarios y administradores.
- `POST /api/users`: crea un usuario con rol y contraseña temporal.
- `PATCH /api/users`: modifica nombre, rol, estado o contraseña temporal.

Las contraseñas se almacenan con PBKDF2-SHA256 y sal aleatoria; las sesiones y tokens de recuperación se almacenan únicamente como hashes. Los roles disponibles son `owner`, `admin`, `manager`, `reception`, `cashier` y `staff`.

## Contactos

- `GET /api/contacts?businessId=krokanticas`: lista contactos, incluida la propiedad `address`. Admite `phone_number` para buscar un contacto exacto.
- `POST /api/contacts`: crea un contacto.
- `PATCH /api/contacts`: edita un contacto por `id`.
- `DELETE /api/contacts`: elimina un contacto por `id`.

```json
{
  "businessId": "krokanticas",
  "name": "Juan Perez",
  "phone_number": "+5491112345678",
  "email": "juan@example.com",
  "address": "Belgrano 325 - Pavon",
  "notes": "Porton negro"
}
```

## Stock y catálogo

- `GET /api/stock?businessId=krokanticas`: consulta variedades, descripción, precios, sinónimos y stock.
- `POST /api/stock`: crea una variedad con descripción breve opcional.
- `PATCH /api/stock`: edita nombre, descripción, precio, sinónimos y estado.
- `DELETE /api/stock`: desactiva una variedad.
- `POST /api/stock/adjust`: suma o descuenta stock limitado.

Estados permitidos: `available`, `limited`, `soldout`.

```json
{
  "businessId": "krokanticas",
  "productId": "uuid-producto",
  "action": "subtract",
  "amount": 2
}
```

También se admite `delta: -2` o `delta: 3`. Nunca se permite que la cantidad quede por debajo de cero.

## Cocina y comandas

- `GET /api/kitchen/orders?businessId=krokanticas`: lista comandas con sus productos.
- `POST /api/kitchen/create`: crea una comanda confirmada.
- `PATCH /api/kitchen/edit`: edita datos, estado y productos.
- `DELETE /api/kitchen/delete`: elimina una comanda y devuelve el stock limitado descontado.

Cada comanda exige un `contactId` válido de la misma empresa. Al crearla, el servidor toma nombre, teléfono y dirección desde el contacto, valida el catálogo, calcula subtotal y total, y descuenta el stock limitado. Si se envía `items` al editar, el servidor reemplaza los productos, devuelve el stock anterior, descuenta el nuevo y recalcula los importes.

```json
{
  "businessId": "krokanticas",
  "contactId": "uuid-contacto",
  "deliveryType": "delivery",
  "address": "Belgrano 325 - Pavon",
  "zone": "Pavon",
  "paymentMethod": "transfer",
  "scheduledTime": "21:30",
  "shippingCost": 4000,
  "notes": "Llamar al llegar",
  "items": [
    { "productId": "uuid-producto", "quantity": 6 }
  ]
}
```

Estados de comanda: `confirmed`, `in_kitchen`, `ready`, `delivered`, `cancelled`.

## Derivaciones y reclamos

- `GET /api/handoffs?businessId=krokanticas`: lista casos; admite `status=open`, `in_progress`, `resolved` o `all`.
- `POST /api/handoffs`: crea un caso manual o desde n8n y puede asociarlo a `contactId` y `orderId`.
- `PATCH /api/handoffs`: actualiza estado, prioridad, responsable o resumen.
- `DELETE /api/handoffs`: elimina un caso (solo propietario o administrador).

Motivos admitidos: `complaint`, `ambiguity`, `human_request`, `post_confirmation_change`, `other`. Prioridades: `low`, `medium`, `high`. Estados: `open`, `in_progress`, `resolved`.

```json
{
  "businessId": "krokanticas",
  "contactId": "uuid-contacto",
  "orderId": "uuid-comanda-opcional",
  "reason": "complaint",
  "summary": "El cliente reclama una demora y pide hablar con una persona",
  "priority": "high"
}
```

## Configuración operativa, horarios, pagos y envíos

- `GET /api/settings?businessId=krokanticas`
- `PATCH /api/settings`

### Respuesta de `GET /api/settings`:

```json
{
  "settings": {
    "store_open": 1,
    "delay_minutes": 30,
    "courier_active": 1,
    "address": "Ruta 21 y calle Arroyo Seco. Empalme Villa Constitución.",
    "active_alias": 1,
    "alias_1": {
      "alias": "Krokanticas2021",
      "bank": "Mercado Pago",
      "holder": "Matias Montes",
      "active": true
    },
    "alias_2": {
      "alias": "Krokan2021",
      "bank": "Mercado Pago",
      "holder": "Fabian Gonzalo Montes",
      "active": false
    },
    "active_payment_data": {
      "alias": "Krokanticas2021",
      "bank": "Mercado Pago",
      "holder": "Matias Montes"
    },
    "shipping_zones": [
      { "name": "Empalme V.C.", "cost": 3000 },
      { "name": "Barrio Mitre (Pavón)", "cost": 3000 },
      { "name": "Pavón", "cost": 4000 },
      { "name": "Rincón de Pavón", "cost": 6000 }
    ],
    "schedule_lunch": "Martes a Viernes de 11:00 a 14:00 hs",
    "schedule_dinner": "Miércoles a Domingo de 19:30 a 23:30 hs",
    "schedule_notes": "Mediodía: Mar a Vie 11:00 a 14:00 hs · Noche: Mié a Dom 19:30 a 23:30 hs",
    "schedules": {
      "lunch": "Martes a Viernes de 11:00 a 14:00 hs",
      "dinner": "Miércoles a Domingo de 19:30 a 23:30 hs",
      "summary": "Mediodía: Mar a Vie 11:00 a 14:00 hs · Noche: Mié a Dom 19:30 a 23:30 hs"
    },
    "updated_at": 1787159836012
  }
}
```

### Actualización vía `PATCH /api/settings`:

```json
{
  "businessId": "krokanticas",
  "storeOpen": true,
  "delayMinutes": 30,
  "courierActive": true,
  "activeAlias": 2,
  "address": "Ruta 21 y calle Arroyo Seco. Empalme Villa Constitución.",
  "scheduleLunch": "Martes a Viernes de 11:00 a 14:00 hs",
  "scheduleDinner": "Miércoles a Domingo de 19:30 a 23:30 hs"
}
```

- `courierActive` (o `courier_active`): `1`/`true` (Cadete disponible, ofrece envíos y retiros) o `0`/`false` (Cadete no disponible, el bot solo ofrece retiro en el local).
- `active_payment_data`: entrega directamente el alias activo para que el bot de n8n lo envíe al cliente sin lógica condicional.

## Conversaciones y WhatsApp

Se conservan los nombres exactos de la base Ramayo:

- `/api/assign-tags`
- `/api/bot-status`
- `/api/cleanup-expired-media`
- `/api/delete-all-chats`
- `/api/delete-chat`
- `/api/ingest-message`
- `/api/remove-tags`
- `/api/send-message`
- `/api/toggle-bot`
- `/api/upload-image`
- `/api/upload-media`

Además están disponibles `/api/chats`, `/api/messages` y `/api/tags` para las pantallas del panel.

## Pendiente de conexión externa

El código y las pantallas quedan preparados. Para operar en producción todavía deben configurarse fuera del panel las credenciales de WhatsApp Business, el webhook y la clave de n8n, y el proveedor del agente de IA/transcripción de audios.
