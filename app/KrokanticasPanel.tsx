"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CustomersModule, MessagesModule } from "./components/OperationalModules";

const BUSINESS_ID = "krokanticas";

type Section = "overview" | "messages" | "contacts" | "handoffs" | "stock" | "kitchen";
type Product = { id: string; name: string; price: number; aliases: string[]; active: number; stock_status: "available" | "limited" | "soldout"; stock_quantity: number | null };
type Contact = { id: string; name: string; phone_number: string; address?: string | null };
type OrderItem = { id: string; product_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number };
type Order = { id: string; contact_id: string; order_number: number; customer_name: string; phone_number: string; delivery_type: "pickup" | "delivery"; address?: string | null; zone?: string | null; payment_method: "cash" | "transfer"; scheduled_time: string; subtotal: number; shipping_cost: number; total: number; status: "confirmed" | "in_kitchen" | "ready" | "delivered" | "cancelled"; notes?: string | null; created_at: number; items: OrderItem[] };
type Settings = { store_open: number; delay_minutes: number; courier_active: number };
type Handoff = { id: string; contact_id?: string | null; order_id?: string | null; phone_number?: string | null; customer_name: string; reason: "complaint" | "ambiguity" | "human_request" | "post_confirmation_change" | "other"; summary: string; priority: "low" | "medium" | "high"; status: "open" | "in_progress" | "resolved"; assigned_to?: string | null; created_at: number; updated_at: number; resolved_at?: number | null };

