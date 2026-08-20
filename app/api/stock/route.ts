import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

type StockStatus = "available" | "limited" | "soldout";
type ProductBody = { businessId?: string; id?: string; name?: string; description?: string; price?: number; aliases?: string[]; active?: boolean; stockStatus?: StockStatus; stockQuantity?: number | null };

const catalog = [
  ["Jamón y queso", 2600, ["jamón", "jyq", "jamón queso"]],
  ["Carne salada", 2600, ["carne salada", "salada"]],
  ["Carne dulce", 2600, ["carne dulce", "dulce"]],
  ["Carne cortada a cuchillo", 3000, ["cuchillo", "carne cuchillo", "cortada a cuchillo"]],
  ["Verdura común", 2600, ["verdura común"]],
  ["Pollo", 2600, ["pollo"]],
  ["Roquefort y nuez", 2600, ["roque y nuez", "roquefort y nuez"]],
  ["Hamburguesa", 3000, ["cheese burger", "cheese", "burger"]],
  ["Cebolla y queso", 2600, ["cebolla y queso", "cebolla"]],
  ["Humita", 2600, ["humita", "choclo"]],
  ["Jamón y ananá", 2600, ["j y ananá", "ananá"]],
  ["Verdura y roquefort", 2600, ["verdura y roque", "verdura y roquefort"]],
  ["Pacú", 2600, ["pacú", "pescado"]],
  ["Vacío y provoleta", 3000, ["vacío y provolone", "carne desmechada"]],
  ["Batata y queso", 2600, ["batata", "batata y queso"]],
  ["Capresse", 2600, ["caprese", "capresse"]],
  ["Champiñones", 2600, ["champi", "champiñones"]],
  ["Palmitos", 2600, ["palmito", "palmitos"]],
] as const;

async function seedCatalog(businessId: string) {
  if (businessId !== "krokanticas") return;
  const db = getD1();
  const count = await db.prepare("SELECT COUNT(*) AS total FROM products WHERE business_id = ?").bind(businessId).first<{ total: number }>();
  if (Number(count?.total ?? 0) > 0) return;
  const now = Date.now();
  await db.batch(catalog.map(([name, price, aliases]) => db.prepare("INSERT OR IGNORE INTO products (id, business_id, name, price, aliases, active, stock_status, stock_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'available', NULL, ?, ?)")
    .bind(crypto.randomUUID(), businessId, name, price, JSON.stringify(aliases), now, now)));
}

function normalized(body: Record<string, unknown>) {
  const name = String(body.name || body.productName || body.product_name || body.variedad || body.sabor || "").trim();
  if (!name) throw new ApiError("Falta name o nombre del producto", 400);
  const description = String(body.description ?? body.descripcion ?? body.detail ?? body.detalle ?? "").trim();
  if (description.length > 500) throw new ApiError("La descripción no puede superar los 500 caracteres", 400);
  const rawPrice = body.price !== undefined ? body.price : body.precio;
  const price = rawPrice !== undefined ? Number(rawPrice) : 2600;
  if (!Number.isFinite(price) || price < 0) throw new ApiError("Precio inválido", 400);
  
  const rawStatus = String(body.stockStatus || body.stock_status || body.status || body.estado || "available").toLowerCase();
  const status: StockStatus = rawStatus === "limited" || rawStatus === "soldout" ? rawStatus : "available";
  
  const rawQty = body.stockQuantity !== undefined ? body.stockQuantity :
    body.stock_quantity !== undefined ? body.stock_quantity :
    body.quantity !== undefined ? body.quantity :
    body.cantidad !== undefined ? body.cantidad : body.stock;
    
  const quantity = status === "limited" ? Math.max(0, Math.floor(Number(rawQty ?? 0))) : null;
  const rawAliases = body.aliases || body.sinonimos || body.alias;
  const aliases = Array.isArray(rawAliases) ? rawAliases.map((a) => String(a).trim()).filter(Boolean) :
    typeof rawAliases === "string" ? rawAliases.split(",").map((a) => a.trim()).filter(Boolean) : [];

  return { name, description: description || null, price, status, quantity, aliases: JSON.stringify(aliases) };
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    await seedCatalog(businessId);
    const result = await getD1().prepare("SELECT id, name, description, price, aliases, active, stock_status, stock_quantity, updated_at FROM products WHERE business_id = ? AND active = 1 ORDER BY name ASC").bind(businessId).all();
    return NextResponse.json({ products: result.results.map((row) => ({ ...row, aliases: JSON.parse(String(row.aliases || "[]")) })) });
  } catch (error) { return apiErrorResponse(error, "Error consultando stock"); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, String(body.businessId || body.business_id || ""));
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager"] });
    const product = normalized(body);
    const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID(); 
    const now = Date.now();
    await getD1().prepare("INSERT INTO products (id, business_id, name, description, price, aliases, active, stock_status, stock_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)")
      .bind(id, businessId, product.name, product.description, product.price, product.aliases, product.status, product.quantity, now, now).run();
    return NextResponse.json({ success: true, id, description: product.description }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, "Error creando variedad"); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const businessId = businessIdFrom(req, String(body.businessId || body.business_id || ""));
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager"] });
    const id = String(body.id || body.productId || body.product_id || "");
    const name = String(body.name || body.productName || body.product_name || "").trim();
    const db = getD1();
    
    let current: Record<string, unknown> | null = null;
    if (id) {
      current = await db.prepare("SELECT id, name, description, price, aliases, active, stock_status, stock_quantity FROM products WHERE id = ? AND business_id = ?").bind(id, businessId).first<Record<string, unknown>>();
    } else if (name) {
      current = await db.prepare("SELECT id, name, description, price, aliases, active, stock_status, stock_quantity FROM products WHERE LOWER(name) = LOWER(?) AND business_id = ? AND active = 1").bind(name, businessId).first<Record<string, unknown>>();
    }
    
    if (!current) throw new ApiError("Variedad no encontrada (especificá id o name)", 404);
    
    const product = normalized({
      name: body.name !== undefined ? body.name : current.name,
      description: body.description !== undefined ? body.description : body.descripcion !== undefined ? body.descripcion : current.description,
      price: body.price !== undefined ? body.price : current.price,
      aliases: body.aliases !== undefined ? body.aliases : JSON.parse(String(current.aliases || "[]")),
      stockStatus: body.stockStatus ?? body.stock_status ?? body.status ?? current.stock_status,
      stockQuantity: (body.stockQuantity !== undefined || body.stock_quantity !== undefined || body.quantity !== undefined || body.cantidad !== undefined) 
        ? (body.stockQuantity ?? body.stock_quantity ?? body.quantity ?? body.cantidad) 
        : current.stock_quantity,
    });
    
    await db.prepare("UPDATE products SET name = ?, description = ?, price = ?, aliases = ?, active = ?, stock_status = ?, stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?")
      .bind(product.name, product.description, product.price, product.aliases, body.active === undefined ? Number(current.active) : body.active ? 1 : 0, product.status, product.quantity, Date.now(), current.id, businessId).run();
    return NextResponse.json({ success: true, id: current.id, description: product.description, stockStatus: product.status, stockQuantity: product.quantity });
  } catch (error) { return apiErrorResponse(error, "Error actualizando variedad"); }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as ProductBody;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { roles: ["owner", "admin", "manager"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    await getD1().prepare("DELETE FROM products WHERE id = ? AND business_id = ?").bind(body.id, businessId).run();
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error, "Error eliminando variedad"); }
}
