"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Boxes,
  Calendar,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ContactRound,
  HandHelping,
  House,
  Lock,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  TrendingUp,
  UsersRound,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { CustomersModule, MessagesModule } from "./components/OperationalModules";
import { NotificationToasts, type ToastItem } from "./components/NotificationToasts";
import { PwaInstall } from "./components/PwaInstall";
import { UsersModule } from "./components/UsersModule";
import {
  canSendDesktopNotifications,
  isSoundEnabled,
  playChatMessageSound,
  playKitchenOrderSound,
  requestNotificationPermission,
  sendDesktopNotification,
  setSoundEnabled,
  unlockAudio,
} from "@/lib/client/sound-and-notifications";

type Section = "overview" | "messages" | "contacts" | "handoffs" | "stock" | "kitchen" | "finances" | "settings" | "users";
type UserRole = "owner" | "admin" | "manager" | "reception" | "cashier" | "staff";
type Business = { id: string; name: string; modules: string[] };
type Product = { id: string; name: string; description?: string | null; price: number; aliases: string[]; active: number; stock_status: "available" | "limited" | "soldout"; stock_quantity: number | null; made_to_order: boolean; requires_human?: boolean };
type Contact = { id: string; name: string; phone_number: string; address?: string | null };
type OrderItem = { id: string; product_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number };
type Order = { id: string; contact_id: string; order_number: number; customer_name: string; phone_number: string; delivery_type: "pickup" | "delivery"; address?: string | null; zone?: string | null; payment_method: "cash" | "transfer" | "pending"; scheduled_time: string; subtotal: number; shipping_cost: number; total: number; status: "confirmed" | "in_kitchen" | "ready" | "delivered" | "cancelled"; receipt_url?: string | null; notes?: string | null; created_at: number; items: OrderItem[] };
type AliasInfo = { alias: string; bank: string; holder: string; active: boolean };
type ShippingZone = { name: string; cost: number };
type Settings = {
  store_open: number;
  delay_minutes: number;
  courier_active: number;
  address: string;
  active_alias: number;
  alias_1: AliasInfo;
  alias_2: AliasInfo;
  active_payment_data: { alias: string; bank: string; holder: string };
  shipping_zones: ShippingZone[];
  schedule_lunch?: string;
  schedule_dinner?: string;
  schedule_notes?: string;
  schedules?: { lunch: string; dinner: string; summary: string };
  cash_discount_enabled?: number;
  cash_discount_percentage?: number;
  cash_discount?: { enabled: boolean; percentage: number };
  updated_at: number;
};
type Handoff = { id: string; contact_id?: string | null; order_id?: string | null; phone_number?: string | null; customer_name: string; reason: "complaint" | "ambiguity" | "human_request" | "post_confirmation_change" | "other"; summary: string; priority: "low" | "medium" | "high"; status: "open" | "in_progress" | "resolved"; assigned_to?: string | null; created_at: number; updated_at: number; resolved_at?: number | null };

const sections: { id: Section; label: string; icon: LucideIcon; group: string }[] = [
  { id: "overview", label: "Inicio", icon: House, group: "OPERACIÓN" },
  { id: "kitchen", label: "Cocina", icon: ChefHat, group: "OPERACIÓN" },
  { id: "stock", label: "Stock", icon: Boxes, group: "OPERACIÓN" },
  { id: "finances", label: "Finanzas", icon: CircleDollarSign, group: "OPERACIÓN" },
  { id: "messages", label: "Conversaciones", icon: MessageCircle, group: "ATENCIÓN" },
  { id: "handoffs", label: "Derivaciones", icon: HandHelping, group: "ATENCIÓN" },
  { id: "contacts", label: "Contactos", icon: ContactRound, group: "ATENCIÓN" },
  { id: "settings", label: "Configuración", icon: SettingsIcon, group: "CONFIGURACIÓN" },
  { id: "users", label: "Usuarios", icon: UsersRound, group: "CONFIGURACIÓN" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`El servidor no pudo cargar los datos (${response.status}). Recargá la página e intentá nuevamente.`);
  }
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function BusinessSwitcher({ activeBusiness }: { activeBusiness: Business }) {
  const [businesses, setBusinesses] = useState<Business[]>([activeBusiness]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ businesses: Business[] }>("/api/businesses").then((data) => setBusinesses(data.businesses)).catch(() => undefined);
  }, []);
  async function change(businessId: string) {
    if (businessId === activeBusiness.id) return;
    setBusy(true);
    try {
      await api("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }) });
      window.location.reload();
    } finally { setBusy(false); }
  }
  if (businesses.length < 2) return null;
  return <label className="k-business-switcher"><span>EMPRESA</span><select value={activeBusiness.id} disabled={busy} onChange={(event) => void change(event.target.value)}>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label>;
}

