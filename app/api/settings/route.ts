import { NextResponse } from "next/server";
import { getD1 } from "@/db";
import { ApiError, apiErrorResponse, businessIdFrom } from "@/lib/server/api-utils";
import { requireBusinessAccess } from "@/lib/server/business-context";

export type ShippingZone = { name: string; cost: number };

const DEFAULT_SETTINGS = {
  address: "Ruta 21 y calle Arroyo Seco. Empalme Villa Constitución.",
  activeAlias: 1,
  alias1: {
    alias: "Krokanticas2021",
    bank: "Mercado Pago",
    holder: "Matias Montes",
  },
  alias2: {
    alias: "Krokan2021",
    bank: "Mercado Pago",
    holder: "Fabian Gonzalo Montes",
  },
  shippingZones: [
    { name: "Empalme V.C.", cost: 3000 },
    { name: "Barrio Mitre (Pavón)", cost: 3000 },
    { name: "Pavón", cost: 4000 },
    { name: "Rincón de Pavón", cost: 6000 },
  ],
  scheduleLunch: "Martes a Viernes de 11:00 a 14:00 hs",
  scheduleDinner: "Miércoles a Domingo de 19:30 a 23:30 hs",
  scheduleNotes: "Mediodía: Mar a Vie 11:00 a 14:00 hs · Noche: Mié a Dom 19:30 a 23:30 hs",
};

