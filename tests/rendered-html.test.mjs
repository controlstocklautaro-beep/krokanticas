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
  const [page, layout, panel, panelStyles, operationalModules, pwaInstall, manifest, serviceWorker, n8nGuide, authForms, appAuth, usersModule, packageJson, database] = await Promise.all([
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
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("db/index.ts", root), "utf8"),
  ]);

  assert.match(page, /getAppUserBySessionToken/);
  assert.match(page, /redirect\("\/login"\)/);
  assert.match(page, /<KrokanticasPanel/);
  assert.match(layout, /Krokanticas \| Central de pedidos/);
  assert.match(panel, /MessagesModule businessId=\{business\.id\}/);
  assert.match(panel, /CustomersModule businessId=\{business\.id\}/);
  assert.match(panel, /\/api\/businesses/);
  assert.match(panel, /function StockModule/);
  assert.match(panel, /function KitchenModule/);
  assert.match(panel, /function HandoffsModule/);
  assert.doesNotMatch(panel, /WhatsApp pendiente/);
  assert.doesNotMatch(panel, /CONEXIONES EXTERNAS/);
  assert.match(panel, /from "lucide-react"/);
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
  assert.match(operationalModules, /messagesBodyRef\.current/);
  assert.doesNotMatch(operationalModules, /scrollIntoView/);
  assert.doesNotMatch(operationalModules, /chatData\.chats\[0\]\?\.phone_number/);
  assert.match(operationalModules, /searchParams\.set\("chat", phoneNumber\)/);
  assert.match(operationalModules, /window\.history\.back\(\)/);
  assert.match(panelStyles, /\.k-wa-messages-body::\-webkit-scrollbar/);
  assert.match(operationalModules, /preload="metadata"/);
  assert.match(panelStyles, /\.k-wa-bubble\.has-audio/);
  assert.match(operationalModules, /Pasaron más de 24 horas/);
  assert.match(operationalModules, /address: form\.get\("address"\)/);
  assert.match(authForms, /\/api\/auth\/login/);
  assert.match(authForms, /\/api\/auth\/forgot-password/);
  assert.match(authForms, /\/api\/auth\/reset-password/);
  assert.match(authForms, /\/api\/auth\/change-password/);
  assert.match(appAuth, /PBKDF2/);
  assert.match(appAuth, /HttpOnly; SameSite=Lax/);
  assert.match(usersModule, /\/api\/users/);

  const project = JSON.parse(packageJson);
  assert.equal(project.scripts.build, "next build");
  assert.ok(project.dependencies["@supabase/supabase-js"]);
  assert.ok(project.dependencies["lucide-react"]);
  assert.ok(project.dependencies.postgres);
  assert.match(database, /DATABASE_URL/);
  assert.match(database, /SUPABASE_SECRET_KEY/);
  assert.match(database, /SupabaseMediaBucket/);
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

  const migrationNames = await readdir(new URL("supabase/migrations/", root));
  const initialMigrationName = migrationNames.find((name) => name.endsWith(".sql"));
  assert.ok(initialMigrationName, "Missing Supabase PostgreSQL migration");
  const migration = await readFile(new URL(`supabase/migrations/${initialMigrationName}`, root), "utf8");
  assert.match(migration, /CREATE TABLE "tags"/);
  assert.match(migration, /CREATE TABLE "transactions"/);
  assert.match(migration, /CREATE TABLE "business_modules"/);

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
  assert.match(kitchenStore, /const total = subtotal \+ shippingCost/);
  assert.doesNotMatch(kitchenStore, /total = \? \+ \?/);
  const stock = await readFile(new URL("app/api/stock/route.ts", root), "utf8");
  const contacts = await readFile(new URL("app/api/contacts/route.ts", root), "utf8");
  const adjust = await readFile(new URL("app/api/stock/adjust/route.ts", root), "utf8");
  const messageList = await readFile(new URL("app/api/messages/route.ts", root), "utf8");
  const sendMessage = await readFile(new URL("app/api/send-message/route.ts", root), "utf8");
  const mediaUpload = await readFile(new URL("lib/server/media-upload.ts", root), "utf8");
  const outboundWebhook = await readFile(new URL("lib/server/outbound-webhook.ts", root), "utf8");
  const chatStore = await readFile(new URL("lib/server/chat-store.ts", root), "utf8");
  const mediaRoute = await readFile(new URL("app/api/media/[...key]/route.ts", root), "utf8");
  assert.match(stock, /stock_status/);
  assert.match(adjust, /Stock insuficiente/);
  assert.match(messageList, /ORDER BY created_at DESC LIMIT 500/);
  assert.match(messageList, /mediaProxyUrl/);
  assert.match(sendMessage, /whatsappReplyWindow/);
  assert.match(mediaUpload, /deliverOutboundMessage/);
  assert.match(mediaUpload, /signedUrl/);
  assert.match(outboundWebhook, /automation8n\.fluxia\.site\/webhook\/3e2c4ce3-7362-4db6-97d4-765886acce54/);
  assert.match(outboundWebhook, /phone_number/);
  assert.match(chatStore, /24 \* 60 \* 60 \* 1000/);
  assert.match(mediaRoute, /Accept-Ranges/);
  assert.match(mediaRoute, /status: 206/);
  assert.match(contacts, /searchParams\.get\("phone_number"\)/);
  assert.match(migration, /CREATE TABLE "products"/);
  assert.match(migration, /CREATE TABLE "orders"/);
  assert.match(migration, /"address" text/);
  assert.match(migration, /CREATE TABLE "handoffs"/);
  assert.match(migration, /CREATE TABLE "app_users"/);
  assert.match(migration, /CREATE TABLE "app_sessions"/);
  assert.match(migration, /CREATE TABLE "password_reset_tokens"/);
});
