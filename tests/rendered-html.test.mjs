import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const exactRamayoEndpoints = [
  "assign-tags",
  "bot-status",
  "cleanup-expired-media",
  "delete-all-chats",
  "delete-chat",
  "ingest-message",
  "remove-tags",
  "send-message",
  "toggle-bot",
  "upload-image",
  "upload-media",
];

test("defines the authenticated Krokanticas operations panel", async () => {
  const [page, layout, panel, operationalModules, auth, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/KrokanticasPanel.tsx", root), "utf8"),
    readFile(new URL("app/components/OperationalModules.tsx", root), "utf8"),
    readFile(new URL("app/chatgpt-auth.ts", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /requireChatGPTUser/);
  assert.match(page, /<KrokanticasPanel/);
  assert.match(layout, /Krokanticas \| Central de pedidos/);
  assert.match(panel, /MessagesModule businessId=\{BUSINESS_ID\}/);
  assert.match(panel, /CustomersModule businessId=\{BUSINESS_ID\}/);
  assert.match(panel, /function StockModule/);
  assert.match(panel, /function KitchenModule/);
  assert.match(panel, /function HandoffsModule/);
  assert.match(panel, /WhatsApp pendiente/);
  assert.match(panel, /Object\.entries\(editItems\)/);
  assert.match(operationalModules, /export function MessagesModule/);
  assert.match(operationalModules, /address: form\.get\("address"\)/);
  assert.match(auth, /signin-with-chatgpt/);

  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, "MEDIA");
});

test("keeps every Ramayo endpoint name exactly", async () => {
  const apiDirectories = await readdir(new URL("app/api/", root), { withFileTypes: true });
  const names = new Set(apiDirectories.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  for (const endpoint of exactRamayoEndpoints) {
    assert.ok(names.has(endpoint), `Missing exact endpoint /api/${endpoint}`);
    const source = await readFile(new URL(`app/api/${endpoint}/route.ts`, root), "utf8");
    assert.match(source, /export async function (GET|POST|DELETE|PATCH)/);
  }
});

test("includes persistent operational APIs and migrations", async () => {
  for (const endpoint of ["contacts", "chats", "messages", "tags", "finances", "metrics"]) {
    const source = await readFile(new URL(`app/api/${endpoint}/route.ts`, root), "utf8");
    assert.match(source, /requireBusinessAccess/);
  }

  for (const endpoint of ["columns", "leads"]) {
    const source = await readFile(new URL(`app/api/pipeline/${endpoint}/route.ts`, root), "utf8");
    assert.match(source, /requireBusinessAccess/);
  }

  const migration = await readFile(new URL("drizzle/0001_mute_sleeper.sql", root), "utf8");
  assert.match(migration, /CREATE TABLE `tags`/);
  assert.match(migration, /CREATE TABLE `transactions`/);

  for (const endpoint of ["create", "edit", "delete", "orders"]) {
    const source = await readFile(new URL(`app/api/kitchen/${endpoint}/route.ts`, root), "utf8");
    assert.match(source, /requireBusinessAccess/);
  }
  const handoffs = await readFile(new URL("app/api/handoffs/route.ts", root), "utf8");
  assert.match(handoffs, /requireBusinessAccess/);
  assert.match(handoffs, /export async function GET/);
  assert.match(handoffs, /export async function POST/);
  assert.match(handoffs, /export async function PATCH/);
  assert.match(handoffs, /export async function DELETE/);
  const kitchenStore = await readFile(new URL("lib/server/kitchen-store.ts", root), "utf8");
  assert.match(kitchenStore, /DELETE FROM order_items/);
  assert.match(kitchenStore, /subtotal = prepared\.reduce/);
  const stock = await readFile(new URL("app/api/stock/route.ts", root), "utf8");
  const adjust = await readFile(new URL("app/api/stock/adjust/route.ts", root), "utf8");
  assert.match(stock, /stock_status/);
  assert.match(adjust, /Stock insuficiente/);
  const krokanticasMigration = await readFile(new URL("drizzle/0002_daffy_proemial_gods.sql", root), "utf8");
  assert.match(krokanticasMigration, /CREATE TABLE `products`/);
  assert.match(krokanticasMigration, /CREATE TABLE `orders`/);
  assert.match(krokanticasMigration, /ALTER TABLE `contacts` ADD `address`/);
  const migrations = await readdir(new URL("drizzle/", root));
  const handoffMigrationName = migrations.find((name) => name.startsWith("0003_") && name.endsWith(".sql"));
  assert.ok(handoffMigrationName, "Missing handoffs migration");
  const handoffMigration = await readFile(new URL(`drizzle/${handoffMigrationName}`, root), "utf8");
  assert.match(handoffMigration, /CREATE TABLE `handoffs`/);
});
