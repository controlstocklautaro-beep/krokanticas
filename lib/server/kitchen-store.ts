import { getD1 } from "@/db";
import { ApiError } from "./api-utils";

type OrderItemInput = {
  productId?: string;
  product_id?: string;
  id?: string;
  name?: string;
  productName?: string;
  product_name?: string;
  variedad?: string;
  sabor?: string;
  quantity?: number;
  cantidad?: number;
};

type OrderInput = {
  contactId?: string;
  contact_id?: string;
  phoneNumber?: string;
  phone_number?: string;
  phone?: string;
  customerName?: string;
  customer_name?: string;
  name?: string;
  deliveryType?: "pickup" | "delivery";
  delivery_type?: "pickup" | "delivery";
  address?: string;
  direccion?: string;
  zone?: string;
  zona?: string;
  paymentMethod?: "cash" | "transfer";
  payment_method?: "cash" | "transfer";
  time?: string;
  horario?: string;
  scheduledTime?: string;
  scheduled_time?: string;
  shippingCost?: number;
  shipping_cost?: number;
  notes?: string;
  receiptUrl?: string;
  receipt_url?: string;
  receipt?: string;
  comprobante?: string;
  comprobanteUrl?: string;
  comprobante_url?: string;
  urlComprobante?: string;
  url_comprobante?: string;
  comprobanteTransferencia?: string;
  comprobante_transferencia?: string;
  url_comprobante_transferencia?: string;
  paymentReceiptUrl?: string;
  payment_receipt_url?: string;
  paymentProofUrl?: string;
  payment_proof_url?: string;
  proofUrl?: string;
  proof_url?: string;
  items?: OrderItemInput[];
};

export async function listKitchenOrders(businessId: string, status?: string | null) {
  const db = getD1();
  const filter = status && status !== "all" ? " AND status = ?" : "";
  const query = `SELECT id, contact_id, order_number, customer_name, phone_number, delivery_type, address, zone, payment_method, scheduled_time, subtotal, shipping_cost, total, status, receipt_url, notes, created_at, updated_at FROM orders WHERE business_id = ?${filter} ORDER BY created_at DESC`;
  const orders = status && status !== "all" ? await db.prepare(query).bind(businessId, status).all<Record<string, unknown>>() : await db.prepare(query).bind(businessId).all<Record<string, unknown>>();
  if (!orders.results.length) return [];
  const items = await db.prepare("SELECT id, order_id, product_id, product_name, quantity, unit_price, subtotal FROM order_items WHERE business_id = ? ORDER BY product_name").bind(businessId).all<Record<string, unknown>>();
  return orders.results.map((order) => ({ ...order, items: items.results.filter((item) => item.order_id === order.id) }));
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const RECEIPT_KEYS = [
  "receiptUrl", "receipt_url", "receipt", "receiptLink", "receipt_link",
  "comprobante", "comprobanteUrl", "comprobante_url", "urlComprobante", "url_comprobante",
  "comprobanteTransferencia", "comprobante_transferencia", "url_comprobante_transferencia",
  "comprobantePago", "comprobante_pago", "comprobantePagoUrl", "comprobante_pago_url",
  "urlComprobantePago", "url_comprobante_pago", "paymentReceipt", "payment_receipt",
  "paymentReceiptUrl", "payment_receipt_url", "paymentProof", "payment_proof",
  "paymentProofUrl", "payment_proof_url", "proofUrl", "proof_url", "proof",
] as const;

function receiptString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.length ? receiptString(value[0]) : "";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "link", "href", "value", "src"]) {
      const candidate = receiptString(record[key]);
      if (candidate) return candidate;
    }
  }
  return "";
}

