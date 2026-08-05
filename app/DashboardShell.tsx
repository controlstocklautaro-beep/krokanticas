"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ModuleId =
  | "dashboard"
  | "messages"
  | "customers"
  | "reservations"
  | "tables"
  | "menu"
  | "pipeline"
  | "finances"
  | "metrics";

type Business = {
  id: string;
  name: string;
  shortName: string;
  type: string;
  plan: string;
  accent: string;
  modules: ModuleId[];
};

type Reservation = {
  id: number;
  time: string;
  name: string;
  party: number;
  table: string;
  status: "Confirmada" | "Pendiente" | "En salón";
  initials: string;
};

type PipelineColumnRecord = { id: string; name: string; color: string; position: number };
type PipelineLeadRecord = {
  id: string;
  columnId: string;
  clientName: string;
  subject: string;
  amount: number;
  currency: "ARS" | "USD";
  priority: "alta" | "media" | "baja";
};

const moduleRegistry: Record<
  ModuleId,
  { label: string; icon: string; group: "main" | "management" }
> = {
  dashboard: { label: "Resumen", icon: "⌂", group: "main" },
  messages: { label: "Mensajes", icon: "◌", group: "main" },
  customers: { label: "Clientes", icon: "◎", group: "main" },
  reservations: { label: "Reservas", icon: "□", group: "management" },
  tables: { label: "Mesas", icon: "◇", group: "management" },
  menu: { label: "Menú", icon: "≡", group: "management" },
  pipeline: { label: "Pipeline", icon: "→", group: "management" },
  finances: { label: "Finanzas", icon: "$", group: "management" },
  metrics: { label: "Métricas", icon: "↗", group: "management" },
};

const businesses: Business[] = [
  {
    id: "casa-oliva",
    name: "Casa Oliva",
    shortName: "CO",
    type: "Restaurante",
    plan: "Plan Pro",
    accent: "#ed6a2c",
    modules: [
      "dashboard",
      "messages",
      "customers",
      "reservations",
      "tables",
      "menu",
      "finances",
      "metrics",
    ],
  },
  {
    id: "nexo-estudio",
    name: "Nexo Estudio",
    shortName: "NE",
    type: "Servicios",
    plan: "Plan Base",
    accent: "#5477ef",
    modules: [
      "dashboard",
      "messages",
      "customers",
      "pipeline",
      "finances",
      "metrics",
    ],
  },
];

const initialReservations: Reservation[] = [
  {
    id: 1,
    time: "20:00",
    name: "Lucía Fernández",
    party: 4,
    table: "Mesa 08",
    status: "Confirmada",
    initials: "LF",
  },
  {
    id: 2,
    time: "20:30",
    name: "Martín Acosta",
    party: 2,
    table: "Terraza 03",
    status: "Pendiente",
    initials: "MA",
  },
  {
    id: 3,
    time: "21:00",
    name: "Sofía Quiroga",
    party: 6,
    table: "Mesa 12",
    status: "Confirmada",
    initials: "SQ",
  },
  {
    id: 4,
    time: "21:30",
    name: "Diego Ramos",
    party: 3,
    table: "Mesa 05",
    status: "En salón",
    initials: "DR",
  },
];

const customerRows = [
  ["Lucía Fernández", "+54 9 11 4520 9814", "12 visitas", "VIP", "Hace 2 días"],
  ["Martín Acosta", "+54 9 11 3098 1277", "4 visitas", "Sin gluten", "Hoy"],
  ["Sofía Quiroga", "+54 9 11 6821 4402", "8 visitas", "Cumpleaños", "Ayer"],
  ["Diego Ramos", "+54 9 11 5409 8821", "3 visitas", "Terraza", "Hoy"],
  ["Camila Torres", "+54 9 11 7720 1138", "6 visitas", "Vegetariana", "Hace 5 días"],
];