const sections: { id: Section; label: string; icon: string; group: string }[] = [
  { id: "overview", label: "Inicio", icon: "⌂", group: "OPERACIÓN" },
  { id: "kitchen", label: "Cocina", icon: "▤", group: "OPERACIÓN" },
  { id: "stock", label: "Stock", icon: "◫", group: "OPERACIÓN" },
  { id: "messages", label: "Conversaciones", icon: "◌", group: "ATENCIÓN" },
  { id: "handoffs", label: "Derivaciones", icon: "!", group: "ATENCIÓN" },
  { id: "contacts", label: "Contactos", icon: "◎", group: "ATENCIÓN" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export function KrokanticasPanel({ user }: { user: { displayName: string; email: string } }) {
  const [active, setActive] = useState<Section>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const name = user.displayName.includes("@") ? "Equipo Krokanticas" : user.displayName;
  const choose = (section: Section) => { setActive(section); setMobileOpen(false); };

  return <div className="k-app">
    {mobileOpen && <button className="k-overlay" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
    <aside className={`k-sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="k-brand"><span className="k-brand-mark">K</span><div><strong>KROKANTICAS</strong><small>Central de pedidos</small></div></div>
      <div className="k-wa pending"><i /> WhatsApp pendiente <span>POR INTEGRAR</span></div>
      <nav aria-label="Navegación Krokanticas">{["OPERACIÓN", "ATENCIÓN"].map((group) => <div className="k-nav-group" key={group}><p>{group}</p>{sections.filter((section) => section.group === group).map((section) => <button key={section.id} className={active === section.id ? "active" : ""} onClick={() => choose(section.id)}><span>{section.icon}</span>{section.label}{["kitchen", "handoffs"].includes(section.id) && <b>●</b>}</button>)}</div>)}</nav>
      <div className="k-sidebar-bottom"><div className="k-help"><strong>¿Necesitás intervenir?</strong><small>Usá Derivaciones para tomar reclamos o casos ambiguos.</small></div><div className="k-profile"><span>{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><small>{user.email}</small></div><a href="/signout-with-chatgpt?return_to=/">Salir</a></div></div>
    </aside>
    <main className="k-main">
      <header className="k-topbar"><button className="k-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">☰</button><div><span>Krokanticas</span><b>/</b><strong>{sections.find((section) => section.id === active)?.label}</strong></div><div className="k-top-actions"><span className="k-live">● Panel operativo</span></div></header>
      <section className="k-content">
        {active === "overview" && <Overview onNavigate={choose} />}
        {active === "kitchen" && <KitchenModule />}
        {active === "stock" && <StockModule />}
        {active === "messages" && <div className="k-module"><MessagesModule businessId={BUSINESS_ID} /></div>}
        {active === "handoffs" && <HandoffsModule />}
        {active === "contacts" && <div className="k-module"><CustomersModule businessId={BUSINESS_ID} /></div>}
      </section>
    </main>
  </div>;
}

function Overview({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [error, setError] = useState("");

  async function reload() {
    const [settingsData, orderData, productData, contactData, handoffData] = await Promise.all([
      api<{ settings: Settings }>(`/api/settings?businessId=${BUSINESS_ID}`),
      api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${BUSINESS_ID}`),
      api<{ products: Product[] }>(`/api/stock?businessId=${BUSINESS_ID}`),
      api<{ contacts: Contact[] }>(`/api/contacts?businessId=${BUSINESS_ID}`),
      api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${BUSINESS_ID}`),
    ]);
    setSettings(settingsData.settings); setOrders(orderData.orders); setProducts(productData.products); setContacts(contactData.contacts); setHandoffs(handoffData.handoffs);
  }

  useEffect(() => {
    void Promise.all([
      api<{ settings: Settings }>(`/api/settings?businessId=${BUSINESS_ID}`),
      api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${BUSINESS_ID}`),
      api<{ products: Product[] }>(`/api/stock?businessId=${BUSINESS_ID}`),
      api<{ contacts: Contact[] }>(`/api/contacts?businessId=${BUSINESS_ID}`),
      api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${BUSINESS_ID}`),
    ]).then(([settingsData, orderData, productData, contactData, handoffData]) => {
      setSettings(settingsData.settings); setOrders(orderData.orders); setProducts(productData.products); setContacts(contactData.contacts); setHandoffs(handoffData.handoffs);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar"));
  }, []);

  async function updateSettings(change: Partial<{ storeOpen: boolean; delayMinutes: number; courierActive: boolean }>) {
    try {
      await api("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, ...change }) });
      await reload();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar"); }
  }

  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const lowStock = products.filter((product) => product.stock_status !== "available");
  const attentionCases = handoffs.filter((handoff) => handoff.status !== "resolved");

  return <div className="k-module">
    <div className="k-heading"><div><span className="k-eyebrow">TURNO ACTUAL</span><h1>Todo listo para operar.</h1><p>Pedidos, cocina, stock y atención humana en una sola vista.</p></div><button className="k-primary" onClick={() => onNavigate("kitchen")}>＋ Nueva comanda</button></div>
    {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}
    <div className="k-settings"><button className={settings?.store_open ? "on" : "off"} onClick={() => updateSettings({ storeOpen: !settings?.store_open })}><span>{settings?.store_open ? "ABIERTO" : "CERRADO"}</span><strong>Local</strong><small>Tocá para cambiar</small></button><button onClick={() => updateSettings({ delayMinutes: settings?.delay_minutes === 15 ? 30 : settings?.delay_minutes === 30 ? 45 : 15 })}><span>DEMORA</span><strong>{settings?.delay_minutes ?? 30} min</strong><small>15, 30 o 45 minutos</small></button><button className={settings?.courier_active ? "on" : "off"} onClick={() => updateSettings({ courierActive: !settings?.courier_active })}><span>CADETE</span><strong>{settings?.courier_active ? "Disponible" : "No disponible"}</strong><small>Controla los envíos</small></button></div>
    <div className="k-kpis"><article><span className="orange">▤</span><div><small>En cocina</small><strong>{activeOrders.length}</strong><em>{orders.filter((order) => order.status === "ready").length} listos para entregar</em></div></article><article><span className="gold">◫</span><div><small>Stock con alerta</small><strong>{lowStock.length}</strong><em>{products.filter((product) => product.stock_status === "soldout").length} variedades agotadas</em></div></article><article className={attentionCases.length ? "attention" : ""}><span className="red">!</span><div><small>Atención humana</small><strong>{attentionCases.length}</strong><em>{attentionCases.filter((handoff) => handoff.priority === "high").length} casos prioritarios</em></div></article></div>
    <div className="k-overview-grid">
      <div className="k-card"><div className="k-card-head"><div><span className="k-eyebrow">PEDIDOS</span><h2>Confirmados pendientes</h2></div><button onClick={() => onNavigate("kitchen")}>Ver cocina →</button></div>{activeOrders.slice(0, 4).map((order) => <div className="k-mini-order" key={order.id}><b>#{String(order.order_number).padStart(3, "0")}</b><span><strong>{order.customer_name}</strong><small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} unidades · {order.delivery_type === "delivery" ? "Envío" : "Retiro"}</small></span><em>{order.scheduled_time}</em></div>)}{!activeOrders.length && <div className="k-empty">No hay pedidos pendientes.</div>}</div>
      <div className="k-card"><div className="k-card-head"><div><span className="k-eyebrow">ATENCIÓN</span><h2>Acciones rápidas</h2></div></div><div className="k-quick"><button onClick={() => onNavigate("handoffs")}><span>!</span><strong>Resolver derivaciones</strong><small>Reclamos y casos ambiguos</small></button><button onClick={() => onNavigate("messages")}><span>◌</span><strong>Ver conversaciones</strong><small>Atender o apagar el bot</small></button><button onClick={() => onNavigate("stock")}><span>◫</span><strong>Actualizar stock</strong><small>Disponible, poco o agotado</small></button><button onClick={() => onNavigate("contacts")}><span>◎</span><strong>Buscar contacto</strong><small>{contacts.length} contactos con dirección por API</small></button></div></div>
    </div>
    <div className="k-card k-integrations"><div className="k-card-head"><div><span className="k-eyebrow">CONEXIONES EXTERNAS</span><h2>Preparadas para integrar</h2></div><small>El panel ya funciona sin estas conexiones</small></div><div className="k-integration-list"><div><span>WhatsApp Business oficial</span><b>Pendiente de credenciales</b></div><div><span>Automatizaciones n8n</span><b>Pendiente de webhook y clave</b></div><div><span>Agente IA y audios</span><b>Pendiente de proveedor</b></div></div></div>
  </div>;
}

function StockModule() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState("");
  async function reload() { const data = await api<{ products: Product[] }>(`/api/stock?businessId=${BUSINESS_ID}`); setProducts(data.products); }
  useEffect(() => { void api<{ products: Product[] }>(`/api/stock?businessId=${BUSINESS_ID}`).then((data) => setProducts(data.products)).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar")); }, []);
  async function adjust(product: Product, delta: number) { try { await api("/api/stock/adjust", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, productId: product.id, delta }) }); await reload(); } catch (adjustError) { setError(adjustError instanceof Error ? adjustError.message : "No se pudo ajustar"); } }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editing) return; const form = new FormData(event.currentTarget); const status = String(form.get("status")); try { await api("/api/stock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, id: editing.id, name: form.get("name"), price: Number(form.get("price")), aliases: String(form.get("aliases") || "").split(","), stockStatus: status, stockQuantity: status === "limited" ? Number(form.get("quantity")) : null, active: true }) }); setEditing(null); await reload(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar"); } }
  const filtered = products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="k-module"><div className="k-heading"><div><span className="k-eyebrow">{products.length} VARIEDADES</span><h1>Stock del día</h1><p>Solo cargá una cantidad exacta cuando queden pocas unidades.</p></div><label className="k-search">⌕<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar variedad" /></label></div>{error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}<div className="k-stock-grid">{filtered.map((product) => <article className={`k-stock-card ${product.stock_status}`} key={product.id}><div className="k-stock-top"><span className="k-food-icon">◒</span><b className="k-stock-state">{product.stock_status === "available" ? "DISPONIBLE" : product.stock_status === "limited" ? "POCO STOCK" : "AGOTADA"}</b></div><h2>{product.name}</h2><p>{money(product.price)} por unidad</p><div className="k-stock-bottom">{product.stock_status === "limited" ? <div className="k-stepper"><button onClick={() => adjust(product, -1)}>−</button><strong>{product.stock_quantity}</strong><button onClick={() => adjust(product, 1)}>＋</button></div> : <small>{product.stock_status === "available" ? "Sin cantidad limitada" : "No aceptar pedidos"}</small>}<button className="k-edit" onClick={() => setEditing(product)}>Editar</button></div></article>)}</div>{editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="modal k-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="k-eyebrow">VARIEDAD</span><h2>Editar stock</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><label>Nombre<input name="name" defaultValue={editing.name} required /></label><div className="form-grid"><label>Precio<input name="price" type="number" min="0" defaultValue={editing.price} /></label><label>Estado<select name="status" defaultValue={editing.stock_status}><option value="available">Disponible</option><option value="limited">Poco stock</option><option value="soldout">Agotada</option></select></label></div><label>Cantidad restante<input name="quantity" type="number" min="0" defaultValue={editing.stock_quantity ?? 0} /></label><label>Sinónimos separados por coma<textarea name="aliases" defaultValue={editing.aliases.join(", ")} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="k-primary">Guardar cambios</button></div></form></div>}</div>;
}

function HandoffsModule() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<"active" | Handoff["status"] | "all">("active");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    const [handoffData, contactData] = await Promise.all([api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${BUSINESS_ID}`), api<{ contacts: Contact[] }>(`/api/contacts?businessId=${BUSINESS_ID}`)]);
    setHandoffs(handoffData.handoffs); setContacts(contactData.contacts);
  }
  useEffect(() => { void Promise.all([api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${BUSINESS_ID}`), api<{ contacts: Contact[] }>(`/api/contacts?businessId=${BUSINESS_ID}`)]).then(([handoffData, contactData]) => { setHandoffs(handoffData.handoffs); setContacts(contactData.contacts); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar")); }, []);
  const visible = handoffs.filter((handoff) => filter === "all" || filter === "active" && handoff.status !== "resolved" || handoff.status === filter);
  const reasonLabel: Record<Handoff["reason"], string> = { complaint: "Reclamo", ambiguity: "Caso ambiguo", human_request: "Pidió atención humana", post_confirmation_change: "Cambio luego de confirmar", other: "Otro" };
  const priorityLabel: Record<Handoff["priority"], string> = { low: "Baja", medium: "Media", high: "Alta" };

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const contactId = String(form.get("contactId") || ""); const contact = contacts.find((item) => item.id === contactId);
    try {
      await api("/api/handoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, contactId: contactId || undefined, customerName: contact?.name || form.get("customerName"), phoneNumber: contact?.phone_number || form.get("phoneNumber"), reason: form.get("reason"), priority: form.get("priority"), summary: form.get("summary") }) });
      setCreating(false); await reload();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "No se pudo crear"); }
  }

  async function update(handoff: Handoff, change: Partial<Pick<Handoff, "status" | "priority">> & { assignedTo?: string }) {
    try { await api("/api/handoffs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, id: handoff.id, ...change }) }); await reload(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar"); }
  }

  async function remove(handoff: Handoff) {
    if (!window.confirm(`¿Eliminar la derivación de ${handoff.customer_name}?`)) return;
    try { await api("/api/handoffs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, id: handoff.id }) }); await reload(); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar"); }
  }

  return <div className="k-module">
    <div className="k-heading"><div><span className="k-eyebrow">ATENCIÓN HUMANA</span><h1>Derivaciones y reclamos</h1><p>Tomá los casos que el agente no debe resolver solo y dejá registro hasta cerrarlos.</p></div><button className="k-primary" onClick={() => setCreating(true)}>＋ Nueva derivación</button></div>
    {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}
    <div className="k-tabs"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Pendientes</button><button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Sin tomar</button><button className={filter === "in_progress" ? "active" : ""} onClick={() => setFilter("in_progress")}>En atención</button><button className={filter === "resolved" ? "active" : ""} onClick={() => setFilter("resolved")}>Resueltos</button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button></div>
    <div className="k-handoff-grid">{visible.map((handoff) => <article className={`k-handoff-card ${handoff.priority} ${handoff.status}`} key={handoff.id}><div className="k-handoff-head"><div><b className="k-priority">PRIORIDAD {priorityLabel[handoff.priority].toUpperCase()}</b><span>{reasonLabel[handoff.reason]}</span></div><time>{new Date(handoff.created_at).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div><div className="k-handoff-person"><span>{handoff.customer_name.slice(0, 2).toUpperCase()}</span><div><h2>{handoff.customer_name}</h2><p>{handoff.phone_number || "Sin teléfono"}{handoff.order_id ? " · vinculada a comanda" : ""}</p></div></div><p className="k-handoff-summary">{handoff.summary}</p><div className="k-handoff-owner"><span>{handoff.status === "open" ? "Sin tomar" : handoff.status === "in_progress" ? `Atiende: ${handoff.assigned_to || "Equipo"}` : "Resuelto"}</span><select aria-label="Prioridad" value={handoff.priority} onChange={(event) => update(handoff, { priority: event.target.value as Handoff["priority"] })}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></div><div className="k-handoff-actions">{handoff.status === "open" && <button className="main" onClick={() => update(handoff, { status: "in_progress", assignedTo: "Equipo Krokanticas" })}>Tomar caso</button>}{handoff.status === "in_progress" && <button className="main" onClick={() => update(handoff, { status: "resolved" })}>Marcar resuelto</button>}{handoff.status === "resolved" && <button onClick={() => update(handoff, { status: "open", assignedTo: "" })}>Reabrir</button>}<button onClick={() => remove(handoff)}>Eliminar</button></div></article>)}{!visible.length && <div className="k-empty k-card">No hay derivaciones en esta vista.</div>}</div>
    {creating && <div className="modal-backdrop" onMouseDown={() => setCreating(false)}><form className="modal k-modal" onSubmit={create} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="k-eyebrow">ATENCIÓN HUMANA</span><h2>Nueva derivación</h2></div><button type="button" onClick={() => setCreating(false)}>×</button></div><label>Contacto existente<select name="contactId" defaultValue=""><option value="">Sin vincular</option>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.phone_number}</option>)}</select></label><div className="form-grid"><label>Nombre si no está agendado<input name="customerName" /></label><label>Teléfono<input name="phoneNumber" /></label></div><div className="form-grid"><label>Motivo<select name="reason" defaultValue="human_request"><option value="complaint">Reclamo</option><option value="ambiguity">Caso ambiguo</option><option value="human_request">Pidió atención humana</option><option value="post_confirmation_change">Cambio luego de confirmar</option><option value="other">Otro</option></select></label><label>Prioridad<select name="priority" defaultValue="medium"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label></div><label>Resumen<textarea name="summary" required placeholder="Qué pasó y qué necesita resolver el equipo" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button><button className="k-primary">Crear derivación</button></div></form></div>}
  </div>;
}

function ProductPicker({ products, items, onChange, includeSoldout = false }: { products: Product[]; items: Record<string, number>; onChange: (items: Record<string, number>) => void; includeSoldout?: boolean }) {
  return <fieldset className="k-product-picker"><legend>Productos</legend>{products.filter((product) => includeSoldout || product.stock_status !== "soldout").map((product) => { const quantity = items[product.id] || 0; return <div className={product.stock_status === "soldout" ? "soldout" : ""} key={product.id}><span><strong>{product.name}</strong><small>{money(product.price)}{product.stock_status === "limited" ? ` · quedan ${product.stock_quantity}` : product.stock_status === "soldout" ? " · agotada" : ""}</small></span><div className="k-stepper"><button type="button" onClick={() => onChange({ ...items, [product.id]: Math.max(0, quantity - 1) })}>−</button><b>{quantity}</b><button type="button" disabled={product.stock_status === "soldout" && quantity === 0} onClick={() => onChange({ ...items, [product.id]: quantity + 1 })}>＋</button></div></div>; })}</fieldset>;
}

function KitchenModule() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [draftItems, setDraftItems] = useState<Record<string, number>>({});
  const [editItems, setEditItems] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  async function reload() {
    const [orderData, contactData, productData] = await Promise.all([api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${BUSINESS_ID}`), api<{ contacts: Contact[] }>(`/api/contacts?businessId=${BUSINESS_ID}`), api<{ products: Product[] }>(`/api/stock?businessId=${BUSINESS_ID}`)]);
    setOrders(orderData.orders); setContacts(contactData.contacts); setProducts(productData.products.filter((product) => product.active));
  }
  useEffect(() => { void Promise.all([api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${BUSINESS_ID}`), api<{ contacts: Contact[] }>(`/api/contacts?businessId=${BUSINESS_ID}`), api<{ products: Product[] }>(`/api/stock?businessId=${BUSINESS_ID}`)]).then(([orderData, contactData, productData]) => { setOrders(orderData.orders); setContacts(contactData.contacts); setProducts(productData.products.filter((product) => product.active)); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar")); }, []);
  const visible = useMemo(() => { const term = search.trim().toLowerCase(); return orders.filter((order) => (filter === "all" || filter === "active" && !["delivered", "cancelled"].includes(order.status) || order.status === filter) && (!term || order.customer_name.toLowerCase().includes(term) || order.phone_number.includes(term) || String(order.order_number).includes(term))); }, [orders, filter, search]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const items = Object.entries(draftItems).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
    try { await api("/api/kitchen/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, contactId: form.get("contactId"), deliveryType: form.get("deliveryType"), address: form.get("address"), zone: form.get("zone"), paymentMethod: form.get("paymentMethod"), scheduledTime: form.get("scheduledTime"), shippingCost: Number(form.get("shippingCost")), notes: form.get("notes"), items }) }); setCreating(false); setDraftItems({}); await reload(); }
    catch (createError) { setError(createError instanceof Error ? createError.message : "No se pudo crear"); }
  }

  async function setStatus(order: Order, status: Order["status"]) { try { await api("/api/kitchen/edit", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, id: order.id, status }) }); await reload(); } catch (statusError) { setError(statusError instanceof Error ? statusError.message : "No se pudo actualizar"); } }
  function openEdit(order: Order) { setEditing(order); setEditItems(Object.fromEntries(order.items.map((item) => [item.product_id, item.quantity]))); }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; const form = new FormData(event.currentTarget); const items = Object.entries(editItems).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
    try { await api("/api/kitchen/edit", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, id: editing.id, deliveryType: form.get("deliveryType"), address: form.get("address"), zone: form.get("zone"), paymentMethod: form.get("paymentMethod"), scheduledTime: form.get("scheduledTime"), shippingCost: Number(form.get("shippingCost")), notes: form.get("notes"), items }) }); setEditing(null); setEditItems({}); await reload(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar"); }
  }
  async function remove(order: Order) { if (!window.confirm(`¿Eliminar la comanda #${order.order_number}? El stock limitado se devolverá.`)) return; try { await api("/api/kitchen/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: BUSINESS_ID, id: order.id }) }); await reload(); } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar"); } }
  const statusLabel: Record<Order["status"], string> = { confirmed: "Confirmado", in_kitchen: "En cocina", ready: "Listo", delivered: "Entregado", cancelled: "Cancelado" };

  return <div className="k-module">
    <div className="k-heading"><div><span className="k-eyebrow">COMANDAS</span><h1>Cocina</h1><p>Pedidos confirmados, completos y asociados a un contacto.</p></div><button className="k-primary" onClick={() => setCreating(true)}>＋ Crear comanda</button></div>
    {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}
    <div className="k-kitchen-tools"><div className="k-tabs"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Pendientes</button><button className={filter === "ready" ? "active" : ""} onClick={() => setFilter("ready")}>Listos</button><button className={filter === "delivered" ? "active" : ""} onClick={() => setFilter("delivered")}>Entregados</button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button></div><label className="k-search">⌕<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, teléfono o número" /></label></div>
    <div className="k-order-grid">{visible.map((order) => <article className={`k-order-card ${order.status}`} key={order.id}><div className="k-order-head"><div><span>#{String(order.order_number).padStart(3, "0")}</span><b>{statusLabel[order.status]}</b></div><time>{order.scheduled_time}</time></div><div className="k-order-person"><span>{order.customer_name.slice(0, 2).toUpperCase()}</span><div><h2>{order.customer_name}</h2><p>{order.delivery_type === "delivery" ? `Envío · ${order.address || "Sin dirección"}` : "Retiro por el local"}</p></div></div><div className="k-order-items">{order.items.map((item) => <div key={item.id}><span>{item.quantity}×</span><strong>{item.product_name}</strong><em>{money(item.subtotal)}</em></div>)}</div><div className="k-order-meta"><span>{order.payment_method === "transfer" ? "Transferencia" : "Efectivo"}</span>{order.zone && <span>{order.zone}</span>}<strong>{money(order.total)}</strong></div>{order.notes && <p className="k-order-note">“{order.notes}”</p>}<div className="k-order-actions">{order.status === "confirmed" && <button className="main" onClick={() => setStatus(order, "in_kitchen")}>Enviar a cocina</button>}{order.status === "in_kitchen" && <button className="main" onClick={() => setStatus(order, "ready")}>Marcar listo</button>}{order.status === "ready" && <button className="main" onClick={() => setStatus(order, "delivered")}>Comanda entregada</button>}<button onClick={() => openEdit(order)}>Editar</button><button onClick={() => remove(order)}>Eliminar</button></div></article>)}{!visible.length && <div className="k-empty k-card">No hay comandas en esta vista.</div>}</div>
    {creating && <div className="modal-backdrop" onMouseDown={() => setCreating(false)}><form className="modal k-modal k-order-modal" onSubmit={create} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="k-eyebrow">NUEVA COMANDA</span><h2>Pedido confirmado</h2></div><button type="button" onClick={() => setCreating(false)}>×</button></div><label>Contacto<select name="contactId" required defaultValue=""><option value="" disabled>Seleccionar contacto</option>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.phone_number}</option>)}</select></label><div className="form-grid"><label>Entrega<select name="deliveryType"><option value="pickup">Retiro</option><option value="delivery">Envío</option></select></label><label>Pago<select name="paymentMethod"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label></div><div className="form-grid"><label>Horario<input name="scheduledTime" defaultValue="Ahora" /></label><label>Costo de envío<input name="shippingCost" type="number" min="0" defaultValue="0" /></label></div><label>Dirección<input name="address" placeholder="Se usa la del contacto si queda vacío" /></label><label>Zona<select name="zone" defaultValue=""><option value="">Sin zona</option><option>Empalme VC</option><option>Barrio Mitre</option><option>Pavón</option><option>Rincón de Pavón</option></select></label><ProductPicker products={products} items={draftItems} onChange={setDraftItems} /><label>Observaciones<textarea name="notes" placeholder="Portón negro, llamar al llegar..." /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button><button className="k-primary">Crear comanda</button></div></form></div>}
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="modal k-modal k-order-modal" onSubmit={saveEdit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="k-eyebrow">COMANDA #{editing.order_number}</span><h2>Editar pedido completo</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><div className="form-grid"><label>Entrega<select name="deliveryType" defaultValue={editing.delivery_type}><option value="pickup">Retiro</option><option value="delivery">Envío</option></select></label><label>Pago<select name="paymentMethod" defaultValue={editing.payment_method}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label></div><div className="form-grid"><label>Horario<input name="scheduledTime" defaultValue={editing.scheduled_time} /></label><label>Costo de envío<input name="shippingCost" type="number" min="0" defaultValue={editing.shipping_cost} /></label></div><label>Dirección<input name="address" defaultValue={editing.address || ""} /></label><label>Zona<input name="zone" defaultValue={editing.zone || ""} /></label><ProductPicker products={products} items={editItems} onChange={setEditItems} includeSoldout /><p className="k-form-note">Al guardar, el total y el stock limitado se recalculan automáticamente.</p><label>Observaciones<textarea name="notes" defaultValue={editing.notes || ""} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="k-primary">Guardar pedido</button></div></form></div>}
  </div>;
}
