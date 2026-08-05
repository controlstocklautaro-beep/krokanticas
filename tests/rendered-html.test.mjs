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

test("defines the current Nexo multi-company dashboard", async () => {
  const [page, layout, shell, operationalModules, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/DashboardShell.tsx", root), "utf8"),
    readFile(new URL("app/components/OperationalModules.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /<DashboardShell\s*\/>/);
  assert.match(layout, /Nexo \| Gestión multiempresa/);
  assert.match(shell, /MessagesModule businessId=\{business\.id\}/);
  assert.match(shell, /CustomersModule businessId=\{business\.id\}/);
  assert.match(shell, /TagsModule businessId=\{business\.id\}/);
  assert.match(shell, /FinancesModule businessId=\{business\.id\}/);
  assert.match(shell, /MetricsModule businessId=\{business\.id\}/);
  assert.match(operationalModules, /export function MessagesModule/);
  assert.match(operationalModules, /export function FinancesModule/);

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
});