function AudioControl() {
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [notifGranted, setNotifGranted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
    setNotifGranted(canSendDesktopNotifications());

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) unlockAudio();
  }

  async function requestNotif() {
    const res = await requestNotificationPermission();
    setNotifGranted(res === "granted");
  }

  return (
    <div className="k-audio-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`k-audio-btn ${!soundOn ? "muted" : ""}`}
        onClick={() => {
          unlockAudio();
          setOpen((prev) => !prev);
        }}
        title="Configurar alertas y sonidos"
        aria-label="Configurar alertas y sonidos"
      >
        {soundOn ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
        <span className="k-audio-btn-label">{soundOn ? "Campana Cocina" : "Silenciado"}</span>
        <span className="k-audio-btn-short">{soundOn ? "Cocina" : "Mute"}</span>
      </button>

      {open && (
        <div className="k-audio-popover" onMouseDown={(e) => e.stopPropagation()}>
          <div className="k-audio-popover-head">
            <strong>Alertas de Cocina</strong>
            <button
              type="button"
              className="k-toast-close"
              onClick={() => setOpen(false)}
              aria-label="Cerrar panel"
            >
              ×
            </button>
          </div>

          <div className="k-audio-toggle-row">
            <span>Sonido de comanda</span>
            <button
              type="button"
              className={`k-wa-toggle-bot ${soundOn ? "active" : ""}`}
              onClick={toggleSound}
            >
              {soundOn ? "ACTIVADA" : "SILENCIADA"}
            </button>
          </div>

          <div className="k-audio-test-section">
            <span className="k-audio-test-label">PROBAR ALERTA</span>
            <button
              type="button"
              className="k-audio-test-btn"
              onClick={() => {
                unlockAudio();
                playKitchenOrderSound();
              }}
            >
              <span>🍳 Campana de Cocina</span>
              <small>Fuerte</small>
            </button>
          </div>

          <div>
            <button
              type="button"
              className={`k-audio-notif-btn ${notifGranted ? "active" : ""}`}
              onClick={requestNotif}
            >
              {notifGranted
                ? "✓ Notificaciones de escritorio activas"
                : "🔔 Activar notificaciones del navegador"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function KrokanticasPanel({ user, business }: { user: { id: string; displayName: string; email: string; role: UserRole }; business: Business }) {
  const [active, setActive] = useState<Section>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenOrderIds = useRef<Set<string>>(new Set());
  const initialOrdersLoaded = useRef(false);

  const name = user.displayName.includes("@") ? `Equipo ${business.name}` : user.displayName;
  const visibleSections = sections.filter((section) => {
    if (section.id === "overview" || section.id === "finances") return true;
    if (["users", "settings"].includes(section.id) && !["owner", "admin"].includes(user.role)) return false;
    return business.modules.length === 0 || business.modules.includes(section.id);
  });
  const choose = (section: Section) => { setActive(section); setMobileOpen(false); };

  const addToast = (toast: Omit<ToastItem, "id" | "createdAt">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-4), { ...toast, id, createdAt: Date.now() }]);
  };

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  // Sincronización en tiempo real en segundo plano (Exclusiva para Comandas de Cocina)
  useEffect(() => {
    let activeSync = true;

    async function checkKitchenOrders() {
      try {
        const data = await api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${encodeURIComponent(business.id)}`);
        if (!activeSync) return;

        if (!initialOrdersLoaded.current) {
          // Primera carga: registrar órdenes existentes sin alertar
          for (const order of data.orders) {
            seenOrderIds.current.add(order.id);
          }
          initialOrdersLoaded.current = true;
        } else {
          // Detección de órdenes nuevas
          const newOrders = data.orders.filter(
            (order) => !seenOrderIds.current.has(order.id) && ["confirmed", "in_kitchen"].includes(order.status)
          );

          if (newOrders.length > 0) {
            for (const order of newOrders) {
              seenOrderIds.current.add(order.id);
              playKitchenOrderSound();

              const orderNum = String(order.order_number).padStart(3, "0");
              const itemsDesc =
                order.items && order.items.length > 0
                  ? order.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")
                  : "Nuevo pedido ingresado";
              const deliveryTypeStr =
                order.delivery_type === "delivery" ? "Envío a domicilio" : "Retiro por el local";

              addToast({
                type: "kitchen",
                badgeText: "Pedido a Cocina",
                title: `Comanda #${orderNum} · ${order.customer_name}`,
                subtitle: itemsDesc,
                meta: `${deliveryTypeStr} · ${money(order.total)}`,
                actionLabel: "Ver en Cocina",
                onAction: () => choose("kitchen"),
              });

              sendDesktopNotification({
                title: `Nueva Comanda #${orderNum}`,
                body: `${order.customer_name} (${deliveryTypeStr}) - Total: ${money(order.total)}`,
                onClick: () => {
                  choose("kitchen");
                },
              });
            }
          }
        }
      } catch {
        // Silencioso en segundo plano
      }
    }

    void checkKitchenOrders();

    // Sincronización continua de cocina cada 2.5 segundos
    const timer = setInterval(() => {
      void checkKitchenOrders();
    }, 2500);

    return () => {
      activeSync = false;
      clearInterval(timer);
    };
  }, [business.id]);

  return <div className="k-app">
    <NotificationToasts toasts={toasts} onDismiss={dismissToast} />
    {mobileOpen && <button className="k-overlay" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
    <aside className={`k-sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="k-brand"><span className="k-brand-mark">{business.name.slice(0, 1).toUpperCase()}</span><div><strong>{business.name.toUpperCase()}</strong><small>Panel operativo</small></div></div>
      <BusinessSwitcher activeBusiness={business} />
      <nav aria-label={`Navegación ${business.name}`}>
        {["OPERACIÓN", "ATENCIÓN", "CONFIGURACIÓN"].map(
          (group) =>
            visibleSections.some((section) => section.group === group) && (
              <div className="k-nav-group" key={group}>
                <p>{group}</p>
                {visibleSections
                  .filter((section) => section.group === group)
                  .map((section) => {
                    const SectionIcon = section.icon;
                    return (
                      <button
                        key={section.id}
                        className={active === section.id ? "active" : ""}
                        onClick={() => choose(section.id)}
                      >
                        <span>
                          <SectionIcon size={19} strokeWidth={1.9} aria-hidden />
                        </span>
                        {section.label}
                        {section.id === "finances" && (
                          <span className="k-nav-lock">
                            <Lock size={12} strokeWidth={2.2} aria-hidden />
                          </span>
                        )}
                        {["kitchen", "handoffs"].includes(section.id) && (
                          <b className="k-notification-dot" aria-label="Hay actividad" />
                        )}
                      </button>
                    );
                  })}
              </div>
            )
        )}
      </nav>
      <div className="k-sidebar-bottom"><div className="k-help"><strong>¿Necesitás intervenir?</strong><small>Usá Derivaciones para tomar reclamos o casos ambiguos.</small></div><div className="k-profile"><span>{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><small>{user.email}</small></div><a href="/api/auth/logout">Salir</a></div></div>
    </aside>
    <main className="k-main">
      <header className="k-topbar"><button className="k-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu size={24} aria-hidden /></button><div><span>{business.name}</span><b>/</b><strong>{visibleSections.find((section) => section.id === active)?.label}</strong></div><div className="k-top-actions"><AudioControl /><PwaInstall /><span className="k-live"><i aria-hidden /> Panel en vivo</span></div></header>
      <section className="k-content">
        {active === "overview" && <Overview businessId={business.id} onNavigate={choose} />}
        {active === "kitchen" && <KitchenModule businessId={business.id} />}
        {active === "stock" && <StockModule businessId={business.id} />}
        {active === "finances" && <FinancesModule />}
        {active === "messages" && <div className="k-module"><MessagesModule businessId={business.id} /></div>}
        {active === "handoffs" && <HandoffsModule businessId={business.id} />}
        {active === "contacts" && <div className="k-module"><CustomersModule businessId={business.id} /></div>}
        {active === "settings" && <SettingsModule businessId={business.id} />}
        {active === "users" && ["owner", "admin"].includes(user.role) && <UsersModule businessId={business.id} currentUser={{ id: user.id, email: user.email, role: user.role }} />}
      </section>
    </main>
  </div>;
}

function Overview({ businessId, onNavigate }: { businessId: string; onNavigate: (section: Section) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [error, setError] = useState("");

  async function reload() {
    const [settingsData, orderData, productData, contactData, handoffData] = await Promise.all([
      api<{ settings: Settings }>(`/api/settings?businessId=${businessId}`),
      api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${businessId}`),
      api<{ products: Product[] }>(`/api/stock?businessId=${businessId}`),
      api<{ contacts: Contact[] }>(`/api/contacts?businessId=${businessId}`),
      api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${businessId}`),
    ]);
    setSettings(settingsData.settings); setOrders(orderData.orders); setProducts(productData.products); setContacts(contactData.contacts); setHandoffs(handoffData.handoffs);
  }

  useEffect(() => {
    let active = true;
    const fetchAll = () => Promise.all([
      api<{ settings: Settings }>(`/api/settings?businessId=${businessId}`),
      api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${businessId}`),
      api<{ products: Product[] }>(`/api/stock?businessId=${businessId}`),
      api<{ contacts: Contact[] }>(`/api/contacts?businessId=${businessId}`),
      api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${businessId}`),
    ]).then(([settingsData, orderData, productData, contactData, handoffData]) => {
      if (!active) return;
      setSettings(settingsData.settings); setOrders(orderData.orders); setProducts(productData.products); setContacts(contactData.contacts); setHandoffs(handoffData.handoffs);
    }).catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Error al cargar"));

    void fetchAll();
    const timer = setInterval(fetchAll, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [businessId]);

  async function updateSettings(change: Record<string, unknown>) {
    try {
      await api("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, ...change }) });
      await reload();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar"); }
  }

  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const lowStock = products.filter((product) => product.stock_status !== "available");
  const attentionCases = handoffs.filter((handoff) => handoff.status !== "resolved");

  return <div className="k-module">
    <div className="k-heading"><div><span className="k-eyebrow">TURNO ACTUAL</span><h1>Todo listo para operar.</h1><p>Pedidos, cocina, stock y atención humana en una sola vista.</p></div><button className="k-primary" onClick={() => onNavigate("kitchen")}>＋ Nueva comanda</button></div>
    {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}
    <div className="k-settings">
      <button className={settings?.store_open ? "on" : "off"} onClick={() => updateSettings({ storeOpen: !settings?.store_open })}>
        <span>{settings?.store_open ? "ABIERTO" : "CERRADO"}</span>
        <strong>Local</strong>
        <small>Tocá para alternar</small>
      </button>
      <button onClick={() => updateSettings({ delayMinutes: settings?.delay_minutes === 15 ? 30 : settings?.delay_minutes === 30 ? 45 : 15 })}>
        <span>DEMORA</span>
        <strong>{settings?.delay_minutes ?? 30} min</strong>
        <small>15, 30 o 45 minutos</small>
      </button>
      <button className={settings?.courier_active ? "on" : "off"} onClick={() => updateSettings({ courierActive: !settings?.courier_active })}>
        <span>CADETE</span>
        <strong>{settings?.courier_active ? "Disponible" : "No disponible"}</strong>
        <small>Controla los envíos</small>
      </button>
      <button
        className={settings?.cash_discount_enabled ? "on" : "off"}
        onClick={() => updateSettings({ cashDiscountEnabled: !settings?.cash_discount_enabled })}
      >
        <span>DESC. EFECTIVO</span>
        <strong>{settings?.cash_discount_enabled ? `${settings?.cash_discount_percentage ?? 10}% OFF` : "Desactivado"}</strong>
        <small>{settings?.cash_discount_enabled ? "Aplicando en bot y cocina" : "Tocá para activar"}</small>
      </button>
    </div>
    <div className="k-kpis"><article><span className="orange"><ChefHat size={23} aria-hidden /></span><div><small>En cocina</small><strong>{activeOrders.length}</strong><em>{orders.filter((order) => order.status === "ready").length} listos para entregar</em></div></article><article><span className="gold"><Boxes size={23} aria-hidden /></span><div><small>Stock con alerta</small><strong>{lowStock.length}</strong><em>{products.filter((product) => product.stock_status === "soldout").length} variedades agotadas</em></div></article><article className={attentionCases.length ? "attention" : ""}><span className="red"><AlertTriangle size={23} aria-hidden /></span><div><small>Atención humana</small><strong>{attentionCases.length}</strong><em>{attentionCases.filter((handoff) => handoff.priority === "high").length} casos prioritarios</em></div></article></div>
    <div className="k-overview-grid">
      <div className="k-card"><div className="k-card-head"><div><span className="k-eyebrow">PEDIDOS</span><h2>Confirmados pendientes</h2></div><button onClick={() => onNavigate("kitchen")}>Ver cocina →</button></div>{activeOrders.slice(0, 4).map((order) => <div className="k-mini-order" key={order.id}><b>#{String(order.order_number).padStart(3, "0")}</b><span><strong>{order.customer_name}</strong><small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} unidades · {order.delivery_type === "delivery" ? "Envío" : "Retiro"}</small></span><em>{order.scheduled_time}</em></div>)}{!activeOrders.length && <div className="k-empty">No hay pedidos pendientes.</div>}</div>
      <div className="k-card"><div className="k-card-head"><div><span className="k-eyebrow">ATENCIÓN</span><h2>Acciones rápidas</h2></div></div><div className="k-quick"><button onClick={() => onNavigate("handoffs")}><span><HandHelping size={20} aria-hidden /></span><strong>Resolver derivaciones</strong><small>Reclamos y casos ambiguos</small></button><button onClick={() => onNavigate("messages")}><span><MessageCircle size={20} aria-hidden /></span><strong>Ver conversaciones</strong><small>Atender o apagar el bot</small></button><button onClick={() => onNavigate("stock")}><span><Boxes size={20} aria-hidden /></span><strong>Actualizar stock</strong><small>Disponible, poco o agotado</small></button><button onClick={() => onNavigate("contacts")}><span><ContactRound size={20} aria-hidden /></span><strong>Buscar contacto</strong><small>{contacts.length} contactos con dirección por API</small></button></div></div>
    </div>
    <div className="k-overview-grid" style={{ marginTop: "16px" }}>
      <div className="k-card">
        <div className="k-card-head">
          <div><span className="k-eyebrow">TRANSFERENCIAS Y COBROS</span><h2>Alias de Pago</h2></div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span className="k-badge-active">Alias {settings?.active_alias ?? 1} activo</span>
            {Boolean(settings?.cash_discount_enabled) && (
              <span className="k-badge-active" style={{ background: "#166534", color: "#dcfce7" }}>
                Efectivo: {settings?.cash_discount_percentage ?? 10}% OFF
              </span>
            )}
          </div>
        </div>
        <div className="k-alias-list">
          <div
            className={`k-alias-item ${settings?.active_alias === 1 ? "selected" : ""}`}
            onClick={() => updateSettings({ activeAlias: 1 })}
            role="button"
            tabIndex={0}
          >
            <div className="k-alias-top">
              <span className="k-alias-radio">{settings?.active_alias === 1 ? "●" : "○"}</span>
              <strong>ALIAS 1</strong>
              {settings?.active_alias === 1 && <span className="k-tag-active">ACTIVO</span>}
            </div>
            <div className="k-alias-body">
              <div><small>Alias:</small> <b>{settings?.alias_1?.alias || "Krokanticas2021"}</b></div>
              <div><small>Billetera/Banco:</small> <span>{settings?.alias_1?.bank || "Mercado Pago"}</span></div>
              <div><small>Titular:</small> <span>{settings?.alias_1?.holder || "Matias Montes"}</span></div>
            </div>
          </div>

          <div
            className={`k-alias-item ${settings?.active_alias === 2 ? "selected" : ""}`}
            onClick={() => updateSettings({ activeAlias: 2 })}
            role="button"
            tabIndex={0}
          >
            <div className="k-alias-top">
              <span className="k-alias-radio">{settings?.active_alias === 2 ? "●" : "○"}</span>
              <strong>ALIAS 2</strong>
              {settings?.active_alias === 2 && <span className="k-tag-active">ACTIVO</span>}
            </div>
            <div className="k-alias-body">
              <div><small>Alias:</small> <b>{settings?.alias_2?.alias || "Krokan2021"}</b></div>
              <div><small>Billetera/Banco:</small> <span>{settings?.alias_2?.bank || "Mercado Pago"}</span></div>
              <div><small>Titular:</small> <span>{settings?.alias_2?.holder || "Fabian Gonzalo Montes"}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="k-card">
        <div className="k-card-head">
          <div><span className="k-eyebrow">LOGÍSTICA Y LOCAL</span><h2>Dirección y Zonas</h2></div>
        </div>
        <div className="k-local-info">
          <div className="k-address-box">
            <span className="k-icon"><MapPin size={22} aria-hidden /></span>
            <div>
              <small>Dirección para retiros en el local</small>
              <strong>{settings?.address || "Ruta 21 y calle Arroyo Seco. Empalme Villa Constitución."}</strong>
            </div>
          </div>
          <div className="k-zones-box">
            <small>Tarifas de envío por zona:</small>
            <div className="k-zones-grid">
              {(settings?.shipping_zones || []).map((zone, idx) => (
                <div key={idx} className="k-zone-pill">
                  <span>{zone.name}</span>
                  <b>{money(zone.cost)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function StockModule({ businessId }: { businessId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createStockStatus, setCreateStockStatus] = useState<Product["stock_status"]>("available");
  const [editing, setEditing] = useState<Product | null>(null);
  const [editStockStatus, setEditStockStatus] = useState<Product["stock_status"]>("available");
  const [editStockQuantity, setEditStockQuantity] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);

  function openEditor(product: Product) {
    setEditing(product);
    setEditStockStatus(product.stock_status);
    setEditStockQuantity(product.stock_quantity === null ? "" : String(product.stock_quantity));
    setError("");
    setNotice("");
  }

  async function reload() {
    const data = await api<{ products: Product[] }>(`/api/stock?businessId=${businessId}`);
    setProducts(data.products);
  }

  useEffect(() => {
    void api<{ products: Product[] }>(`/api/stock?businessId=${businessId}`)
      .then((data) => setProducts(data.products))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar"));
  }, [businessId]);

  async function adjust(product: Product, delta: number) {
    try {
      await api("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, productId: product.id, delta }),
      });
      await reload();
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "No se pudo ajustar");
    }
  }

  async function toggleMadeToOrder(product: Product) {
    const nextValue = !product.made_to_order;
    setUpdatingProductId(product.id);
    setError("");
    setNotice("");
    try {
      await api("/api/stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, id: product.id, madeToOrder: nextValue }),
      });
      setProducts((current) => current.map((item) => item.id === product.id
        ? { ...item, made_to_order: nextValue, requires_human: nextValue }
        : item));
      setNotice(nextValue
        ? `${product.name} quedó marcado como Por encargo y la API indicará derivación humana.`
        : `${product.name} volvió al flujo automático de pedidos.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "No se pudo cambiar Por encargo");
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const status = createStockStatus;
    setError("");
    setNotice("");
    try {
      await api("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          name: form.get("name"),
          description: form.get("description"),
          price: Number(form.get("price")),
          aliases: String(form.get("aliases") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          stockStatus: status,
          stockQuantity: status === "limited" ? Number(form.get("quantity")) : null,
          madeToOrder: form.get("madeToOrder") === "on",
          active: true,
        }),
      });
      setCreating(false);
      setCreateStockStatus("available");
      await reload();
      setNotice("Variedad creada y stock guardado correctamente.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo crear el producto");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const status = editStockStatus;
    const quantity = Math.max(0, Math.floor(Number(editStockQuantity || 0)));
    setError("");
    setNotice("");
    try {
      await api("/api/stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          id: editing.id,
          name: form.get("name"),
          description: form.get("description"),
          price: Number(form.get("price")),
          aliases: String(form.get("aliases") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          stockStatus: status,
          stockQuantity: status === "limited" ? quantity : null,
          madeToOrder: form.get("madeToOrder") === "on",
          active: true,
        }),
      });
      setEditing(null);
      await reload();
      setNotice(status === "available"
        ? "Cambios guardados. La variedad quedó disponible sin límite."
        : status === "soldout"
          ? "Cambios guardados. La variedad quedó agotada."
          : `Cambios guardados. Quedan ${quantity} unidades.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`¿Estás seguro de que querés eliminar la variedad "${product.name}"?`)) return;
    setBusy(true);
    try {
      await api("/api/stock", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, id: product.id }),
      });
      setEditing(null);
      await reload();
    } catch (delError) {
      setError(delError instanceof Error ? delError.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  const filtered = products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="k-module">
      <div className="k-heading">
        <div>
          <span className="k-eyebrow">{products.length} VARIEDADES EN CATÁLOGO</span>
          <h1>Stock y Catálogo</h1>
          <p>Creá nuevos sabores, editá precios, controlá disponibilidad o eliminá productos.</p>
        </div>
        <button className="k-primary" onClick={() => setCreating(true)}>＋ Nueva Variedad</button>
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
        <label className="k-search" style={{ flex: 1 }}>
          <Search size={17} aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por sabor o ingrediente..."
          />
        </label>
      </div>

      {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}
      {notice && <div className="k-success-banner" role="status">{notice}</div>}

      <div className="k-stock-grid">
        {filtered.map((product) => (
          <article className={`k-stock-card ${product.stock_status}`} key={product.id}>
            <div className="k-stock-top">
              <span className="k-food-icon"><Package size={20} aria-hidden /></span>
              <b className="k-stock-state">
                {product.stock_status === "available" ? "DISPONIBLE" : product.stock_status === "limited" ? "POCO STOCK" : "AGOTADA"}
              </b>
            </div>
            <h2>{product.name}</h2>
            <p className="k-stock-price">{money(product.price)} por unidad</p>
            {product.description && <p className="k-product-description">{product.description}</p>}
            {product.aliases && product.aliases.length > 0 && (
              <small style={{ color: "var(--k-muted)", fontSize: "11px", display: "block", marginBottom: "8px" }}>
                Sinónimos: {product.aliases.join(", ")}
              </small>
            )}
            <label className={`k-made-to-order ${product.made_to_order ? "active" : ""}`}>
              <span className="k-made-to-order-copy">
                <HandHelping size={18} aria-hidden />
                <span>
                  <b>Por encargo</b>
                  <small>{product.made_to_order ? "Derivar a atención humana" : "Pedido automático habilitado"}</small>
                </span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(product.made_to_order)}
                disabled={updatingProductId === product.id}
                onChange={() => void toggleMadeToOrder(product)}
                aria-label={`Por encargo para ${product.name}`}
              />
              <i className="k-switch-track" aria-hidden />
            </label>
            <div className="k-stock-bottom">
              {product.stock_status === "limited" ? (
                <div className="k-stepper">
                  <button onClick={() => adjust(product, -1)}>−</button>
                  <strong>{product.stock_quantity}</strong>
                  <button onClick={() => adjust(product, 1)}>＋</button>
                </div>
              ) : (
                <small>{product.stock_status === "available" ? "Disponible sin límite" : "No acepta pedidos"}</small>
              )}
              <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
                <button className="k-edit" onClick={() => openEditor(product)}>Editar</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Modal Crear Nueva Variedad */}
      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <form className="modal k-modal" onSubmit={handleCreate} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="k-eyebrow">CATÁLOGO</span>
                <h2>Nueva Variedad</h2>
              </div>
              <button type="button" onClick={() => setCreating(false)}>×</button>
            </div>
            <label>
              Nombre del sabor / producto
              <input name="name" placeholder="Ej: Jamón y muzzarella especial" required autoFocus />
            </label>
            <label>
              Descripción breve
              <input name="description" maxLength={500} placeholder="Ej: Jamón cocido, muzzarella y un toque de orégano" />
            </label>
            <div className="form-grid">
              <label>
                Precio unitario ($)
                <input name="price" type="number" min="0" defaultValue="2600" step="50" required />
              </label>
              <label>
                Estado inicial
                <select name="status" value={createStockStatus} onChange={(event) => setCreateStockStatus(event.target.value as Product["stock_status"])}>
                  <option value="available">Disponible</option>
                  <option value="limited">Poco stock (con límite)</option>
                  <option value="soldout">Agotada</option>
                </select>
              </label>
            </div>
            <label>
              Cantidad inicial (si tiene poco stock)
              <input name="quantity" type="number" min="0" defaultValue="10" disabled={createStockStatus !== "limited"} />
            </label>
            <label>
              Sinónimos y abreviaturas para el bot de IA (separados por coma)
              <textarea name="aliases" placeholder="Ej: jyq, jamon queso, jamon y muzza" />
            </label>
            <label className="k-made-to-order k-made-to-order-form">
              <span className="k-made-to-order-copy"><HandHelping size={18} aria-hidden /><span><b>Por encargo</b><small>Si se activa, n8n debe derivar el pedido a una persona.</small></span></span>
              <input type="checkbox" name="madeToOrder" />
              <i className="k-switch-track" aria-hidden />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button>
              <button className="k-primary" disabled={busy}>{busy ? "Creando..." : "Crear Variedad"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Editar Variedad */}
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <form className="modal k-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="k-eyebrow">CATÁLOGO</span>
                <h2>Editar Variedad</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)}>×</button>
            </div>
            <label>
              Nombre
              <input name="name" defaultValue={editing.name} required />
            </label>
            <label>
              Descripción breve
              <input name="description" maxLength={500} defaultValue={editing.description || ""} placeholder="Ingredientes o detalle de la variedad" />
            </label>
            <div className="form-grid">
              <label>
                Precio ($)
                <input name="price" type="number" min="0" defaultValue={editing.price} step="50" required />
              </label>
              <label>
                Estado
                <select
                  name="status"
                  value={editStockStatus}
                  onChange={(event) => {
                    const nextStatus = event.target.value as Product["stock_status"];
                    setEditStockStatus(nextStatus);
                    if (nextStatus === "available") setEditStockQuantity("");
                    if (nextStatus === "soldout") setEditStockQuantity("0");
                    if (nextStatus === "limited" && !editStockQuantity) setEditStockQuantity("1");
                  }}
                >
                  <option value="available">Disponible</option>
                  <option value="limited">Poco stock</option>
                  <option value="soldout">Agotada</option>
                </select>
              </label>
            </div>
            <label>
              Cantidad restante
              <small>{editStockStatus === "available" ? "Escribí una cantidad para pasar automáticamente a Poco stock." : "El estado se actualiza automáticamente según la cantidad."}</small>
              <input
                name="quantity"
                type="number"
                min="0"
                value={editStockQuantity}
                placeholder={editStockStatus === "available" ? "Sin límite" : "0"}
                onChange={(event) => {
                  const value = event.target.value;
                  setEditStockQuantity(value);
                  if (value !== "") setEditStockStatus(Number(value) > 0 ? "limited" : "soldout");
                }}
              />
            </label>
            <label>
              Sinónimos separados por coma (para el bot de WhatsApp)
              <textarea name="aliases" defaultValue={editing.aliases.join(", ")} />
            </label>
            <label className="k-made-to-order k-made-to-order-form">
              <span className="k-made-to-order-copy"><HandHelping size={18} aria-hidden /><span><b>Por encargo</b><small>La API devolverá que este producto requiere atención humana.</small></span></span>
              <input type="checkbox" name="madeToOrder" defaultChecked={Boolean(editing.made_to_order)} />
              <i className="k-switch-track" aria-hidden />
            </label>
            <div className="modal-actions" style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <button
                type="button"
                className="secondary"
                style={{ color: "#9d432e", borderColor: "#f4d7cf", background: "#fff5f3" }}
                onClick={() => remove(editing)}
                disabled={busy}
              >
                <Trash2 size={16} aria-hidden /> Eliminar variedad
              </button>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
                <button className="k-primary" disabled={busy}>{busy ? "Guardando..." : "Guardar cambios"}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function HandoffsModule({ businessId }: { businessId: string }) {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<"active" | Handoff["status"] | "all">("active");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    const [handoffData, contactData] = await Promise.all([api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${businessId}`), api<{ contacts: Contact[] }>(`/api/contacts?businessId=${businessId}`)]);
    setHandoffs(handoffData.handoffs); setContacts(contactData.contacts);
  }
  useEffect(() => { void Promise.all([api<{ handoffs: Handoff[] }>(`/api/handoffs?businessId=${businessId}`), api<{ contacts: Contact[] }>(`/api/contacts?businessId=${businessId}`)]).then(([handoffData, contactData]) => { setHandoffs(handoffData.handoffs); setContacts(contactData.contacts); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar")); }, [businessId]);
  const visible = handoffs.filter((handoff) => filter === "all" || filter === "active" && handoff.status !== "resolved" || handoff.status === filter);
  const reasonLabel: Record<Handoff["reason"], string> = { complaint: "Reclamo", ambiguity: "Caso ambiguo", human_request: "Pidió atención humana", post_confirmation_change: "Cambio luego de confirmar", other: "Otro" };
  const priorityLabel: Record<Handoff["priority"], string> = { low: "Baja", medium: "Media", high: "Alta" };

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const contactId = String(form.get("contactId") || ""); const contact = contacts.find((item) => item.id === contactId);
    try {
      await api("/api/handoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, contactId: contactId || undefined, customerName: contact?.name || form.get("customerName"), phoneNumber: contact?.phone_number || form.get("phoneNumber"), reason: form.get("reason"), priority: form.get("priority"), summary: form.get("summary") }) });
      setCreating(false); await reload();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "No se pudo crear"); }
  }

  async function update(handoff: Handoff, change: Partial<Pick<Handoff, "status" | "priority">> & { assignedTo?: string }) {
    try { await api("/api/handoffs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, id: handoff.id, ...change }) }); await reload(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar"); }
  }

  async function remove(handoff: Handoff) {
    if (!window.confirm(`¿Eliminar la derivación de ${handoff.customer_name}?`)) return;
    try { await api("/api/handoffs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, id: handoff.id }) }); await reload(); }
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
  return <fieldset className="k-product-picker"><legend>Productos</legend>{products.filter((product) => includeSoldout || product.stock_status !== "soldout").map((product) => { const quantity = items[product.id] || 0; return <div className={product.stock_status === "soldout" ? "soldout" : ""} key={product.id}><span><strong>{product.name}</strong>{product.description && <em className="k-picker-description">{product.description}</em>}{product.made_to_order && <em className="k-picker-human">Por encargo · requiere atención humana</em>}<small>{money(product.price)}{product.stock_status === "limited" ? ` · quedan ${product.stock_quantity}` : product.stock_status === "soldout" ? " · agotada" : ""}</small></span><div className="k-stepper"><button type="button" onClick={() => onChange({ ...items, [product.id]: Math.max(0, quantity - 1) })}>−</button><b>{quantity}</b><button type="button" disabled={product.stock_status === "soldout" && quantity === 0} onClick={() => onChange({ ...items, [product.id]: quantity + 1 })}>＋</button></div></div>; })}</fieldset>;
}

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function getCurrentMonthKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: string): string {
  if (!monthKey || monthKey === "all") return "Todos los meses";
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const name = MONTH_NAMES_ES[monthIndex] || monthStr;
  const current = getCurrentMonthKey();
  return monthKey === current ? `${name} ${year} (Mes actual)` : `${name} ${year}`;
}

function KitchenModule({ businessId }: { businessId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthKey());
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [draftItems, setDraftItems] = useState<Record<string, number>>({});
  const [editItems, setEditItems] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  async function reload() {
    try {
      const [orderData, contactData, productData] = await Promise.all([
        api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${businessId}`),
        api<{ contacts: Contact[] }>(`/api/contacts?businessId=${businessId}`),
        api<{ products: Product[] }>(`/api/stock?businessId=${businessId}`),
      ]);
      setOrders(orderData.orders);
      setContacts(contactData.contacts);
      setProducts(productData.products.filter((product) => product.active));
    } catch (loadErr) {
      // Evitar sobreescritura de errores si el componente se desmonta
    }
  }

  useEffect(() => {
    let active = true;
    const fetchAll = () =>
      Promise.all([
        api<{ orders: Order[] }>(`/api/kitchen/orders?businessId=${businessId}`),
        api<{ contacts: Contact[] }>(`/api/contacts?businessId=${businessId}`),
        api<{ products: Product[] }>(`/api/stock?businessId=${businessId}`),
      ])
        .then(([orderData, contactData, productData]) => {
          if (!active) return;
          setOrders(orderData.orders);
          setContacts(contactData.contacts);
          setProducts(productData.products.filter((product) => product.active));
        })
        .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Error al cargar"));

    void fetchAll();
    // Actualización automática en tiempo real cada 2.5 segundos
    const timer = setInterval(fetchAll, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [businessId]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    const currentKey = getCurrentMonthKey();
    set.add(currentKey);
    if (selectedMonth && selectedMonth !== "all") {
      set.add(selectedMonth);
    }
    // Generar los últimos 12 meses para que el selector siempre tenga las opciones visibles al navegar
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    for (const o of orders) {
      if (o.created_at) {
        const d = new Date(Number(o.created_at));
        if (!isNaN(d.getTime())) {
          set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
      }
    }
    return Array.from(set).sort().reverse();
  }, [orders, selectedMonth]);

  const monthOrders = useMemo(() => {
    if (selectedMonth === "all") return orders;
    return orders.filter((order) => {
      if (!order.created_at) return false;
      const d = new Date(Number(order.created_at));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    });
  }, [orders, selectedMonth]);

  const monthMetrics = useMemo(() => {
    const totalOrders = monthOrders.length;
    const nonCancelled = monthOrders.filter((o) => o.status !== "cancelled");
    const totalRevenue = nonCancelled.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalEmpanadas = nonCancelled.reduce(
      (sum, o) => sum + o.items.reduce((iSum, it) => iSum + Number(it.quantity || 0), 0),
      0
    );
    const pendingOrders = monthOrders.filter((o) => o.status === "confirmed").length;
    const inKitchenOrders = monthOrders.filter((o) => o.status === "in_kitchen").length;
    const readyOrders = monthOrders.filter((o) => o.status === "ready").length;
    const deliveredOrders = monthOrders.filter((o) => o.status === "delivered").length;
    return {
      totalOrders,
      totalRevenue,
      totalEmpanadas,
      pendingOrders,
      inKitchenOrders,
      readyOrders,
      deliveredOrders,
    };
  }, [monthOrders]);

  function changeMonthBy(delta: number) {
    if (selectedMonth === "all") {
      setSelectedMonth(getCurrentMonthKey());
      return;
    }
    const [y, m] = selectedMonth.split("-").map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    const newKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(newKey);
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return monthOrders.filter(
      (order) =>
        (filter === "all" || (filter === "active" && !["delivered", "cancelled"].includes(order.status)) || order.status === filter) &&
        (!term ||
          order.customer_name.toLowerCase().includes(term) ||
          order.phone_number.includes(term) ||
          String(order.order_number).includes(term))
    );
  }, [monthOrders, filter, search]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const items = Object.entries(draftItems)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    const receiptUrl = String(form.get("receiptUrl") || "").trim() || undefined;
    try {
      await api("/api/kitchen/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          contactId: form.get("contactId"),
          deliveryType: form.get("deliveryType"),
          address: form.get("address"),
          zone: form.get("zone"),
          paymentMethod: form.get("paymentMethod"),
          scheduledTime: form.get("scheduledTime"),
          shippingCost: Number(form.get("shippingCost")),
          receiptUrl,
          notes: form.get("notes"),
          items,
        }),
      });
      setCreating(false);
      setDraftItems({});
      await reload();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo crear");
    }
  }

  async function setStatus(order: Order, status: Order["status"]) {
    setUpdatingOrderId(order.id);
    setError("");
    try {
      await api("/api/kitchen/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, id: order.id, status }),
      });
      await reload();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "No se pudo actualizar");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  function openEdit(order: Order) {
    setEditing(order);
    setEditItems(Object.fromEntries(order.items.map((item) => [item.product_id, item.quantity])));
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const items = Object.entries(editItems)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    const receiptUrl = String(form.get("receiptUrl") || "").trim() || null;
    try {
      await api("/api/kitchen/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          id: editing.id,
          deliveryType: form.get("deliveryType"),
          address: form.get("address"),
          zone: form.get("zone"),
          paymentMethod: form.get("paymentMethod"),
          scheduledTime: form.get("scheduledTime"),
          shippingCost: Number(form.get("shippingCost")),
          receiptUrl,
          notes: form.get("notes"),
          items,
        }),
      });
      setEditing(null);
      setEditItems({});
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar");
    }
  }

  async function remove(order: Order) {
    if (!window.confirm(`¿Eliminar la comanda #${order.order_number}? El stock limitado se devolverá.`)) return;
    try {
      await api("/api/kitchen/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, id: order.id }),
      });
      await reload();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar");
    }
  }

  const statusLabel: Record<Order["status"], string> = {
    confirmed: "Confirmado",
    in_kitchen: "En cocina",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };

  const now = Date.now();

  return (
    <div className="k-module">
      <div className="k-heading">
        <div>
          <span className="k-eyebrow">COMANDAS</span>
          <h1>Cocina</h1>
          <p>Pedidos confirmados, completos y asociados a un contacto. Actualización en tiempo real.</p>
        </div>
        <button className="k-primary" onClick={() => setCreating(true)}>＋ Crear comanda</button>
      </div>

      {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}

      {/* Selector y Resumen Mensual */}
      <div className="k-month-bar">
        <div className="k-month-selector">
          <Calendar size={18} style={{ color: "var(--k-orange)", flexShrink: 0 }} aria-hidden />
          <button
            type="button"
            className="k-month-nav-btn"
            title="Mes anterior"
            disabled={selectedMonth === "all"}
            onClick={() => changeMonthBy(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Filtrar por mes"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
            <option value="all">Ver todos los meses</option>
          </select>
          <button
            type="button"
            className="k-month-nav-btn"
            title="Mes siguiente"
            disabled={selectedMonth === "all"}
            onClick={() => changeMonthBy(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="k-month-stats">
          <span className="k-month-stat-chip">
            Total: <strong>{monthMetrics.totalOrders}</strong>
          </span>
          <span className="k-month-stat-chip k-chip-pending">
            Pendientes: <strong>{monthMetrics.pendingOrders}</strong>
          </span>
          <span className="k-month-stat-chip k-chip-kitchen">
            En cocina: <strong>{monthMetrics.inKitchenOrders}</strong>
          </span>
          <span className="k-month-stat-chip k-chip-ready">
            Listos: <strong>{monthMetrics.readyOrders}</strong>
          </span>
          <span className="k-month-stat-chip k-chip-delivered">
            Entregados: <strong>{monthMetrics.deliveredOrders}</strong>
          </span>
          <span className="k-month-stat-chip">
            <strong>{monthMetrics.totalEmpanadas}</strong> empanadas
          </span>
          <span className="k-month-stat-chip highlight">
            <strong>{money(monthMetrics.totalRevenue)}</strong>
          </span>
          {selectedMonth !== getCurrentMonthKey() && (
            <button
              type="button"
              className="k-today-btn"
              onClick={() => setSelectedMonth(getCurrentMonthKey())}
            >
              Volver al mes actual
            </button>
          )}
        </div>
      </div>

      <div className="k-kitchen-tools">
        <div className="k-tabs">
          <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Pendientes</button>
          <button className={filter === "ready" ? "active" : ""} onClick={() => setFilter("ready")}>Listos</button>
          <button className={filter === "delivered" ? "active" : ""} onClick={() => setFilter("delivered")}>Entregados</button>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
        </div>
        <label className="k-search">
          <Search size={17} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, teléfono o número" />
        </label>
      </div>

      <div className="k-order-grid">
        {visible.map((order) => {
          const updating = updatingOrderId === order.id;
          const isRecent = order.created_at && (now - order.created_at) < 30_000 && ["confirmed", "in_kitchen"].includes(order.status);

          return (
            <article className={`k-order-card ${order.status} ${updating ? "updating" : ""} ${isRecent ? "is-new" : ""}`} key={order.id}>
              <div className="k-order-head">
                <div>
                  <span>#{String(order.order_number).padStart(3, "0")}</span>
                  <b>{statusLabel[order.status]}</b>
                </div>
                <time>{order.scheduled_time}</time>
              </div>

              <div className="k-order-person">
                <span>{order.customer_name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <h2>{order.customer_name}</h2>
                  <p>{order.delivery_type === "delivery" ? `Envío · ${order.address || "Sin dirección"}` : "Retiro por el local"}</p>
                </div>
              </div>

              <div className="k-order-items">
                {order.items.map((item) => (
                  <div key={item.id}>
                    <span>{item.quantity}×</span>
                    <strong>{item.product_name}</strong>
                    <em>{money(item.subtotal)}</em>
                  </div>
                ))}
              </div>

              <div className="k-order-meta">
                <span>{order.payment_method === "transfer" ? "Transferencia" : order.payment_method === "pending" ? "A definir" : "Efectivo"}</span>
                {order.zone && <span>{order.zone}</span>}
                <strong>{money(order.total)}</strong>
              </div>

              {order.receipt_url && (
                <div className="k-order-receipt">
                  <a href={order.receipt_url} target="_blank" rel="noreferrer" className="k-receipt-badge">
                    🧾 <span>Ver Comprobante de Pago</span>
                  </a>
                </div>
              )}

              {order.notes && <p className="k-order-note">“{order.notes}”</p>}

              <div className="k-order-actions">
                {order.status === "confirmed" && (
                  <button
                    className="main btn-confirmed"
                    style={{ background: "#bd3f27", borderColor: "#a83520", color: "#ffffff" }}
                    disabled={updating}
                    onClick={() => setStatus(order, "in_kitchen")}
                  >
                    {updating ? "Enviando…" : "Enviar a cocina"}
                  </button>
                )}
                {order.status === "in_kitchen" && (
                  <button
                    className="main btn-kitchen"
                    style={{ background: "#d97706", borderColor: "#b45309", color: "#ffffff" }}
                    disabled={updating}
                    onClick={() => setStatus(order, "ready")}
                  >
                    {updating ? "Actualizando…" : "Marcar listo"}
                  </button>
                )}
                {order.status === "ready" && (
                  <button
                    className="main btn-ready"
                    style={{ background: "#1b7a54", borderColor: "#146243", color: "#ffffff" }}
                    disabled={updating}
                    onClick={() => setStatus(order, "delivered")}
                  >
                    {updating ? "Actualizando…" : "Comanda entregada"}
                  </button>
                )}
                <button disabled={updating} onClick={() => openEdit(order)}>Editar</button>
                <button disabled={updating} onClick={() => remove(order)}>Eliminar</button>
              </div>
            </article>
          );
        })}
        {!visible.length && <div className="k-empty k-card">No hay comandas en esta vista.</div>}
      </div>

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <form className="modal k-modal k-order-modal" onSubmit={create} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="k-eyebrow">NUEVA COMANDA</span>
                <h2>Pedido confirmado</h2>
              </div>
              <button type="button" onClick={() => setCreating(false)}>×</button>
            </div>
            <label>
              Contacto
              <select name="contactId" required defaultValue="">
                <option value="" disabled>Seleccionar contacto</option>
                {contacts.map((contact) => (
                  <option value={contact.id} key={contact.id}>
                    {contact.name} · {contact.phone_number}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Entrega
                <select name="deliveryType">
                  <option value="pickup">Retiro</option>
                  <option value="delivery">Envío</option>
                </select>
              </label>
              <label>
                Pago
                <select name="paymentMethod">
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Horario
                <input name="scheduledTime" defaultValue="Ahora" />
              </label>
              <label>
                Costo de envío
                <input name="shippingCost" type="number" min="0" defaultValue="0" />
              </label>
            </div>
            <label>
              Dirección
              <input name="address" placeholder="Se usa la del contacto si queda vacío" />
            </label>
            <label>
              Zona
              <select name="zone" defaultValue="">
                <option value="">Sin zona</option>
                <option>Empalme VC</option>
                <option>Barrio Mitre</option>
                <option>Pavón</option>
                <option>Rincón de Pavón</option>
              </select>
            </label>
            <ProductPicker products={products} items={draftItems} onChange={setDraftItems} />
            <label>
              Comprobante de Transferencia (Link / URL opcional)
              <input name="receiptUrl" placeholder="https://... link de imagen o comprobante" />
            </label>
            <label>
              Observaciones
              <textarea name="notes" placeholder="Portón negro, llamar al llegar..." />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button>
              <button className="k-primary">Crear comanda</button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <form className="modal k-modal k-order-modal" onSubmit={saveEdit} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="k-eyebrow">COMANDA #{editing.order_number}</span>
                <h2>Editar pedido completo</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="form-grid">
              <label>
                Entrega
                <select name="deliveryType" defaultValue={editing.delivery_type}>
                  <option value="pickup">Retiro</option>
                  <option value="delivery">Envío</option>
                </select>
              </label>
              <label>
                Pago
                <select name="paymentMethod" defaultValue={editing.payment_method}>
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="pending">A definir</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Horario
                <input name="scheduledTime" defaultValue={editing.scheduled_time} />
              </label>
              <label>
                Costo de envío
                <input name="shippingCost" type="number" min="0" defaultValue={editing.shipping_cost} />
              </label>
            </div>
            <label>
              Dirección
              <input name="address" defaultValue={editing.address || ""} />
            </label>
            <label>
              Zona
              <input name="zone" defaultValue={editing.zone || ""} />
            </label>
            <ProductPicker products={products} items={editItems} onChange={setEditItems} includeSoldout />
            <label>
              Comprobante de Transferencia (Link / URL opcional)
              <input name="receiptUrl" defaultValue={editing.receipt_url || ""} placeholder="https://..." />
            </label>
            <p className="k-form-note">Al guardar, el total y el stock limitado se recalculan automáticamente.</p>
            <label>
              Observaciones
              <textarea name="notes" defaultValue={editing.notes || ""} />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="k-primary">Guardar pedido</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SettingsModule({ businessId }: { businessId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Zonas de envío en edición
  const [zones, setZones] = useState<ShippingZone[]>([]);

  useEffect(() => {
    let active = true;
    void api<{ settings: Settings }>(`/api/settings?businessId=${businessId}`)
      .then((data) => {
        if (!active) return;
        setSettings(data.settings);
        setZones(data.settings.shipping_zones || []);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Error cargando configuración");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [businessId]);

  async function update(change: Record<string, unknown>, successMsg = "Cambios guardados correctamente") {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await api<{ success: boolean; settings: Settings }>("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...change }),
      });
      setSettings(data.settings);
      setZones(data.settings.shipping_zones || []);
      setMessage(successMsg);
      setTimeout(() => setMessage(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  }

  function handleZoneChange(index: number, field: "name" | "cost", val: string | number) {
    const updated = [...zones];
    if (field === "name") updated[index].name = String(val);
    if (field === "cost") updated[index].cost = Number(val) || 0;
    setZones(updated);
  }

  function addZone() {
    setZones([...zones, { name: "Nueva zona", cost: 3000 }]);
  }

  function removeZone(index: number) {
    setZones(zones.filter((_, idx) => idx !== index));
  }

  if (loading) return <div className="k-module"><div className="k-empty">Cargando configuración...</div></div>;

  return (
    <div className="k-module">
      <div className="k-heading">
        <div>
          <span className="k-eyebrow">CONFIGURACIÓN GENERAL</span>
          <h1>Panel de Control del Negocio</h1>
          <p>Configurá el local, cadete, horarios, alias de pago y tarifas de envío en tiempo real.</p>
        </div>
      </div>

      {message && <div className="k-success-banner">{message}</div>}
      {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}

      {/* 1. Turno, Cadete, Demora y Descuento */}
      <div className="k-config-section">
        <h2>1. Estado Operativo y Promociones</h2>
        <p className="k-config-desc">Controlá en tiempo real el estado del local, cadete, demora y la promoción de descuento por pago en efectivo.</p>
        <div className="k-settings">
          <button
            className={settings?.store_open ? "on" : "off"}
            disabled={saving}
            onClick={() => update({ storeOpen: !settings?.store_open }, settings?.store_open ? "Local cerrado" : "Local abierto")}
          >
            <span>{settings?.store_open ? "ABIERTO" : "CERRADO"}</span>
            <strong>Local</strong>
            <small>Tocá para alternar estado</small>
          </button>

          <button
            className={settings?.courier_active ? "on" : "off"}
            disabled={saving}
            onClick={() => update({ courierActive: !settings?.courier_active }, settings?.courier_active ? "Cadete desactivado (solo retiros)" : "Cadete activado (envíos disponibles)")}
          >
            <span>{settings?.courier_active ? "DISPONIBLE" : "NO DISPONIBLE"}</span>
            <strong>Cadete / Envíos</strong>
            <small>{settings?.courier_active ? "Aceptando envíos" : "Solo retiro en el local"}</small>
          </button>

          <button
            disabled={saving}
            onClick={() => {
              const next = settings?.delay_minutes === 15 ? 30 : settings?.delay_minutes === 30 ? 45 : 15;
              update({ delayMinutes: next }, `Demora actualizada a ${next} min`);
            }}
          >
            <span>DEMORA ACTUAL</span>
            <strong>{settings?.delay_minutes ?? 30} min</strong>
            <small>Rotar a 15, 30 o 45 min</small>
          </button>

          <button
            className={settings?.cash_discount_enabled ? "on" : "off"}
            disabled={saving}
            onClick={() => update({ cashDiscountEnabled: !settings?.cash_discount_enabled }, settings?.cash_discount_enabled ? "Descuento en efectivo desactivado" : `Descuento en efectivo activado (${settings?.cash_discount_percentage ?? 10}% OFF)`)}
          >
            <span>DESC. EFECTIVO</span>
            <strong>{settings?.cash_discount_enabled ? `${settings?.cash_discount_percentage ?? 10}% OFF` : "Desactivado"}</strong>
            <small>{settings?.cash_discount_enabled ? "Promoción activa" : "Tocá para activar"}</small>
          </button>
        </div>
      </div>

      <div className="k-config-grid">
        {/* 2. Horarios de Atención */}
        <div className="k-card">
          <div className="k-card-head">
            <div>
              <span className="k-eyebrow">HORARIOS</span>
              <h2>Días y Horarios de Atención</h2>
            </div>
          </div>
          <div className="k-card-body">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                update({
                  scheduleLunch: String(f.get("scheduleLunch") || "").trim(),
                  scheduleDinner: String(f.get("scheduleDinner") || "").trim(),
                }, "Horarios actualizados correctamente");
              }}
              className="k-config-form"
            >
              <label>
                <b>Turno Mediodía</b>
                <input
                  name="scheduleLunch"
                  defaultValue={settings?.schedule_lunch || "Martes a Viernes de 11:00 a 14:00 hs"}
                  required
                />
                <small>Ej: Martes a Viernes de 11:00 a 14:00 hs</small>
              </label>

              <label>
                <b>Turno Noche</b>
                <input
                  name="scheduleDinner"
                  defaultValue={settings?.schedule_dinner || "Miércoles a Domingo de 19:30 a 23:30 hs"}
                  required
                />
                <small>Ej: Miércoles a Domingo de 19:30 a 23:30 hs</small>
              </label>

              <button className="k-primary" disabled={saving} style={{ marginTop: "8px" }}>
                {saving ? "Guardando..." : "Guardar Horarios"}
              </button>
            </form>
          </div>
        </div>

        {/* 3. Dirección del Local */}
        <div className="k-card">
          <div className="k-card-head">
            <div>
              <span className="k-eyebrow">UBICACIÓN</span>
              <h2>Dirección del Local</h2>
            </div>
          </div>
          <div className="k-card-body">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                update({
                  address: String(f.get("address") || "").trim(),
                }, "Dirección actualizada correctamente");
              }}
              className="k-config-form"
            >
              <label>
                <b>Dirección física (para retiros de clientes)</b>
                <textarea
                  name="address"
                  rows={3}
                  defaultValue={settings?.address || "Ruta 21 y calle Arroyo Seco. Empalme Villa Constitución."}
                  required
                />
                <small>Esta dirección es la que el bot le envía a los clientes cuando eligen retirar en el local.</small>
              </label>

              <button className="k-primary" disabled={saving} style={{ marginTop: "8px" }}>
                {saving ? "Guardando..." : "Guardar Dirección"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* 4. Descuento por Pago en Efectivo */}
      <div className="k-card" style={{ marginTop: "18px" }}>
        <div className="k-card-head">
          <div>
            <span className="k-eyebrow">PROMOCIONES Y COBROS</span>
            <h2>Descuento por Pago en Efectivo</h2>
          </div>
          <span className={`k-badge-active ${settings?.cash_discount_enabled ? "on" : "off"}`}>
            {settings?.cash_discount_enabled ? `${settings?.cash_discount_percentage ?? 10}% OFF ACTIVO` : "DESACTIVADO"}
          </span>
        </div>

        <div className="k-card-body">
          <p className="k-config-desc">
            Activá un porcentaje de descuento automático cuando los clientes eligen pagar en efectivo. El bot de WhatsApp y las comandas aplicarán este descuento sobre el subtotal del pedido.
          </p>

          <div className="k-settings" style={{ marginBottom: "16px", gridTemplateColumns: "1fr 1fr" }}>
            <button
              className={settings?.cash_discount_enabled ? "on" : "off"}
              disabled={saving}
              type="button"
              onClick={() => update(
                { cashDiscountEnabled: !settings?.cash_discount_enabled },
                settings?.cash_discount_enabled ? "Descuento en efectivo desactivado" : `Descuento en efectivo activado (${settings?.cash_discount_percentage ?? 10}% OFF)`
              )}
            >
              <span>{settings?.cash_discount_enabled ? "HABILITADO" : "DESHABILITADO"}</span>
              <strong>{settings?.cash_discount_enabled ? `${settings?.cash_discount_percentage ?? 10}% OFF` : "Sin descuento"}</strong>
              <small>Tocá para alternar promoción</small>
            </button>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "10px", background: "var(--k-cream, #faf7f1)", padding: "16px", borderRadius: "12px", border: "1px solid var(--k-line, #ebdcd0)" }}>
              <small style={{ color: "var(--k-muted)", fontSize: "12px", fontWeight: "700" }}>Accesos rápidos:</small>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[5, 10, 15, 20].map((pct) => {
                  const isSelected = settings?.cash_discount_percentage === pct && Boolean(settings?.cash_discount_enabled);
                  return (
                    <button
                      key={pct}
                      type="button"
                      className={`k-pct-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => update({ cashDiscountPercentage: pct, cashDiscountEnabled: true }, `Descuento configurado al ${pct}% y activado`)}
                    >
                      {pct}% OFF
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const pct = Number(f.get("cashDiscountPercentage") || 0);
              update({
                cashDiscountPercentage: pct,
              }, `Porcentaje de descuento en efectivo actualizado a ${pct}%`);
            }}
            className="k-config-form"
          >
            <label>
              <b>Porcentaje de descuento personalizado (%)</b>
              <input
                type="number"
                name="cashDiscountPercentage"
                min="0"
                max="100"
                step="1"
                key={settings?.cash_discount_percentage ?? 10}
                defaultValue={settings?.cash_discount_percentage ?? 10}
                required
              />
              <small>Ingresá el valor numérico del porcentaje (ej: 10 para 10% de descuento).</small>
            </label>

            <button className="k-primary" disabled={saving} style={{ marginTop: "4px" }}>
              {saving ? "Guardando..." : "Guardar Porcentaje"}
            </button>
          </form>
        </div>
      </div>

      {/* 5. Cuentas y Alias de Pago */}
      <div className="k-card" style={{ marginTop: "18px" }}>
        <div className="k-card-head">
          <div>
            <span className="k-eyebrow">COBRANZAS Y TRANSFERENCIAS</span>
            <h2>Alias de Pago y Cuentas Bancarias</h2>
          </div>
          <span className="k-badge-active">Alias {settings?.active_alias ?? 1} ACTIVO PARA EL BOT</span>
        </div>

        <div className="k-card-body">
          <p className="k-config-desc">
            Podés alternar cuál alias usa el bot con un solo clic en la tarjeta, o modificar los datos de cada titular abajo:
          </p>

          <div className="k-alias-list" style={{ marginBottom: "16px" }}>
            <div
              className={`k-alias-item ${settings?.active_alias === 1 ? "selected" : ""}`}
              onClick={() => update({ activeAlias: 1 }, "Alias 1 seleccionado como activo para el bot")}
              role="button"
              tabIndex={0}
            >
              <div className="k-alias-top">
                <span className="k-alias-radio">{settings?.active_alias === 1 ? "●" : "○"}</span>
                <strong>ALIAS 1</strong>
                {settings?.active_alias === 1 && <span className="k-tag-active">ACTIVO PARA EL BOT</span>}
              </div>
              <div className="k-alias-body">
                <div><small>Alias:</small> <b>{settings?.alias_1?.alias || "Krokanticas2021"}</b></div>
                <div><small>Billetera/Banco:</small> <span>{settings?.alias_1?.bank || "Mercado Pago"}</span></div>
                <div><small>Titular:</small> <span>{settings?.alias_1?.holder || "Matias Montes"}</span></div>
              </div>
            </div>

            <div
              className={`k-alias-item ${settings?.active_alias === 2 ? "selected" : ""}`}
              onClick={() => update({ activeAlias: 2 }, "Alias 2 seleccionado como activo para el bot")}
              role="button"
              tabIndex={0}
            >
              <div className="k-alias-top">
                <span className="k-alias-radio">{settings?.active_alias === 2 ? "●" : "○"}</span>
                <strong>ALIAS 2</strong>
                {settings?.active_alias === 2 && <span className="k-tag-active">ACTIVO PARA EL BOT</span>}
              </div>
              <div className="k-alias-body">
                <div><small>Alias:</small> <b>{settings?.alias_2?.alias || "Krokan2021"}</b></div>
                <div><small>Billetera/Banco:</small> <span>{settings?.alias_2?.bank || "Mercado Pago"}</span></div>
                <div><small>Titular:</small> <span>{settings?.alias_2?.holder || "Fabian Gonzalo Montes"}</span></div>
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update({
                alias1Name: String(f.get("alias1Name") || "").trim(),
                alias1Bank: String(f.get("alias1Bank") || "").trim(),
                alias1Holder: String(f.get("alias1Holder") || "").trim(),
                alias2Name: String(f.get("alias2Name") || "").trim(),
                alias2Bank: String(f.get("alias2Bank") || "").trim(),
                alias2Holder: String(f.get("alias2Holder") || "").trim(),
              }, "Datos de cuentas y alias actualizados correctamente");
            }}
            className="k-config-form"
          >
            <div className="k-alias-edit-grid">
              <fieldset className="k-alias-box">
                <legend><b>Editar Datos de Alias 1</b></legend>
                <label>Alias<input name="alias1Name" defaultValue={settings?.alias_1?.alias || "Krokanticas2021"} required /></label>
                <label>Billetera / Banco<input name="alias1Bank" defaultValue={settings?.alias_1?.bank || "Mercado Pago"} required /></label>
                <label>Titular de la cuenta<input name="alias1Holder" defaultValue={settings?.alias_1?.holder || "Matias Montes"} required /></label>
              </fieldset>

              <fieldset className="k-alias-box">
                <legend><b>Editar Datos de Alias 2</b></legend>
                <label>Alias<input name="alias2Name" defaultValue={settings?.alias_2?.alias || "Krokan2021"} required /></label>
                <label>Billetera / Banco<input name="alias2Bank" defaultValue={settings?.alias_2?.bank || "Mercado Pago"} required /></label>
                <label>Titular de la cuenta<input name="alias2Holder" defaultValue={settings?.alias_2?.holder || "Fabian Gonzalo Montes"} required /></label>
              </fieldset>
            </div>

            <button className="k-primary" disabled={saving} style={{ marginTop: "12px" }}>
              {saving ? "Guardando..." : "Guardar Cuentas y Titulares"}
            </button>
          </form>
        </div>
      </div>

      {/* 5. Zonas de Envío y Costos */}
      <div className="k-card" style={{ marginTop: "18px" }}>
        <div className="k-card-head">
          <div>
            <span className="k-eyebrow">TARIFAS DE ENVÍO</span>
            <h2>Zonas de Entrega y Costos</h2>
          </div>
          <button type="button" className="k-secondary" onClick={addZone}>＋ Agregar Zona</button>
        </div>

        <div className="k-card-body">
          <p className="k-config-desc">
            Estas son las zonas y precios que el bot y la comanda de cocina utilizan para calcular el costo de envío:
          </p>

          <div className="k-zones-edit-list">
            {zones.map((zone, idx) => (
              <div key={idx} className="k-zone-edit-row">
                <input
                  type="text"
                  placeholder="Nombre de la zona"
                  value={zone.name}
                  onChange={(e) => handleZoneChange(idx, "name", e.target.value)}
                  required
                />
                <div className="k-zone-cost-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="Costo"
                    value={zone.cost}
                    onChange={(e) => handleZoneChange(idx, "cost", e.target.value)}
                    required
                  />
                </div>
                <button
                  type="button"
                  className="k-btn-del"
                  onClick={() => removeZone(idx)}
                  title="Eliminar zona"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            className="k-primary"
            disabled={saving}
            onClick={() => update({ shippingZones: zones }, "Tarifas de envío actualizadas")}
          >
            {saving ? "Guardando..." : "Guardar Tarifas de Envío"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinancesModule() {
  const whatsappUrl =
    "https://wa.me/5493516579655?text=" +
    encodeURIComponent(
      "¡Hola Apoc Automation! Quiero solicitar el desbloqueo del módulo de Finanzas y Reportes para Krokanticas."
    );

  return (
    <div className="k-module">
      <div className="k-heading">
        <div>
          <span className="k-eyebrow">INTEGRACIÓN ADICIONAL · APOC AUTOMATION</span>
          <h1>Finanzas y Rendimiento</h1>
          <p>Módulo de control de caja, balance financiero, costeo de mercadería y métricas de facturación.</p>
        </div>
      </div>

      {/* Tarjeta de Bloqueo Principal */}
      <div className="k-card k-finance-hero-card">
        <div className="k-finance-hero-head">
          <div className="k-finance-hero-icon">
            <Lock size={24} strokeWidth={2.2} aria-hidden />
          </div>
          <div className="k-finance-hero-info">
            <span className="k-eyebrow">MÓDULO BLOQUEADO</span>
            <h2>Control Financiero Inteligente</h2>
            <p className="k-finance-hero-desc">
              Este módulo se encuentra bloqueado para tu cuenta actual. Para habilitarlo en tu local, contactate con el equipo de Apoc Automation.
            </p>
          </div>
        </div>

        <div className="k-finance-features-grid">
          <div className="k-finance-feat-box">
            <span className="k-feat-check"><Check size={14} strokeWidth={3} aria-hidden /></span>
            <div>
              <strong>Arqueo y balance automático</strong>
              <small>Discriminación de cobros en efectivo y transferencias en tiempo real.</small>
            </div>
          </div>

          <div className="k-finance-feat-box">
            <span className="k-feat-check"><Check size={14} strokeWidth={3} aria-hidden /></span>
            <div>
              <strong>Costeo de mercadería y márgenes</strong>
              <small>Cálculo automático de costo unitario y ganancia bruta por empanada.</small>
            </div>
          </div>

          <div className="k-finance-feat-box">
            <span className="k-feat-check"><Check size={14} strokeWidth={3} aria-hidden /></span>
            <div>
              <strong>Reportes contables mensuales</strong>
              <small>Resumen mensual descargable listo para administración y contador.</small>
            </div>
          </div>

          <div className="k-finance-feat-box">
            <span className="k-feat-check"><Check size={14} strokeWidth={3} aria-hidden /></span>
            <div>
              <strong>Ticket promedio y picos de venta</strong>
              <small>Analítica de días, horarios y variedades con mayor rendimiento económico.</small>
            </div>
          </div>
        </div>

        <div className="k-finance-cta-row">
          <div className="k-finance-cta-copy">
            <strong>¿Querés activar este módulo para tu negocio?</strong>
            <span>Escribinos por WhatsApp y coordinamos la activación para tu panel.</span>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="k-primary k-whatsapp-cta-btn"
          >
            <MessageCircle size={17} strokeWidth={2.2} aria-hidden />
            <span>Desbloquear por WhatsApp</span>
          </a>
        </div>
      </div>

      {/* Vista Previa Bloqueada (Mockups con blur) */}
      <div className="k-finance-preview-wrapper">
        <div className="k-finance-preview-overlay">
          <div className="k-finance-overlay-badge">
            <Lock size={15} strokeWidth={2.2} aria-hidden />
            <span>Vista previa · Requiere activación</span>
          </div>
        </div>

        <div className="k-kpis" style={{ marginBottom: "14px" }}>
          <article>
            <span className="green"><TrendingUp size={20} /></span>
            <div>
              <small>Ingresos Totales (Mes)</small>
              <strong>$1.485.000</strong>
              <em>+18.4% vs mes anterior</em>
            </div>
          </article>

          <article>
            <span className="gold"><CircleDollarSign size={20} /></span>
            <div>
              <small>Costo de Mercadería</small>
              <strong>$519.750</strong>
              <em>35.0% del total vendido</em>
            </div>
          </article>

          <article>
            <span className="orange"><Sparkles size={20} /></span>
            <div>
              <small>Ganancia Bruta Operativa</small>
              <strong>$965.250</strong>
              <em>Margen bruto 65.0%</em>
            </div>
          </article>
        </div>

        <div className="k-overview-grid">
          <div className="k-card">
            <div className="k-card-head">
              <div>
                <span className="k-eyebrow">DISTRIBUCIÓN</span>
                <h2>Medios de Pago</h2>
              </div>
            </div>
            <div style={{ padding: "18px" }}>
              <div style={{ display: "flex", height: "36px", borderRadius: "8px", overflow: "hidden", fontSize: "11px", fontWeight: "750", color: "#fff", textAlign: "center", lineHeight: "36px" }}>
                <div style={{ width: "58%", background: "var(--k-green)" }}>58% Efectivo</div>
                <div style={{ width: "42%", background: "#2970b8" }}>42% Transferencia</div>
              </div>
            </div>
          </div>

          <div className="k-card">
            <div className="k-card-head">
              <div>
                <span className="k-eyebrow">RENDIMIENTO</span>
                <h2>Variedades más vendidas</h2>
              </div>
            </div>
            <div style={{ padding: "0 18px 12px" }}>
              <div className="k-mini-order" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>1. Vacío y provoleta</span>
                <strong>$342.000</strong>
              </div>
              <div className="k-mini-order" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>2. Carne cortada a cuchillo</span>
                <strong>$286.000</strong>
              </div>
              <div className="k-mini-order" style={{ gridTemplateColumns: "1fr auto", borderBottom: 0 }}>
                <span>3. Jamón y queso</span>
                <strong>$218.400</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
