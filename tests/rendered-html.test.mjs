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
  const [page, layout, panel, panelStyles, operationalModules, pwaInstall, manifest, serviceWorker, n8nGuide, authForms, appAuth, usersModule, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/KrokanticasPanel.tsx", root), "utf8"),
    readFile(new URL("app/krokanticas.css", root), "utf8"),
    readFile(new URL("app/components/OperationalModules.tsx", root), "utf8"),
    readFile(new URL("app/components/PwaInstall.tsx", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("docs/KROKANTICAS_N8N_HANDOFF.md", root), "utf8"),
    readFile(new URL("app/components/AuthForms.tsx", root), "utf8"),
    readFile(new URL("lib/server/app-auth.ts", root), "utf8"),
    readFile(new URL("app/components/UsersModule.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /getAppUserBySessionToken/);
  assert.match(page, /redirect\("\/login"\)/);
  assert.match(page, /<KrokanticasPanel/);
  assert.match(layout, /Krokanticas \| Central de pedidos/);
  assert.match(panel, /MessagesModule businessId=\{BUSINESS_ID\}/);
  assert.match(panel, /CustomersModule businessId=\{BUSINESS_ID\}/);
  assert.match(panel, /function StockModule/);
  assert.match(panel, /function KitchenModule/);
  assert.match(panel, /function HandoffsModule/);
  assert.match(panel, /WhatsApp pendiente/);
  assert.match(panel, /Object\.entries\(editItems\)/);
  assert.match(panel, /<PwaInstall/);
  assert.match(panel, /<UsersModule/);
  assert.match(panel, /\/api\/auth\/logout/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layout, /appleWebApp/);
  assert.match(pwaInstall, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(pwaInstall, /beforeinstallprompt/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /caches\.match\("\/offline\.html"\)/);
  assert.match(panelStyles, /Application typography/);
  assert.match(panelStyles, /font-size:clamp\(36px,3\.2vw,48px\)/);
  assert.match(panelStyles, /\.k-module \.bubble \{[^}]*font-size:15px/);
  for (const endpoint of exactRamayoEndpoints) assert.match(n8nGuide, new RegExp(`/api/${endpoint}`));
  assert.match(n8nGuide, /No se crea comanda antes de una confirmación explícita/);
  const pwaManifest = JSON.parse(manifest);
  assert.equal(pwaManifest.display, "standalone");
  assert.equal(pwaManifest.start_url, "/");
  assert.ok(pwaManifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.match(operationalModules, /export function MessagesModule/);
  assert.match(operationalModules, /address: form\.get\("address"\)/);
  assert.match(authForms, /\/api\/auth\/login/);
  assert.match(authForms, /\/api\/auth\/forgot-password/);
  assert.match(authForms, /\/api\/auth\/reset-password/);
  assert.match(authForms, /\/api\/auth\/change-password/);
  assert.match(appAuth, /PBKDF2/);
  assert.match(appAuth, /HttpOnly; SameSite=Lax/);
  assert.match(usersModule, /\/api\/users/);

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
  const contacts = await readFile(new URL("app/api/contacts/route.ts", root), "utf8");
  const adjust = await readFile(new URL("app/api/stock/adjust/route.ts", root), "utf8");
  assert.match(stock, /stock_status/);
  assert.match(adjust, /Stock insuficiente/);
  assert.match(contacts, /searchParams\.get\("phone_number"\)/);
  const krokanticasMigration = await readFile(new URL("drizzle/0002_daffy_proemial_gods.sql", root), "utf8");
  assert.match(krokanticasMigration, /CREATE TABLE `products`/);
  assert.match(krokanticasMigration, /CREATE TABLE `orders`/);
  assert.match(krokanticasMigration, /ALTER TABLE `contacts` ADD `address`/);
  const migrations = await readdir(new URL("drizzle/", root));
  const handoffMigrationName = migrations.find((name) => name.startsWith("0003_") && name.endsWith(".sql"));
  assert.ok(handoffMigrationName, "Missing handoffs migration");
  const handoffMigration = await readFile(new URL(`drizzle/${handoffMigrationName}`, root), "utf8");
  assert.match(handoffMigration, /CREATE TABLE `handoffs`/);
  const authMigrationName = migrations.find((name) => name.startsWith("0004_") && name.endsWith(".sql"));
  assert.ok(authMigrationName, "Missing application authentication migration");
  const authMigration = await readFile(new URL(`drizzle/${authMigrationName}`, root), "utf8");
  assert.match(authMigration, /CREATE TABLE `app_users`/);
  assert.match(authMigration, /CREATE TABLE `app_sessions`/);
  assert.match(authMigration, /CREATE TABLE `password_reset_tokens`/);
});