function receiptFromBody(body: Record<string, unknown>, fallback: string | null = null) {
  for (const key of RECEIPT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = receiptString(body[key]);
    if (!value) return { provided: true, url: null };
    if (value.length > 2_048) throw new ApiError("La URL del comprobante es demasiado larga", 400);
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new ApiError("La URL del comprobante no es válida", 400);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new ApiError("La URL del comprobante debe comenzar con http:// o https://", 400);
    }
    return { provided: true, url: parsed.toString() };
  }
  return { provided: false, url: fallback };
}

export async function createKitchenOrder(businessId: string, rawBody: OrderInput | Record<string, unknown>) {
  const body = rawBody as OrderInput;
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ApiError("La comanda necesita al menos un producto (items)", 400);
  }

  const db = getD1();
  const now = Date.now();

  // 1. Resolver o Crear Contacto
  let contactId = body.contactId || body.contact_id;
  let customerName = (body.customerName || body.customer_name || body.name || "").trim();
  let phoneNumber = (body.phoneNumber || body.phone_number || body.phone || "").trim();
  let contactAddress: string | null = null;

  if (contactId) {
    const existing = await db.prepare("SELECT id, name, phone_number, address FROM contacts WHERE id = ? AND business_id = ?")
      .bind(contactId, businessId).first<{ id: string; name: string; phone_number: string; address: string | null }>();
    if (existing) {
      customerName = customerName || existing.name;
      phoneNumber = phoneNumber || existing.phone_number;
      contactAddress = existing.address;
    } else {
      contactId = undefined;
    }
  }

  if (!contactId && phoneNumber) {
    const existing = await db.prepare("SELECT id, name, phone_number, address FROM contacts WHERE phone_number = ? AND business_id = ?")
      .bind(phoneNumber, businessId).first<{ id: string; name: string; phone_number: string; address: string | null }>();
    if (existing) {
      contactId = existing.id;
      customerName = customerName || existing.name;
      contactAddress = existing.address;
    } else {
      // Crear contacto automáticamente
      contactId = crypto.randomUUID();
      customerName = customerName || `Cliente ${phoneNumber.slice(-4)}`;
      await db.prepare("INSERT INTO contacts (id, business_id, phone_number, name, address, agent_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
        .bind(contactId, businessId, phoneNumber, customerName, body.address || null, now, now).run();
    }
  }

  if (!contactId) {
    throw new ApiError("La comanda debe tener un contactId o phoneNumber del cliente", 400);
  }

  // 2. Cargar todos los productos activos para resolución flexible
  const allProductsRes = await db.prepare("SELECT id, name, price, aliases, stock_status, stock_quantity FROM products WHERE business_id = ? AND active = 1")
    .bind(businessId).all<{ id: string; name: string; price: number; aliases: string; stock_status: string; stock_quantity: number | null }>();
  const allProducts = allProductsRes.results;

  // 3. Resolver cada item
  const preparedItems: { id: string; productId: string; name: string; quantity: number; price: number; subtotal: number; stockStatus: string; stockQuantity: number | null }[] = [];

  for (const raw of body.items) {
    const quantity = Math.max(1, Math.floor(Number(raw.quantity ?? raw.cantidad ?? 1)));
    const productKey = String(raw.productId || raw.product_id || raw.id || raw.name || raw.productName || raw.product_name || raw.variedad || raw.sabor || "").trim();
    if (!productKey) throw new ApiError("Producto inválido en la lista de items", 400);

    const normKey = normalizeText(productKey);

    // Buscar por ID exacto, Nombre o Alias
    let product = allProducts.find((p) => p.id === productKey);
    if (!product) {
      product = allProducts.find((p) => normalizeText(p.name) === normKey);
    }
    if (!product) {
      product = allProducts.find((p) => {
        try {
          const aliases: string[] = JSON.parse(p.aliases || "[]");
          return aliases.some((a) => normalizeText(a) === normKey);
        } catch {
          return false;
        }
      });
    }
    if (!product) {
      // Coincidencia parcial
      product = allProducts.find((p) => normalizeText(p.name).includes(normKey) || normKey.includes(normalizeText(p.name)));
    }

    if (!product) {
      throw new ApiError(`No se encontró la variedad "${productKey}" en el catálogo`, 404);
    }

    if (product.stock_status === "soldout") {
      throw new ApiError(`La variedad "${product.name}" está agotada`, 409);
    }
    if (product.stock_status === "limited" && Number(product.stock_quantity ?? 0) < quantity) {
      throw new ApiError(`Stock insuficiente de "${product.name}" (disponibles: ${product.stock_quantity ?? 0}, solicitadas: ${quantity})`, 409);
    }

    preparedItems.push({
      id: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      quantity,
      price: Number(product.price),
      subtotal: Number(product.price) * quantity,
      stockStatus: product.stock_status,
      stockQuantity: product.stock_quantity,
    });
  }

  const subtotal = preparedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const deliveryType = (body.deliveryType || body.delivery_type) === "delivery" ? "delivery" : "pickup";
  const rawShippingCost = body.shippingCost ?? body.shipping_cost ?? 0;
  const shippingCost = deliveryType === "delivery" ? Math.max(0, Number(rawShippingCost)) : 0;
  const address = deliveryType === "delivery" ? (body.address || body.direccion || contactAddress || "").trim() : null;
  if (deliveryType === "delivery" && !address) {
    throw new ApiError("Falta la dirección de entrega para el pedido con envío", 400);
  }

  const paymentMethod = (body.paymentMethod || body.payment_method) === "transfer" ? "transfer" : "cash";
  const rawTime = body.time ?? body.horario ?? body.scheduledTime ?? body.scheduled_time ?? (rawBody as Record<string, unknown>).time ?? (rawBody as Record<string, unknown>).horario ?? "Ahora";
  const scheduledTime = String(rawTime || "Ahora").trim();
  const zone = (body.zone || body.zona || "").trim() || null;
  const notes = (body.notes || "").trim() || null;
  const receiptUrl = receiptFromBody(rawBody as Record<string, unknown>).url;

  const numberRow = await db.prepare("SELECT COALESCE(MAX(order_number), 0) + 1 AS next_number FROM orders WHERE business_id = ?").bind(businessId).first<{ next_number: number }>();
  const orderNumber = Number(numberRow?.next_number ?? 1);
  const orderId = crypto.randomUUID();

  const statements = [
    db.prepare(`INSERT INTO orders (id, business_id, contact_id, order_number, customer_name, phone_number, delivery_type, address, zone, payment_method, scheduled_time, subtotal, shipping_cost, total, status, receipt_url, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)`)
      .bind(orderId, businessId, contactId, orderNumber, customerName, phoneNumber, deliveryType, address, zone, paymentMethod, scheduledTime, subtotal, shippingCost, subtotal + shippingCost, receiptUrl, notes, now, now),
  ];

  for (const item of preparedItems) {
    statements.push(
      db.prepare("INSERT INTO order_items (id, business_id, order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(item.id, businessId, orderId, item.productId, item.name, item.quantity, item.price, item.subtotal),
    );
    if (item.stockStatus === "limited") {
      statements.push(
        db.prepare("UPDATE products SET stock_quantity = stock_quantity - ?, stock_status = CASE WHEN stock_quantity - ? <= 0 THEN 'soldout' ELSE 'limited' END, updated_at = ? WHERE id = ? AND business_id = ? AND stock_quantity >= ?")
          .bind(item.quantity, item.quantity, now, item.productId, businessId, item.quantity),
      );
    }
  }

  await db.batch(statements);
  return {
    id: orderId,
    orderNumber,
    customerName,
    phoneNumber,
    deliveryType,
    address,
    zone,
    paymentMethod,
    scheduledTime,
    scheduled_time: scheduledTime,
    time: scheduledTime,
    horario: scheduledTime,
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
    receiptUrl,
    receipt_url: receiptUrl,
    notes,
    items: preparedItems.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitPrice: i.price, subtotal: i.subtotal })),
  };
}