function formatSettings(row: Record<string, unknown> | null) {
  const activeAliasNum = Number(row?.active_alias ?? DEFAULT_SETTINGS.activeAlias) === 2 ? 2 : 1;
  const alias1 = {
    alias: String(row?.alias_1_name || DEFAULT_SETTINGS.alias1.alias),
    bank: String(row?.alias_1_bank || DEFAULT_SETTINGS.alias1.bank),
    holder: String(row?.alias_1_holder || DEFAULT_SETTINGS.alias1.holder),
    active: activeAliasNum === 1,
  };
  const alias2 = {
    alias: String(row?.alias_2_name || DEFAULT_SETTINGS.alias2.alias),
    bank: String(row?.alias_2_bank || DEFAULT_SETTINGS.alias2.bank),
    holder: String(row?.alias_2_holder || DEFAULT_SETTINGS.alias2.holder),
    active: activeAliasNum === 2,
  };
  let shippingZones: ShippingZone[] = DEFAULT_SETTINGS.shippingZones;
  if (typeof row?.shipping_zones === "string" && row.shipping_zones.trim()) {
    try {
      const parsed = JSON.parse(row.shipping_zones);
      if (Array.isArray(parsed)) shippingZones = parsed;
    } catch {}
  }

  const activePaymentData = activeAliasNum === 2 ? {
    alias: alias2.alias,
    bank: alias2.bank,
    holder: alias2.holder,
  } : {
    alias: alias1.alias,
    bank: alias1.bank,
    holder: alias1.holder,
  };

  const scheduleLunch = String(row?.schedule_lunch || DEFAULT_SETTINGS.scheduleLunch);
  const scheduleDinner = String(row?.schedule_dinner || DEFAULT_SETTINGS.scheduleDinner);
  const scheduleNotes = String(row?.schedule_notes || `Mediodía: ${scheduleLunch} · Noche: ${scheduleDinner}`);

  return {
    store_open: Number(row?.store_open ?? 1),
    delay_minutes: Number(row?.delay_minutes ?? 30),
    courier_active: Number(row?.courier_active ?? 1),
    address: String(row?.address || DEFAULT_SETTINGS.address),
    active_alias: activeAliasNum,
    alias_1: alias1,
    alias_2: alias2,
    active_payment_data: activePaymentData,
    shipping_zones: shippingZones,
    schedule_lunch: scheduleLunch,
    schedule_dinner: scheduleDinner,
    schedule_notes: scheduleNotes,
    schedules: {
      lunch: scheduleLunch,
      dinner: scheduleDinner,
      summary: scheduleNotes,
    },
    updated_at: Number(row?.updated_at ?? Date.now()),
  };
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    await requireBusinessAccess(req, businessId, { allowIntegration: true });
    const db = getD1();
    let row = await db.prepare("SELECT store_open, delay_minutes, courier_active, address, active_alias, alias_1_name, alias_1_bank, alias_1_holder, alias_2_name, alias_2_bank, alias_2_holder, shipping_zones, schedule_lunch, schedule_dinner, schedule_notes, updated_at FROM business_settings WHERE business_id = ?").bind(businessId).first();
    if (!row) {
      const now = Date.now();
      await db.prepare(`
        INSERT INTO business_settings (
          business_id, store_open, delay_minutes, courier_active,
          address, active_alias,
          alias_1_name, alias_1_bank, alias_1_holder,
          alias_2_name, alias_2_bank, alias_2_holder,
          shipping_zones, schedule_lunch, schedule_dinner, schedule_notes,
          updated_at
        ) VALUES (?, 1, 30, 1, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        businessId,
        DEFAULT_SETTINGS.address,
        DEFAULT_SETTINGS.alias1.alias,
        DEFAULT_SETTINGS.alias1.bank,
        DEFAULT_SETTINGS.alias1.holder,
        DEFAULT_SETTINGS.alias2.alias,
        DEFAULT_SETTINGS.alias2.bank,
        DEFAULT_SETTINGS.alias2.holder,
        JSON.stringify(DEFAULT_SETTINGS.shippingZones),
        DEFAULT_SETTINGS.scheduleLunch,
        DEFAULT_SETTINGS.scheduleDinner,
        DEFAULT_SETTINGS.scheduleNotes,
        now,
      ).run();
      row = await db.prepare("SELECT store_open, delay_minutes, courier_active, address, active_alias, alias_1_name, alias_1_bank, alias_1_holder, alias_2_name, alias_2_bank, alias_2_holder, shipping_zones, schedule_lunch, schedule_dinner, schedule_notes, updated_at FROM business_settings WHERE business_id = ?").bind(businessId).first();
    }
    return NextResponse.json({ settings: formatSettings(row) });
  } catch (error) { return apiErrorResponse(error, "Error consultando configuración"); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      businessId?: string;
      storeOpen?: boolean;
      delayMinutes?: number;
      courierActive?: boolean;
      address?: string;
      activeAlias?: number;
      alias1Name?: string;
      alias1Bank?: string;
      alias1Holder?: string;
      alias2Name?: string;
      alias2Bank?: string;
      alias2Holder?: string;
      shippingZones?: ShippingZone[];
      scheduleLunch?: string;
      scheduleDinner?: string;
      scheduleNotes?: string;
    };
    const businessId = businessIdFrom(req, body.businessId);
    await requireBusinessAccess(req, businessId, { allowIntegration: true, roles: ["owner", "admin", "manager", "staff"] });
    const delay = body.delayMinutes === undefined ? null : Number(body.delayMinutes);
    if (delay !== null && ![15, 30, 45].includes(delay)) throw new ApiError("La demora debe ser 15, 30 o 45", 400);

    const activeAlias = body.activeAlias !== undefined ? (Number(body.activeAlias) === 2 ? 2 : 1) : null;
    const shippingZonesJson = Array.isArray(body.shippingZones) ? JSON.stringify(body.shippingZones) : null;

    const db = getD1();
    const now = Date.now();
    await db.prepare(`
      INSERT INTO business_settings (
        business_id, store_open, delay_minutes, courier_active,
        address, active_alias,
        alias_1_name, alias_1_bank, alias_1_holder,
        alias_2_name, alias_2_bank, alias_2_holder,
        shipping_zones, schedule_lunch, schedule_dinner, schedule_notes,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id) DO UPDATE SET
        store_open = COALESCE(?, business_settings.store_open),
        delay_minutes = COALESCE(?, business_settings.delay_minutes),
        courier_active = COALESCE(?, business_settings.courier_active),
        address = COALESCE(?, business_settings.address),
        active_alias = COALESCE(?, business_settings.active_alias),
        alias_1_name = COALESCE(?, business_settings.alias_1_name),
        alias_1_bank = COALESCE(?, business_settings.alias_1_bank),
        alias_1_holder = COALESCE(?, business_settings.alias_1_holder),
        alias_2_name = COALESCE(?, business_settings.alias_2_name),
        alias_2_bank = COALESCE(?, business_settings.alias_2_bank),
        alias_2_holder = COALESCE(?, business_settings.alias_2_holder),
        shipping_zones = COALESCE(?, business_settings.shipping_zones),
        schedule_lunch = COALESCE(?, business_settings.schedule_lunch),
        schedule_dinner = COALESCE(?, business_settings.schedule_dinner),
        schedule_notes = COALESCE(?, business_settings.schedule_notes),
        updated_at = ?
    `).bind(
      businessId,
      body.storeOpen === false ? 0 : 1,
      delay ?? 30,
      body.courierActive === false ? 0 : 1,
      body.address?.trim() || DEFAULT_SETTINGS.address,
      activeAlias ?? 1,
      body.alias1Name?.trim() || DEFAULT_SETTINGS.alias1.alias,
      body.alias1Bank?.trim() || DEFAULT_SETTINGS.alias1.bank,
      body.alias1Holder?.trim() || DEFAULT_SETTINGS.alias1.holder,
      body.alias2Name?.trim() || DEFAULT_SETTINGS.alias2.alias,
      body.alias2Bank?.trim() || DEFAULT_SETTINGS.alias2.bank,
      body.alias2Holder?.trim() || DEFAULT_SETTINGS.alias2.holder,
      shippingZonesJson || JSON.stringify(DEFAULT_SETTINGS.shippingZones),
      body.scheduleLunch?.trim() || DEFAULT_SETTINGS.scheduleLunch,
      body.scheduleDinner?.trim() || DEFAULT_SETTINGS.scheduleDinner,
      body.scheduleNotes?.trim() || DEFAULT_SETTINGS.scheduleNotes,
      now,
      // En DO UPDATE SET
      body.storeOpen === undefined ? null : body.storeOpen ? 1 : 0,
      delay,
      body.courierActive === undefined ? null : body.courierActive ? 1 : 0,
      body.address === undefined ? null : body.address.trim(),
      activeAlias,
      body.alias1Name === undefined ? null : body.alias1Name.trim(),
      body.alias1Bank === undefined ? null : body.alias1Bank.trim(),
      body.alias1Holder === undefined ? null : body.alias1Holder.trim(),
      body.alias2Name === undefined ? null : body.alias2Name.trim(),
      body.alias2Bank === undefined ? null : body.alias2Bank.trim(),
      body.alias2Holder === undefined ? null : body.alias2Holder.trim(),
      shippingZonesJson,
      body.scheduleLunch === undefined ? null : body.scheduleLunch.trim(),
      body.scheduleDinner === undefined ? null : body.scheduleDinner.trim(),
      body.scheduleNotes === undefined ? null : body.scheduleNotes.trim(),
      now,
    ).run();

    const row = await db.prepare("SELECT store_open, delay_minutes, courier_active, address, active_alias, alias_1_name, alias_1_bank, alias_1_holder, alias_2_name, alias_2_bank, alias_2_holder, shipping_zones, schedule_lunch, schedule_dinner, schedule_notes, updated_at FROM business_settings WHERE business_id = ?").bind(businessId).first();
    return NextResponse.json({ success: true, settings: formatSettings(row) });
  } catch (error) { return apiErrorResponse(error, "Error actualizando configuración"); }
}
