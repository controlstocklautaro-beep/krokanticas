import { getD1 } from "@/db";
import { ApiError } from "./api-utils";

type OrderItemInput = { productId?: string; quantity?: number };
type OrderInput = {
  contactId?: string;
  deliveryType?: "pickup" | "delivery";
  address?: string;
  zone?: string;
  paymentMethod?: "cash" | "transfer";
  scheduledTime?: string;
  shippingCost?: number;
  notes?: string;
  items?: OrderItemInput[];
};

export async function listKitchenOrders(businessId: string, status?: string | null) {
  const db = getD1();
  const filter = status && status !== "all" ? " AND status = ?" : "";
  const query = `SELECT id, contact_id, order_number, customer_name, phone_number, delivery_type, address, zone, payment_method, scheduled_time, subtotal, shipping_cost, total, status, notes, created_at, updated_at FROM orders WHERE business_id = ?${filter} ORDER BY created_at DESC`;
  const orders = status && status !== "all" ? await db.prepare(query).bind(businessId, status).all<Record<string, unknown>>() : await db.prepare(query).bind(businessId).all<Record<string, unknown>>();
  if (!orders.results.length) return [];
  const items = await db.prepare("SELECT id, order_id, product_id, product_name, quantity, unit_price, subtotal FROM order_items WHERE business_id = ? ORDER BY product_name").bind(businessId).all<Record<string, unknown>>();
  return orders.results.map((order) => ({ ...order, items: items.results.filter((item) => item.order_id === order.id) }));
}