export async function editKitchenOrder(businessId: string, body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) throw new ApiError("Falta id", 400);
  const db = getD1();
  const current = await db.prepare("SELECT id, status, delivery_type, address, zone, payment_method, scheduled_time, shipping_cost, subtotal, receipt_url, notes FROM orders WHERE id = ? AND business_id = ?").bind(id, businessId).first<Record<string, unknown>>();
  if (!current) throw new ApiError("Comanda no encontrada", 404);
  const allowedStatuses = ["confirmed", "in_kitchen", "ready", "delivered", "cancelled"];
  const status = typeof body.status === "string" && allowedStatuses.includes(body.status) ? body.status : String(current.status);
  const deliveryType = body.deliveryType === "delivery" || body.delivery_type === "delivery" ? "delivery" : body.deliveryType === "pickup" || body.delivery_type === "pickup" ? "pickup" : String(current.delivery_type);
  const rawShipping = body.shippingCost !== undefined ? body.shippingCost : body.shipping_cost;
  const requestedShippingCost = rawShipping === undefined ? Number(current.shipping_cost) : Math.max(0, Number(rawShipping));
  const shippingCost = deliveryType === "delivery" ? requestedShippingCost : 0;
  const receiptUrl = receiptFromBody(body, current.receipt_url as string | null).url;
  const scheduledTimeVal = body.time !== undefined ? String(body.time || "Ahora").trim()
    : body.horario !== undefined ? String(body.horario || "Ahora").trim()
    : body.scheduledTime !== undefined ? String(body.scheduledTime || "Ahora").trim()
    : body.scheduled_time !== undefined ? String(body.scheduled_time || "Ahora").trim()
    : current.scheduled_time ? String(current.scheduled_time) : "Ahora";
  const now = Date.now();
  let subtotal = Number(current.subtotal);
  const statements = [];

  if (Array.isArray(body.items)) {
    if (body.items.length === 0) throw new ApiError("La comanda necesita productos", 400);
    const allProductsRes = await db.prepare("SELECT id, name, price, aliases, stock_status, stock_quantity FROM products WHERE business_id = ? AND active = 1").bind(businessId).all<{ id: string; name: string; price: number; aliases: string; stock_status: string; stock_quantity: number | null }>();
    const allProducts = allProductsRes.results;

    const oldItems = await db.prepare(`SELECT oi.product_id, oi.quantity, p.stock_status, p.stock_quantity FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id AND p.business_id = oi.business_id WHERE oi.order_id = ? AND oi.business_id = ?`).bind(id, businessId).all<{ product_id: string | null; quantity: number; stock_status: string | null; stock_quantity: number | null }>();
    const oldQuantities = new Map<string, number>();
    for (const item of oldItems.results) if (item.product_id) oldQuantities.set(item.product_id, (oldQuantities.get(item.product_id) ?? 0) + Number(item.quantity));

    const prepared: { productId: string; name: string; quantity: number; price: number; subtotal: number; limited: boolean }[] = [];
    for (const raw of body.items as OrderItemInput[]) {
      const quantity = Math.max(1, Math.floor(Number(raw.quantity ?? raw.cantidad ?? 1)));
      const productKey = String(raw.productId || raw.product_id || raw.id || raw.name || raw.productName || raw.product_name || raw.variedad || raw.sabor || "").trim();
      const normKey = normalizeText(productKey);
      let product = allProducts.find((p) => p.id === productKey) || allProducts.find((p) => normalizeText(p.name) === normKey);
      if (!product) {
        product = allProducts.find((p) => {
          try {
            const aliases: string[] = JSON.parse(p.aliases || "[]");
            return aliases.some((a) => normalizeText(a) === normKey);
          } catch { return false; }
        });
      }
      if (!product) throw new ApiError(`Variedad "${productKey}" no encontrada`, 404);

      const limited = product.stock_status === "limited" || product.stock_status === "soldout";
      const available = Number(product.stock_quantity ?? 0) + (limited ? Number(oldQuantities.get(product.id) ?? 0) : 0);
      if (limited && available < quantity) throw new ApiError(`Stock insuficiente de ${product.name}`, 409);
      prepared.push({ productId: product.id, name: product.name, quantity, price: Number(product.price), subtotal: Number(product.price) * quantity, limited });
    }
    subtotal = prepared.reduce((sum, item) => sum + item.subtotal, 0);

    for (const item of oldItems.results) {
      if (item.product_id && (item.stock_status === "limited" || item.stock_status === "soldout")) {
        statements.push(db.prepare("UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + ?, stock_status = 'limited', updated_at = ? WHERE id = ? AND business_id = ?").bind(item.quantity, now, item.product_id, businessId));
      }
    }
    statements.push(db.prepare("DELETE FROM order_items WHERE order_id = ? AND business_id = ?").bind(id, businessId));
    for (const item of prepared) {
      statements.push(db.prepare("INSERT INTO order_items (id, business_id, order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), businessId, id, item.productId, item.name, item.quantity, item.price, item.subtotal));
      if (item.limited) statements.push(db.prepare("UPDATE products SET stock_quantity = stock_quantity - ?, stock_status = CASE WHEN stock_quantity - ? <= 0 THEN 'soldout' ELSE 'limited' END, updated_at = ? WHERE id = ? AND business_id = ? AND stock_quantity >= ?").bind(item.quantity, item.quantity, now, item.productId, businessId, item.quantity));
    }
  }

  const total = subtotal + shippingCost;
  statements.push(db.prepare("UPDATE orders SET delivery_type = ?, address = ?, zone = ?, payment_method = ?, scheduled_time = ?, subtotal = ?, shipping_cost = ?, total = ?, status = ?, receipt_url = ?, notes = ?, updated_at = ? WHERE id = ? AND business_id = ?")
    .bind(deliveryType, body.address === undefined ? current.address : String(body.address || "").trim() || null, body.zone === undefined ? current.zone : String(body.zone || "").trim() || null, body.paymentMethod === "transfer" || body.payment_method === "transfer" ? "transfer" : body.paymentMethod === "cash" || body.payment_method === "cash" ? "cash" : current.payment_method, scheduledTimeVal, subtotal, shippingCost, total, status, receiptUrl, body.notes === undefined ? current.notes : String(body.notes || "").trim() || null, now, id, businessId));
  await db.batch(statements);
  return { id, status, scheduledTime: scheduledTimeVal, scheduled_time: scheduledTimeVal, time: scheduledTimeVal, horario: scheduledTimeVal, subtotal, total, receiptUrl, receipt_url: receiptUrl };
}

export async function deleteKitchenOrder(businessId: string, id: string) {
  if (!id) throw new ApiError("Falta id", 400);
  const db = getD1();
  const order = await db.prepare("SELECT id FROM orders WHERE id = ? AND business_id = ?").bind(id, businessId).first();
  if (!order) throw new ApiError("Comanda no encontrada", 404);
  const items = await db.prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ? AND business_id = ?").bind(id, businessId).all<{ product_id: string | null; quantity: number }>();
  const now = Date.now();
  const statements = items.results.filter((item) => item.product_id).map((item) => db.prepare("UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + ?, stock_status = 'limited', updated_at = ? WHERE id = ? AND business_id = ? AND stock_status IN ('limited', 'soldout')").bind(item.quantity, now, item.product_id, businessId));
  statements.push(db.prepare("DELETE FROM order_items WHERE order_id = ? AND business_id = ?").bind(id, businessId));
  statements.push(db.prepare("DELETE FROM orders WHERE id = ? AND business_id = ?").bind(id, businessId));
  await db.batch(statements);
  return { id };
}