const chatRows = [
  ["Martín Acosta", "¿Tienen opciones sin gluten?", "2 min", "2"],
  ["Lucía Fernández", "Perfecto, confirmamos para cuatro", "12 min", ""],
  ["Camila Torres", "Quería reservar para el sábado", "28 min", "1"],
  ["Julián Pérez", "Gracias por la atención", "1 h", ""],
];

const menuItems = [
  ["Burrata de estación", "Entradas", "$ 13.500"],
  ["Risotto de hongos", "Principales", "$ 19.800"],
  ["Ojo de bife", "Principales", "$ 24.900"],
  ["Tiramisú de la casa", "Postres", "$ 9.600"],
];

export function DashboardShell() {
  const [businessId, setBusinessId] = useState(businesses[0].id);
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);
  const [reservationModal, setReservationModal] = useState(false);
  const [reservations, setReservations] = useState(initialReservations);
  const [tableStates, setTableStates] = useState<Record<number, string>>({
    1: "Ocupada",
    2: "Libre",
    3: "Reservada",
    4: "Libre",
    5: "Ocupada",
    6: "Libre",
    7: "Reservada",
    8: "Libre",
  });
  const [availableItems, setAvailableItems] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: false,
    3: true,
  });

  const business = useMemo(
    () => businesses.find((item) => item.id === businessId) ?? businesses[0],
    [businessId],
  );

  function selectModule(module: ModuleId) {
    setActiveModule(module);
    setSidebarOpen(false);
  }

  function selectBusiness(nextBusiness: Business) {
    setBusinessId(nextBusiness.id);
    setBusinessMenuOpen(false);
    setActiveModule("dashboard");
  }

  function addReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "Nueva reserva");
    const initials = name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    setReservations((current) => [
      ...current,
      {
        id: Date.now(),
        time: String(data.get("time") || "20:00"),
        name,
        party: Number(data.get("party") || 2),
        table: String(data.get("table") || "A asignar"),
        status: "Pendiente",
        initials,
      },
    ]);
    setReservationModal(false);
  }

  const mainModules = business.modules.filter(
    (module) => moduleRegistry[module].group === "main",
  );
  const managementModules = business.modules.filter(
    (module) => moduleRegistry[module].group === "management",
  );

  return (
    <div className="app-shell" style={{ "--accent": business.accent } as React.CSSProperties}>
      {sidebarOpen && (
        <button
          className="mobile-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>NEXO</span>
        </div>

        <div className="business-switcher">
          <button
            className="business-button"
            onClick={() => setBusinessMenuOpen((open) => !open)}
            aria-expanded={businessMenuOpen}
          >
            <span className="business-avatar">{business.shortName}</span>
            <span className="business-copy">
              <strong>{business.name}</strong>
              <small>{business.type} · {business.plan}</small>
            </span>
            <span className="chevron">⌄</span>
          </button>
          {businessMenuOpen && (
            <div className="business-menu">
              {businesses.map((item) => (
                <button key={item.id} onClick={() => selectBusiness(item)}>
                  <span className="business-avatar" style={{ background: item.accent }}>
                    {item.shortName}
                  </span>
                  <span><strong>{item.name}</strong><small>{item.type}</small></span>
                  {item.id === business.id && <b>✓</b>}
                </button>
              ))}
              <button className="new-business"><span>＋</span> Agregar empresa</button>
            </div>
          )}
        </div>

        <nav className="nav-sections" aria-label="Navegación principal">
          <NavSection
            label="PRINCIPAL"
            modules={mainModules}
            active={activeModule}
            onSelect={selectModule}
          />
          <NavSection
            label={business.type === "Restaurante" ? "OPERACIÓN" : "GESTIÓN"}
            modules={managementModules}
            active={activeModule}
            onSelect={selectModule}
          />
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-usage">
            <span><b>{business.modules.length}</b> de 10 módulos activos</span>
            <div><i style={{ width: `${business.modules.length * 10}%` }} /></div>
          </div>
          <button className="profile-row">
            <span className="profile-avatar">AM</span>
            <span><strong>Alex M.</strong><small>Propietario</small></span>
            <b>···</b>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">☰</button>
          <div className="breadcrumb">
            <span>{business.name}</span>
            <b>/</b>
            <strong>{moduleRegistry[activeModule].label}</strong>
          </div>
          <div className="topbar-actions">
            <label className="search"><span>⌕</span><input aria-label="Buscar" placeholder="Buscar..." /><kbd>⌘ K</kbd></label>
            <button className="icon-button" aria-label="Notificaciones">♢<i /></button>
            <span className="today">Mié, 5 de agosto</span>
          </div>
        </header>

        <section className="content-area">
          {activeModule === "dashboard" && (
            <Dashboard business={business} reservations={reservations} onNew={() => setReservationModal(true)} />
          )}
          {activeModule === "messages" && <Messages />}
          {activeModule === "customers" && <Customers />}
          {activeModule === "reservations" && (
            <Reservations reservations={reservations} onNew={() => setReservationModal(true)} />
          )}
          {activeModule === "tables" && (
            <Tables tableStates={tableStates} setTableStates={setTableStates} />
          )}
          {activeModule === "menu" && (
            <Menu availableItems={availableItems} setAvailableItems={setAvailableItems} />
          )}
          {activeModule === "pipeline" && <Pipeline businessId={business.id} />}
          {activeModule === "finances" && <Finances />}
          {activeModule === "metrics" && <Metrics business={business} />}
        </section>
      </main>

      {reservationModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReservationModal(false)}>
          <form className="modal" onSubmit={addReservation} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">NUEVA RESERVA</span><h2>Agendar una mesa</h2></div><button type="button" onClick={() => setReservationModal(false)}>×</button></div>
            <label>Nombre del cliente<input name="name" placeholder="Ej. Ana López" required autoFocus /></label>
            <div className="form-grid"><label>Horario<input name="time" type="time" defaultValue="20:30" required /></label><label>Comensales<input name="party" type="number" min="1" defaultValue="2" required /></label></div>
            <label>Mesa<select name="table" defaultValue="A asignar"><option>A asignar</option><option>Mesa 02</option><option>Mesa 04</option><option>Terraza 03</option></select></label>
            <label>Nota<textarea name="note" placeholder="Alergias, cumpleaños, preferencias..." /></label>
            <div className="modal-actions"><button type="button" className="secondary" onClick={() => setReservationModal(false)}>Cancelar</button><button type="submit" className="primary">Crear reserva</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function NavSection({
  label,
  modules,
  active,
  onSelect,
}: {
  label: string;
  modules: ModuleId[];
  active: ModuleId;
  onSelect: (module: ModuleId) => void;
}) {
  return (
    <div className="nav-section">
      <p>{label}</p>
      {modules.map((module) => (
        <button key={module} className={active === module ? "active" : ""} onClick={() => onSelect(module)}>
          <span>{moduleRegistry[module].icon}</span>{moduleRegistry[module].label}
          {module === "messages" && <b className="nav-badge">3</b>}
        </button>
      ))}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ business, reservations, onNew }: { business: Business; reservations: Reservation[]; onNew: () => void }) {
  if (business.type !== "Restaurante") {
    return (
      <>
        <PageHeading eyebrow="MIÉRCOLES, 5 DE AGOSTO" title={`Hola, Alex — ${business.name} está al día.`} description="Una mirada rápida a la actividad de tu negocio." action={<button className="primary" onClick={() => undefined}>＋ Nuevo contacto</button>} />
        <div className="kpi-grid">
          <Kpi label="Conversaciones abiertas" value="8" meta="3 sin responder" tone="orange" />
          <Kpi label="Oportunidades" value="14" meta="5 en seguimiento" tone="blue" />
          <Kpi label="Clientes activos" value="127" meta="+9 este mes" tone="green" />
          <Kpi label="Facturación mensual" value="$ 3,4 M" meta="+12,5% vs. julio" tone="violet" />
        </div>
        <div className="two-columns"><Pipeline businessId={business.id} compact /><Activity /></div>
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="MIÉRCOLES, 5 DE AGOSTO"
        title="Buenas tardes, Alex."
        description="Casa Oliva se prepara para una noche movida."
        action={<button className="primary" onClick={onNew}>＋ Nueva reserva</button>}
      />
      <div className="kpi-grid">
        <Kpi label="Reservas de hoy" value={String(reservations.length + 14)} meta="3 pendientes de confirmar" tone="orange" />
        <Kpi label="Comensales esperados" value="56" meta="+12 vs. miércoles pasado" tone="blue" />
        <Kpi label="Ocupación estimada" value="78%" meta="Pico: 21:30 h" tone="green" />
        <Kpi label="Conversaciones" value="9" meta="3 esperan respuesta" tone="violet" />
      </div>
      <div className="dashboard-grid">
        <div className="panel reservations-panel">
          <div className="panel-head"><div><span className="eyebrow">PRÓXIMAS</span><h2>Reservas de esta noche</h2></div><button className="text-button">Ver todas →</button></div>
          <div className="reservation-list">
            {reservations.slice(0, 4).map((reservation) => <ReservationRow key={reservation.id} reservation={reservation} />)}
          </div>
        </div>
        <div className="panel occupancy-panel">
          <div className="panel-head"><div><span className="eyebrow">SALÓN</span><h2>Ocupación por turno</h2></div><span className="live-dot">En vivo</span></div>
          <div className="occupancy-chart">
            {[32, 51, 78, 91, 66, 38].map((height, index) => (
              <div key={index} className={index === 3 ? "peak" : ""}><span style={{ height: `${height}%` }} /><small>{["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"][index]}</small></div>
            ))}
          </div>
          <div className="occupancy-summary"><div><span>Mesas ocupadas</span><strong>14 / 18</strong></div><div><span>Próxima liberación</span><strong>20:45</strong></div></div>
        </div>
        <Activity />
      </div>
    </>
  );
}

function Kpi({ label, value, meta, tone }: { label: string; value: string; meta: string; tone: string }) {
  return <div className="kpi-card"><div className={`kpi-icon ${tone}`}>↗</div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div>;
}

function ReservationRow({ reservation }: { reservation: Reservation }) {
  return (
    <div className="reservation-row">
      <time>{reservation.time}</time><span className="guest-avatar">{reservation.initials}</span>
      <div className="reservation-name"><strong>{reservation.name}</strong><small>{reservation.party} personas · {reservation.table}</small></div>
      <span className={`status status-${reservation.status.toLowerCase().replace(" ", "-")}`}>{reservation.status}</span><button aria-label={`Opciones de ${reservation.name}`}>···</button>
    </div>
  );
}

function Activity() {
  return (
    <div className="panel activity-panel">
      <div className="panel-head"><div><span className="eyebrow">ACTIVIDAD</span><h2>Lo último</h2></div><button className="text-button">Ver historial →</button></div>
      <div className="activity-list">
        <div><span className="activity-icon">✓</span><p><strong>Reserva confirmada</strong><small>Lucía Fernández · 20:00 · hace 4 min</small></p></div>
        <div><span className="activity-icon blue">◌</span><p><strong>Nuevo mensaje de WhatsApp</strong><small>Martín Acosta pregunta por el menú · hace 12 min</small></p></div>
        <div><span className="activity-icon gold">$</span><p><strong>Pago registrado</strong><small>Cierre parcial de caja · hace 38 min</small></p></div>
      </div>
    </div>
  );
}

function Messages() {
  const [selected, setSelected] = useState(0);
  return (
    <>
      <PageHeading eyebrow="WHATSAPP" title="Mensajes" description="Todas las conversaciones del negocio en un solo lugar." />
      <div className="messages-layout panel">
        <div className="chat-list"><div className="chat-search"><span>⌕</span><input placeholder="Buscar conversación" aria-label="Buscar conversación" /></div>{chatRows.map((chat, index) => <button key={chat[0]} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)}><span className="guest-avatar">{chat[0].split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{chat[0]}</strong><small>{chat[1]}</small></span><time>{chat[2]}</time>{chat[3] && <b>{chat[3]}</b>}</button>)}</div>
        <div className="chat-window"><div className="chat-person"><span className="guest-avatar">{chatRows[selected][0].split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{chatRows[selected][0]}</strong><small>En línea · WhatsApp</small></span><button>⋮</button></div><div className="chat-body"><div className="bubble incoming">Hola, quería consultar si tienen disponibilidad para este sábado.</div><div className="bubble outgoing">¡Hola! Sí, tenemos lugares disponibles. ¿Para cuántas personas?</div><div className="bubble incoming">Seríamos 4. ¿Tienen opciones sin gluten?</div></div><div className="chat-compose"><button>＋</button><input placeholder="Escribí un mensaje..." aria-label="Escribir mensaje" /><button className="send">➤</button></div></div>
      </div>
    </>
  );
}

function Customers() {
  return (
    <>
      <PageHeading eyebrow="BASE DE CLIENTES" title="Clientes" description="Preferencias, historial y contexto para una atención más personal." action={<button className="primary">＋ Nuevo cliente</button>} />
      <div className="panel table-panel"><div className="table-tools"><label className="search"><span>⌕</span><input placeholder="Buscar por nombre o teléfono" /></label><button className="filter-button">≡ Filtros</button></div><div className="data-table"><div className="data-row data-head"><span>CLIENTE</span><span>TELÉFONO</span><span>HISTORIAL</span><span>PREFERENCIA</span><span>ÚLTIMA ACTIVIDAD</span></div>{customerRows.map((row) => <div className="data-row" key={row[0]}><span className="customer-cell"><i className="guest-avatar">{row[0].split(" ").map((word) => word[0]).join("").slice(0, 2)}</i><strong>{row[0]}</strong></span><span>{row[1]}</span><span>{row[2]}</span><span><b className="tag">{row[3]}</b></span><span>{row[4]}</span></div>)}</div>
      </div>
    </>
  );
}

function Reservations({ reservations, onNew }: { reservations: Reservation[]; onNew: () => void }) {
  return (
    <>
      <PageHeading eyebrow="OPERACIÓN" title="Reservas" description="Organizá cada turno y anticipá la ocupación del salón." action={<button className="primary" onClick={onNew}>＋ Nueva reserva</button>} />
      <div className="date-strip panel"><button>‹</button>{["LUN|3", "MAR|4", "MIÉ|5", "JUE|6", "VIE|7", "SÁB|8", "DOM|9"].map((date) => { const [day, number] = date.split("|"); return <button key={date} className={number === "5" ? "selected" : ""}><small>{day}</small><strong>{number}</strong></button>; })}<button>›</button></div>
      <div className="panel reservations-table"><div className="reservation-summary"><div><span>Almuerzo</span><strong>7 reservas · 19 personas</strong></div><div><span>Cena</span><strong>{reservations.length + 14} reservas · 56 personas</strong></div><div><span>Disponibilidad</span><strong className="green-text">4 mesas libres</strong></div></div>{reservations.map((reservation) => <ReservationRow key={reservation.id} reservation={reservation} />)}</div>
    </>
  );
}

function Tables({ tableStates, setTableStates }: { tableStates: Record<number, string>; setTableStates: React.Dispatch<React.SetStateAction<Record<number, string>>> }) {
  function cycleTable(id: number) { const order = ["Libre", "Reservada", "Ocupada"]; setTableStates((states) => ({ ...states, [id]: order[(order.indexOf(states[id]) + 1) % order.length] })); }
  return (
    <>
      <PageHeading eyebrow="SALÓN" title="Mesas" description="Estado del salón en tiempo real. Tocá una mesa para cambiar su estado." action={<div className="legend"><span><i className="free" />Libre</span><span><i className="reserved" />Reservada</span><span><i className="busy" />Ocupada</span></div>} />
      <div className="floor-plan panel"><div className="floor-label">SALÓN PRINCIPAL · 8 MESAS</div><div className="tables-grid">{Object.entries(tableStates).map(([id, state]) => <button key={id} onClick={() => cycleTable(Number(id))} className={`table-card table-${state.toLowerCase()}`}><span>M{id.padStart(2, "0")}</span><strong>Mesa {id}</strong><small>{state === "Libre" ? "4 lugares" : state === "Reservada" ? "20:30 · 4 pers." : "Desde 19:42"}</small><b>{state}</b></button>)}</div></div>
    </>
  );
}

function Menu({ availableItems, setAvailableItems }: { availableItems: Record<number, boolean>; setAvailableItems: React.Dispatch<React.SetStateAction<Record<number, boolean>>> }) {
  return (
    <>
      <PageHeading eyebrow="CARTA DIGITAL" title="Menú" description="Precios y disponibilidad que también puede consultar el asistente." action={<button className="primary">＋ Agregar plato</button>} />
      <div className="menu-toolbar"><div className="tabs"><button className="active">Todos</button><button>Entradas</button><button>Principales</button><button>Postres</button></div><label className="search"><span>⌕</span><input placeholder="Buscar plato" /></label></div>
      <div className="menu-grid">{menuItems.map((item, index) => <div className="menu-card panel" key={item[0]}><div className={`dish-placeholder dish-${index + 1}`}><span>{["B", "R", "O", "T"][index]}</span></div><div className="menu-copy"><small>{item[1]}</small><h3>{item[0]}</h3><p>{index === 0 ? "Tomates asados, pesto y hojas frescas." : index === 1 ? "Hongos de estación, parmesano y aceite de trufa." : index === 2 ? "Papas rústicas, chimichurri y vegetales." : "Mascarpone, café y cacao amargo."}</p><div><strong>{item[2]}</strong><button className={`toggle ${availableItems[index] ? "on" : ""}`} onClick={() => setAvailableItems((state) => ({ ...state, [index]: !state[index] }))} aria-label={`Cambiar disponibilidad de ${item[0]}`}><i /></button></div></div></div>)}</div>
    </>
  );
}

function Pipeline({ businessId, compact = false }: { businessId: string; compact?: boolean }) {
  const [columns, setColumns] = useState<PipelineColumnRecord[]>([]);
  const [leads, setLeads] = useState<PipelineLeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [leadModal, setLeadModal] = useState<{ columnId: string } | null>(null);

  async function reload() {
    const [columnsResponse, leadsResponse] = await Promise.all([
      fetch(`/api/pipeline/columns?businessId=${encodeURIComponent(businessId)}`),
      fetch(`/api/pipeline/leads?businessId=${encodeURIComponent(businessId)}`),
    ]);
    if (!columnsResponse.ok || !leadsResponse.ok) throw new Error("No se pudo cargar el pipeline");
    const columnsData = await columnsResponse.json() as { columns: PipelineColumnRecord[] };
    const leadsData = await leadsResponse.json() as { leads: PipelineLeadRecord[] };
    setColumns(columnsData.columns);
    setLeads(leadsData.leads);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/pipeline/columns?businessId=${encodeURIComponent(businessId)}`).then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el pipeline");
        return response.json() as Promise<{ columns: PipelineColumnRecord[] }>;
      }),
      fetch(`/api/pipeline/leads?businessId=${encodeURIComponent(businessId)}`).then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el pipeline");
        return response.json() as Promise<{ leads: PipelineLeadRecord[] }>;
      }),
    ]).then(([columnsData, leadsData]) => {
      if (!active) return;
      setColumns(columnsData.columns);
      setLeads(leadsData.leads);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Error inesperado");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [businessId]);

  async function addColumn() {
    const name = window.prompt("Nombre de la nueva columna");
    if (!name?.trim()) return;
    const response = await fetch("/api/pipeline/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, name }),
    });
    if (response.ok) await reload();
  }

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadModal) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/pipeline/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        columnId: leadModal.columnId,
        clientName: form.get("clientName"),
        subject: form.get("subject"),
        amount: Number(form.get("amount")),
        currency: form.get("currency"),
        priority: form.get("priority"),
      }),
    });
    if (response.ok) {
      setLeadModal(null);
      await reload();
    }
  }

  async function moveLead(columnId: string) {
    if (!draggingId) return;
    setLeads((current) => current.map((lead) => lead.id === draggingId ? { ...lead, columnId } : lead));
    await fetch("/api/pipeline/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, id: draggingId, columnId }),
    });
    setDraggingId(null);
  }

  async function deleteLead(id: string) {
    if (!window.confirm("¿Eliminar esta oportunidad?")) return;
    const response = await fetch("/api/pipeline/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, id }),
    });
    if (response.ok) setLeads((current) => current.filter((lead) => lead.id !== id));
  }

  return (
    <div className={compact ? "panel pipeline-compact" : ""}>
      {!compact && <PageHeading eyebrow="VENTAS" title="Pipeline" description="Seguimiento real de oportunidades, aislado por empresa." action={<button className="primary" onClick={addColumn}>＋ Nueva columna</button>} />}
      {compact && <div className="panel-head"><div><span className="eyebrow">OPORTUNIDADES</span><h2>Pipeline comercial</h2></div><button className="text-button" onClick={addColumn}>＋ Columna</button></div>}
      {loading && <div className="pipeline-message">Cargando pipeline...</div>}
      {error && <div className="pipeline-message pipeline-error">{error}</div>}
      {!loading && !error && (
        <div className="pipeline-board">
          {columns.map((column) => {
            const columnLeads = leads.filter((lead) => lead.columnId === column.id);
            return (
              <div className="pipeline-column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={() => moveLead(column.id)}>
                <div className="pipeline-column-head"><span className="pipeline-color" style={{ background: column.color }} /><strong>{column.name}</strong><span>{columnLeads.length}</span><button onClick={() => setLeadModal({ columnId: column.id })}>＋</button></div>
                {columnLeads.map((lead) => (
                  <article className="pipeline-card" key={lead.id} draggable onDragStart={() => setDraggingId(lead.id)}>
                    <span className="guest-avatar">{lead.clientName.slice(0, 2).toUpperCase()}</span>
                    <strong>{lead.clientName}</strong>
                    <small>{lead.subject || "Sin detalle"}</small>
                    <b>{lead.currency === "USD" ? "US$" : "$"} {lead.amount.toLocaleString("es-AR")}</b>
                    <i className={`priority priority-${lead.priority}`}>{lead.priority}</i>
                    <button onClick={() => deleteLead(lead.id)} aria-label={`Eliminar ${lead.clientName}`}>×</button>
                  </article>
                ))}
                <button className="add-lead" onClick={() => setLeadModal({ columnId: column.id })}>＋ Agregar oportunidad</button>
              </div>
            );
          })}
        </div>
      )}
      {leadModal && (
        <div className="modal-backdrop" onMouseDown={() => setLeadModal(null)}>
          <form className="modal" onSubmit={saveLead} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">PIPELINE</span><h2>Nueva oportunidad</h2></div><button type="button" onClick={() => setLeadModal(null)}>×</button></div>
            <label>Cliente<input name="clientName" placeholder="Nombre o empresa" required autoFocus /></label>
            <label>Asunto<input name="subject" placeholder="Servicio o necesidad" /></label>
            <div className="form-grid"><label>Monto<input name="amount" type="number" min="0" defaultValue="0" /></label><label>Moneda<select name="currency"><option>ARS</option><option>USD</option></select></label></div>
            <label>Prioridad<select name="priority" defaultValue="media"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
            <div className="modal-actions"><button type="button" className="secondary" onClick={() => setLeadModal(null)}>Cancelar</button><button className="primary" type="submit">Crear oportunidad</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function Finances() {
  return (
    <>
      <PageHeading eyebrow="ADMINISTRACIÓN" title="Finanzas" description="Ingresos, egresos y movimientos del negocio en un solo tablero." action={<button className="primary">＋ Registrar movimiento</button>} />
      <div className="kpi-grid"><Kpi label="Ingresos del mes" value="$ 8,4 M" meta="+14,2% vs. julio" tone="green" /><Kpi label="Egresos del mes" value="$ 3,1 M" meta="36,9% de ingresos" tone="orange" /><Kpi label="Balance" value="$ 5,3 M" meta="Resultado positivo" tone="blue" /><Kpi label="Ticket promedio" value="$ 32.400" meta="+6,4% este mes" tone="violet" /></div>
      <div className="two-columns"><div className="panel finance-chart"><div className="panel-head"><div><span className="eyebrow">FLUJO</span><h2>Ingresos y egresos</h2></div><select><option>Últimos 6 meses</option></select></div><div className="line-chart"><span className="chart-line line-one" /><span className="chart-line line-two" />{[44, 58, 52, 72, 68, 89].map((value, index) => <i key={index} style={{ left: `${index * 19 + 2}%`, bottom: `${value}%` }} />)}</div><div className="chart-months"><span>Mar</span><span>Abr</span><span>May</span><span>Jun</span><span>Jul</span><span>Ago</span></div></div><div className="panel movement-list"><div className="panel-head"><div><span className="eyebrow">RECIENTES</span><h2>Últimos movimientos</h2></div></div>{[["Cierre de caja", "+ $ 486.200", "Ingreso"], ["Proveedor de bebidas", "− $ 128.400", "Egreso"], ["Reserva evento", "+ $ 220.000", "Ingreso"], ["Insumos cocina", "− $ 94.800", "Egreso"]].map((row) => <div key={row[0]}><span className={row[2] === "Ingreso" ? "activity-icon" : "activity-icon gold"}>{row[2] === "Ingreso" ? "↑" : "↓"}</span><p><strong>{row[0]}</strong><small>Hoy · Transferencia</small></p><b>{row[1]}</b></div>)}</div></div>
    </>
  );
}

function Metrics({ business }: { business: Business }) {
  const restaurant = business.type === "Restaurante";
  return (
    <>
      <PageHeading eyebrow="ANÁLISIS" title="Métricas" description={restaurant ? "Tendencias de reservas, ocupación y experiencia del cliente." : "Rendimiento comercial y evolución de la cartera."} action={<button className="filter-button">Últimos 30 días ⌄</button>} />
      <div className="kpi-grid"><Kpi label={restaurant ? "Reservas" : "Nuevos contactos"} value={restaurant ? "426" : "84"} meta="+18,4% vs. período anterior" tone="orange" /><Kpi label={restaurant ? "Ocupación promedio" : "Conversión"} value={restaurant ? "71%" : "23,8%"} meta="+4,2 puntos" tone="green" /><Kpi label={restaurant ? "No-show" : "Tiempo de respuesta"} value={restaurant ? "3,8%" : "8 min"} meta="Mejoró 1,4 puntos" tone="blue" /><Kpi label="Satisfacción" value="4,8" meta="Sobre 5 · 96 reseñas" tone="violet" /></div>
      <div className="two-columns"><div className="panel metrics-panel"><div className="panel-head"><div><span className="eyebrow">EVOLUCIÓN</span><h2>{restaurant ? "Reservas por día" : "Contactos por día"}</h2></div></div><div className="metric-bars">{[55, 68, 48, 83, 92, 76, 64, 88, 71, 96, 82, 91].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} /><small>{index % 2 === 0 ? index + 1 : ""}</small></div>)}</div></div><div className="panel source-panel"><div className="panel-head"><div><span className="eyebrow">ORIGEN</span><h2>Canales principales</h2></div></div>{[["WhatsApp", 62], ["Instagram", 21], ["Web", 11], ["Teléfono", 6]].map((source) => <div className="source-row" key={source[0]}><span>{source[0]}</span><div><i style={{ width: `${source[1]}%` }} /></div><b>{source[1]}%</b></div>)}</div></div>
    </>
  );
}