export async function createKitchenOrder(businessId: string, body: OrderInput) {
  if (!body.contactId) throw new ApiError("La comanda debe estar asociada a un contacto", 400);
  if (!Array.isArray(body.items) || body.items.length === 0) throw new ApiError("La comanda necesita productos", 400);
  const db = getD1();
  const contact = await db.prepare("SELECT id, name, phone_number, address FROM contacts WHERE id = ? AND business_id = ?").bind(body.contactId, businessId).first<{ id: string; name: string; phone_number: string; address: string | null }>();
  if (!contact) throw new ApiError("Contacto no encontrado", 404);

  const preparedItems: { id: string; productId: string; name: string; quantity: number; price: number; subtotal: number; stockStatus: string; stockQuantity: number | null }[] = [];
  for (const raw of body.items) {
    const quantity = Math.max(1, Math.floor(Number(raw.quantity ?? 0)));
    if (!raw.productId) throw new ApiError("Producto inválido", 400);
    const product = await db.prepare("SELECT id, name, price, stock_status, stock_quantity FROM products WHERE id = ? AND business_id = ? AND active = 1").bind(raw.productId, businessId).first<{ id: string; name: string; price: number; stock_status: string; stock_quantity: number | null }>();
    if (!product || product.stock_status === "soldout") throw new ApiError("Una variedad no está disponible", 409);
    if (product.stock_status === "limited" && Number(product.stock_quantity ?? 0) < quantity) throw new ApiError(`Stock insuficiente de ${product.name}`, 409);
    preparedItems.push({ id: crypto.randomUUID(), productId: product.id, name: product.name, quantity, price: Number(product.price), subtotal: Number(product.price) * quantity, stockStatus: product.stock_status, stockQuantity: product.stock_quantity });
  }

  const subtotal = preparedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const shippingCost = body.deliveryType === "delivery" ? Math.max(0, Number(body.shippingCost ?? 0)) : 0;
  const address = body.deliveryType === "delivery" ? body.address?.trim() || contact.address : null;
  if (body.deliveryType === "delivery" && !address) throw new ApiError("Falta la dirección de entrega", 400);
  const numberRow = await db.prepare("SELECT COALESCE(MAX(order_number), 0) + 1 AS next_number FROM orders WHERE business_id = ?").bind(businessId).first<{ next_number: number }>();
  const orderId = crypto.randomUUID(); const now = Date.now();
  const statements = [db.prepare(`INSERT INTO orders (id, business_id, contact_id, order_number, customer_name, phone_number, delivery_type, address, zone, payment_method, scheduled_time, subtotal, shipping_cost, total, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`)
    .bind(orderId, businessId, contact.id, Number(numberRow?.next_number ?? 1), contact.name, contact.phone_number, body.deliveryType === "delivery" ? "delivery" : "pickup", address, body.zone?.trim() || null, body.paymentMethod === "transfer" ? "transfer" : "cash", body.scheduledTime?.trim() || "Ahora", subtotal, shippingCost, subtotal + shippingCost, body.notes?.trim() || null, now, now)];
  for (const item of preparedItems) {
    statements.push(db.prepare("INSERT INTO order_items (id, business_id, order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, businessId, orderId, item.productId, item.name, item.quantity, item.price, item.subtotal));
    if (item.stockStatus === "limited") statements.push(db.prepare("UPDATE products SET stock_quantity = stock_quantity - ?, stock_status = CASE WHEN stock_quantity - ? <= 0 THEN 'soldout' ELSE 'limited' END, updated_at = ? WHERE id = ? AND business_id = ? AND stock_quantity >= ?").bind(item.quantity, item.quantity, now, item.productId, businessId, item.quantity));
  }
  await db.batch(statements);
  return { id: orderId, orderNumber: Number(numberRow?.next_number ?? 1), subtotal, shippingCost, total: subtotal + shippingCost };
}

export async function editKitchenOrder(businessId: string, body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) throw new ApiError("Falta id", 400);
  const db = getD1();
  const current = await db.prepare("SELECT id, status, delivery_type, address, zone, payment_method, scheduled_time, shipping_cost, subtotal, notes FROM orders WHERE id = ? AND business_id = ?").bind(id, businessId).first<Record<string, unknown>>();
  if (!current) throw new ApiError("Comanda no encontrada", 404);
  const allowedStatuses = ["confirmed", "in_kitchen", "ready", "delivered", "cancelled"];
  const status = typeof body.status === "string" && allowedStatuses.includes(body.status) ? body.status : String(current.status);
  const deliveryType = body.deliveryType === "delivery" ? "delivery" : body.deliveryType === "pickup" ? "pickup" : String(current.delivery_type);
  const requestedShippingCost = body.shippingCost === undefined ? Number(current.shipping_cost) : Math.max(0, Number(body.shippingCost));
  const shippingCost = deliveryType === "delivery" ? requestedShippingCost : 0;
  const now = Date.now();
  let subtotal = Number(current.subtotal);
  const statements = [];

  if (Array.isArray(body.items)) {
    if (body.items.length === 0) throw new ApiError("La comanda necesita productos", 400);
    const grouped = new Map<string, number>();
    for (const raw of body.items as OrderItemInput[]) {
      if (!raw.productId) throw new ApiError("Producto inválido", 400);
      const quantity = Math.max(1, Math.floor(Number(raw.quantity ?? 0)));
      grouped.set(raw.productId, (grouped.get(raw.productId) ?? 0) + quantity);
    }
    const oldItems = await db.prepare(`SELECT oi.product_id, oi.quantity, p.stock_status, p.stock_quantity FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id AND p.business_id = oi.business_id WHERE oi.order_id = ? AND oi.business_id = ?`).bind(id, businessId).all<{ product_id: string | null; quantity: number; stock_status: string | null; stock_quantity: number | null }>();
    const oldQuantities = new Map<string, number>();
    for (const item of oldItems.results) if (item.product_id) oldQuantities.set(item.product_id, (oldQuantities.get(item.product_id) ?? 0) + Number(item.quantity));

    const prepared: { productId: string; name: string; quantity: number; price: number; subtotal: number; limited: boolean }[] = [];
    for (const [productId, quantity] of grouped) {
      const product = await db.prepare("SELECT id, name, price, stock_status, stock_quantity FROM products WHERE id = ? AND business_id = ? AND active = 1").bind(productId, businessId).first<{ id: string; name: string; price: number; stock_status: string; stock_quantity: number | null }>();
      if (!product) throw new ApiError("Una variedad no existe o está desactivada", 409);
      const limited = product.stock_status === "limited" || product.stock_status === "soldout";
      const available = Number(product.stock_quantity ?? 0) + (limited ? Number(oldQuantities.get(productId) ?? 0) : 0);
      if (limited && available < quantity) throw new ApiError(`Stock insuficiente de ${product.name}`, 409);
      prepared.push({ productId, name: product.name, quantity, price: Number(product.price), subtotal: Number(product.price) * quantity, limited });
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
  statements.push(db.prepare("UPDATE orders SET delivery_type = ?, address = ?, zone = ?, payment_method = ?, scheduled_time = ?, subtotal = ?, shipping_cost = ?, total = ?, status = ?, notes = ?, updated_at = ? WHERE id = ? AND business_id = ?")
    .bind(deliveryType, body.address === undefined ? current.address : String(body.address || "").trim() || null, body.zone === undefined ? current.zone : String(body.zone || "").trim() || null, body.paymentMethod === "transfer" ? "transfer" : body.paymentMethod === "cash" ? "cash" : current.payment_method, body.scheduledTime === undefined ? current.scheduled_time : String(body.scheduledTime || "Ahora"), subtotal, shippingCost, total, status, body.notes === undefined ? current.notes : String(body.notes || "").trim() || null, now, id, businessId));
  await db.batch(statements);
  return { id, status, subtotal, total };
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
