# API del panel Krokanticas

La entrega completa para implementar n8n, incluidos flujos, responsabilidades, ejemplos y pruebas de aceptación, está en `docs/KROKANTICAS_N8N_HANDOFF.md`.

Todas las rutas usan JSON y requieren `businessId: "krokanticas"`. Las integraciones de n8n deben enviar `Authorization: Bearer <BUSINESS_INTEGRATION_KEY>` o `x-business-key`. El panel web usa la identidad autenticada de Sites.

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

- `GET /api/stock?businessId=krokanticas`: consulta variedades, precios, sinónimos y stock.
- `POST /api/stock`: crea una variedad.
- `PATCH /api/stock`: edita nombre, precio, sinónimos y estado.
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

## Configuración del turno

- `GET /api/settings?businessId=krokanticas`
- `PATCH /api/settings`

```json
{
  "businessId": "krokanticas",
  "storeOpen": true,
  "delayMinutes": 30,
  "courierActive": true
}
```

La demora solo admite 15, 30 o 45 minutos.

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
