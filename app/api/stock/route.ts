import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

type StockStatus = "available" | "limited" | "soldout";
type ProductBody = { businessId?: string; id?: string; name?: string; price?: number; aliases?: string[]; active?: boolean; stockStatus?: StockStatus; stockQuantity?: number | null };

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

function normalized(body: ProductBody) {
  const name = body.name?.trim();
  if (!name) throw new ApiError("Falta name", 400);
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) throw new ApiError("Precio inválido", 400);
  const status: StockStatus = body.stockStatus === "limited" || body.stockStatus === "soldout" ? body.stockStatus : "available";
  const quantity = status === "limited" ? Math.max(0, Math.floor(Number(body.stockQuantity ?? 0))) : null;
  return { name, price, status, quantity, aliases: JSON.stringify(Array.isArray(body.aliases) ? body.aliases.map((alias) => String(alias).trim()).filter(Boolean) : []) };
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    await seedCatalog(businessId);
    const result = await getD1().prepare("SELECT id, name, price, aliases, active, stock_status, stock_quantity, updated_at FROM products WHERE business_id = ? AND active = 1 ORDER BY name ASC").bind(businessId).all();
    return NextResponse.json({ products: result.results.map((row) => ({ ...row, aliases: JSON.parse(String(row.aliases || "[]")) })) });
  } catch (error) { return apiErrorResponse(error, "Error consultando stock"); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as ProductBody;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager"] });
    const product = normalized(body);
    const id = crypto.randomUUID(); const now = Date.now();
    await getD1().prepare("INSERT INTO products (id, business_id, name, price, aliases, active, stock_status, stock_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)")
      .bind(id, businessId, product.name, product.price, product.aliases, product.status, product.quantity, now, now).run();
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, "Error creando variedad"); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as ProductBody;
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager"] });
    if (!body.id) throw new ApiError("Falta id", 400);
    const current = await getD1().prepare("SELECT name, price, aliases, active, stock_status, stock_quantity FROM products WHERE id = ? AND business_id = ?").bind(body.id, businessId).first<Record<string, unknown>>();
    if (!current) throw new ApiError("Variedad no encontrada", 404);
    const product = normalized({ name: body.name ?? String(current.name), price: body.price ?? Number(current.price), aliases: body.aliases ?? JSON.parse(String(current.aliases)), stockStatus: body.stockStatus ?? current.stock_status as StockStatus, stockQuantity: body.stockQuantity === undefined ? current.stock_quantity as number | null : body.stockQuantity });
    await getD1().prepare("UPDATE products SET name = ?, price = ?, aliases = ?, active = ?, stock_status = ?, stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?")
      .bind(product.name, product.price, product.aliases, body.active === undefined ? Number(current.active) : body.active ? 1 : 0, product.status, product.quantity, Date.now(), body.id, businessId).run();
    return NextResponse.json({ success: true });
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
