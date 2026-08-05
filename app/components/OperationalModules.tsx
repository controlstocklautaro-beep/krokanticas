"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type ChatRecord = {
  phone_number: string;
  user_name: string;
  agent_active: boolean;
  updated_at: number;
  tags: string[];
  last_message?: string | null;
};

type MessageRecord = {
  id: string;
  phone_number: string;
  sender: "user" | "agent";
  message: string;
  type: string;
  media_deleted: boolean;
  created_at: number;
};

type TagRecord = { id: string; name: string; color: string };
type ContactRecord = {
  id: string;
  phone_number: string;
  name: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  agent_active: boolean;
  updated_at: number;
};

type TransactionRecord = {
  id: string;
  type: "ingreso" | "egreso";
  concept: string;
  amount: number;
  currency: "ARS" | "USD";
  category: string;
  date: number;
  status: "pagado" | "pendiente";
  notes?: string | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function relativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

export function MessagesModule({ businessId }: { businessId: string }) {
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [tagMenu, setTagMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function refreshChats() {
    const [chatData, tagData] = await Promise.all([
      api<{ chats: ChatRecord[] }>(`/api/chats?businessId=${encodeURIComponent(businessId)}`),
      api<{ tags: TagRecord[] }>(`/api/tags?businessId=${encodeURIComponent(businessId)}`),
    ]);
    setChats(chatData.chats);
    setTags(tagData.tags);
    setSelectedPhone((current) => current && chatData.chats.some((chat) => chat.phone_number === current) ? current : chatData.chats[0]?.phone_number ?? null);
  }

  async function refreshMessages(phoneNumber: string) {
    const data = await api<{ messages: MessageRecord[] }>(`/api/messages?businessId=${encodeURIComponent(businessId)}&phone_number=${encodeURIComponent(phoneNumber)}`);
    setMessages(data.messages);
  }

  useEffect(() => {
    let active = true;
    const refresh = () => Promise.all([
      api<{ chats: ChatRecord[] }>(`/api/chats?businessId=${encodeURIComponent(businessId)}`),
      api<{ tags: TagRecord[] }>(`/api/tags?businessId=${encodeURIComponent(businessId)}`),
    ]).then(([chatData, tagData]) => {
      if (!active) return;
      setChats(chatData.chats);
      setTags(tagData.tags);
      setSelectedPhone((current) => current && chatData.chats.some((chat) => chat.phone_number === current) ? current : chatData.chats[0]?.phone_number ?? null);
    }).catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Error al cargar"));
    void refresh();
    const timer = window.setInterval(refresh, 8_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [businessId]);

  useEffect(() => {
    if (!selectedPhone) return;
    let active = true;
    const refresh = () => api<{ messages: MessageRecord[] }>(`/api/messages?businessId=${encodeURIComponent(businessId)}&phone_number=${encodeURIComponent(selectedPhone)}`)
      .then((data) => { if (active) setMessages(data.messages); })
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Error al cargar mensajes"));
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [businessId, selectedPhone]);

  const selectedChat = chats.find((chat) => chat.phone_number === selectedPhone) ?? null;
  const filteredChats = chats.filter((chat) => `${chat.user_name} ${chat.phone_number}`.toLowerCase().includes(search.toLowerCase()));

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedPhone || !message.trim()) return;
    const outgoing = message.trim();
    setMessage("");
    setBusy(true);
    try {
      await api("/api/send-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, phone_number: selectedPhone, message: outgoing }) });
      await Promise.all([refreshMessages(selectedPhone), refreshChats()]);
    } catch (sendError) {
      setMessage(outgoing);
      setError(sendError instanceof Error ? sendError.message : "No se pudo enviar");
    } finally { setBusy(false); }
  }

  async function toggleBot() {
    if (!selectedChat) return;
    const next = !selectedChat.agent_active;
    setChats((current) => current.map((chat) => chat.phone_number === selectedChat.phone_number ? { ...chat, agent_active: next } : chat));
    try {
      await api("/api/toggle-bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, phone_number: selectedChat.phone_number, agent_active: next }) });
    } catch { await refreshChats(); }
  }

  async function toggleTag(tag: TagRecord) {
    if (!selectedChat) return;
    const selected = selectedChat.tags.includes(tag.name);
    await api(selected ? "/api/remove-tags" : "/api/assign-tags", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, phone_number: selectedChat.phone_number, tags: [tag.name] }),
    });
    await refreshChats();
  }

  async function upload(file: File) {
    if (!selectedPhone) return;
    const endpoint = file.type.startsWith("image/") ? "/api/upload-image" : file.type.startsWith("audio/") ? "/api/upload-media" : null;
    if (!endpoint) { setError("Solo se admiten imágenes y audios"); return; }
    const form = new FormData();
    form.set("businessId", businessId); form.set("phone_number", selectedPhone); form.set("sender", "agent"); form.set("file", file);
    setBusy(true);
    try { await api(endpoint, { method: "POST", body: form }); await refreshMessages(selectedPhone); }
    catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el archivo"); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function deleteChat() {
    if (!selectedPhone || !window.confirm("¿Eliminar permanentemente esta conversación? El contacto se conservará.")) return;
    await api("/api/delete-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, phone_number: selectedPhone }) });
    setMessages([]); setSelectedPhone(null); await refreshChats();
  }

  return (
    <div className="real-module">
      <div className="module-heading"><div><span className="eyebrow">WHATSAPP</span><h1>Mensajes</h1><p>Conversaciones, etiquetas y control del bot en una bandeja compartida.</p></div><span className="sync-badge">● Sincronizado</span></div>
      {error && <button className="module-error" onClick={() => setError("")}>{error} ×</button>}
      <div className="messages-layout panel real-messages">
        <div className="chat-list">
          <div className="chat-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversación" aria-label="Buscar conversación" /></div>
          {filteredChats.map((chat) => <button key={chat.phone_number} className={selectedPhone === chat.phone_number ? "selected" : ""} onClick={() => setSelectedPhone(chat.phone_number)}><span className="guest-avatar">{initials(chat.user_name)}</span><span><strong>{chat.user_name}</strong><small>{chat.last_message || chat.phone_number}</small><i className={chat.agent_active ? "bot-on" : "bot-off"}>{chat.agent_active ? "Bot ON" : "Bot OFF"}</i></span><time>{relativeTime(chat.updated_at)}</time></button>)}
          {!filteredChats.length && <div className="empty-list">No hay conversaciones todavía.</div>}
        </div>
        {selectedChat ? <div className="chat-window">
          <div className="chat-person"><span className="guest-avatar">{initials(selectedChat.user_name)}</span><span><strong>{selectedChat.user_name}</strong><small>{selectedChat.phone_number}</small></span><div className="chat-tools"><button className={selectedChat.agent_active ? "active" : ""} onClick={toggleBot}>{selectedChat.agent_active ? "Bot activo" : "Bot inactivo"}</button><div className="tag-control"><button onClick={() => setTagMenu((open) => !open)}>Etiquetas ⌄</button>{tagMenu && <div className="tag-popover">{tags.map((tag) => <button key={tag.id} onClick={() => toggleTag(tag)}><i style={{ background: tag.color }} />{tag.name}<b>{selectedChat.tags.includes(tag.name) ? "✓" : ""}</b></button>)}{!tags.length && <small>Creá etiquetas desde el menú.</small>}</div>}</div><button onClick={deleteChat} aria-label="Eliminar chat">⌫</button></div></div>
          <div className="chat-body real-chat-body">{messages.map((item) => <div key={item.id} className={`bubble ${item.sender === "agent" ? "outgoing" : "incoming"}`}>{item.media_deleted && (item.type === "image" || item.type === "audio") ? <em>Archivo vencido</em> : item.type === "image" ? <Image unoptimized width={320} height={240} src={item.message} alt="Imagen compartida" /> : item.type === "audio" ? <audio controls src={item.message} /> : item.message}<time>{new Date(item.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</time></div>)}{!messages.length && <div className="empty-chat">Todavía no hay mensajes en esta conversación.</div>}</div>
          <form className="chat-compose" onSubmit={send}><input ref={fileInput} className="hidden-file" type="file" accept="image/*,audio/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} /><button type="button" onClick={() => fileInput.current?.click()} aria-label="Adjuntar">＋</button><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribí un mensaje..." aria-label="Escribir mensaje" /><button className="send" disabled={busy || !message.trim()}>➤</button></form>
        </div> : <div className="chat-empty-state"><span>◌</span><strong>Seleccioná una conversación</strong><small>Los mensajes del negocio aparecerán acá.</small></div>}
      </div>
    </div>
  );
}

export function CustomersModule({ businessId }: { businessId: string }) {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ContactRecord | null | "new">(null);
  const [error, setError] = useState("");

  async function reload() {
    const data = await api<{ contacts: ContactRecord[] }>(`/api/contacts?businessId=${encodeURIComponent(businessId)}`);
    setContacts(data.contacts);
  }

  useEffect(() => { void api<{ contacts: ContactRecord[] }>(`/api/contacts?businessId=${encodeURIComponent(businessId)}`).then((data) => setContacts(data.contacts)).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar")); }, [businessId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { businessId, id: typeof editing === "object" && editing ? editing.id : undefined, name: form.get("name"), phone_number: form.get("phone"), email: form.get("email"), address: form.get("address"), notes: form.get("notes") };
    try {
      await api("/api/contacts", { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setEditing(null); await reload();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar"); }
  }

  async function remove(contact: ContactRecord) {
    if (!window.confirm(`¿Eliminar a ${contact.name}?`)) return;
    await api("/api/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, id: contact.id }) });
    setContacts((current) => current.filter((item) => item.id !== contact.id));
  }

  const filtered = contacts.filter((contact) => `${contact.name} ${contact.phone_number} ${contact.email || ""} ${contact.address || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="real-module"><div className="module-heading"><div><span className="eyebrow">BASE DE CLIENTES</span><h1>Contactos</h1><p>Datos, dirección de entrega y control del asistente por cliente.</p></div><button className="primary" onClick={() => setEditing("new")}>＋ Nuevo contacto</button></div>{error && <button className="module-error" onClick={() => setError("")}>{error} ×</button>}<div className="panel table-panel"><div className="table-tools"><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, teléfono o dirección" /></label><span className="record-count">{filtered.length} contactos</span></div><div className="data-table"><div className="data-row contacts-grid data-head"><span>CONTACTO</span><span>TELÉFONO</span><span>DIRECCIÓN</span><span>BOT</span><span>ACCIONES</span></div>{filtered.map((contact) => <div className="data-row contacts-grid" key={contact.id}><span className="customer-cell"><i className="guest-avatar">{initials(contact.name)}</i><strong>{contact.name}</strong></span><span>{contact.phone_number}</span><span>{contact.address || "—"}</span><span><b className={contact.agent_active ? "state-pill on" : "state-pill off"}>{contact.agent_active ? "Bot ON" : "Bot OFF"}</b></span><span className="row-actions"><button onClick={() => setEditing(contact)}>Editar</button><button onClick={() => remove(contact)}>Eliminar</button></span></div>)}{!filtered.length && <div className="empty-table">No se encontraron contactos.</div>}</div></div>{editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">CONTACTOS</span><h2>{editing === "new" ? "Nuevo contacto" : "Editar contacto"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><label>Nombre<input name="name" defaultValue={editing === "new" ? "" : editing.name} required autoFocus /></label><label>Teléfono<input name="phone" defaultValue={editing === "new" ? "" : editing.phone_number} required /></label><label>Email<input name="email" type="email" defaultValue={editing === "new" ? "" : editing.email || ""} /></label><label>Dirección de entrega<input name="address" defaultValue={editing === "new" ? "" : editing.address || ""} placeholder="Calle, número y referencia" /></label><label>Notas<textarea name="notes" defaultValue={editing === "new" ? "" : editing.notes || ""} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="primary">Guardar contacto</button></div></form></div>}</div>;
}

export function TagsModule({ businessId }: { businessId: string }) {
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [editing, setEditing] = useState<TagRecord | "new" | null>(null);
  const [error, setError] = useState("");

  async function reload() {
    const data = await api<{ tags: TagRecord[] }>(`/api/tags?businessId=${encodeURIComponent(businessId)}`);
    setTags(data.tags);
  }

  useEffect(() => {
    void api<{ tags: TagRecord[] }>(`/api/tags?businessId=${encodeURIComponent(businessId)}`)
      .then((data) => setTags(data.tags))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar"));
  }, [businessId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/tags", {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, id: typeof editing === "object" && editing ? editing.id : undefined, name: form.get("name"), color: form.get("color") }),
      });
      setEditing(null);
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar");
    }
  }

  async function remove(tag: TagRecord) {
    if (!window.confirm(`¿Eliminar la etiqueta ${tag.name}? También se quitará de las conversaciones.`)) return;
    await api("/api/tags", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, id: tag.id }) });
    setTags((current) => current.filter((item) => item.id !== tag.id));
  }

  return (
    <div className="real-module">
      <div className="module-heading"><div><span className="eyebrow">ORGANIZACIÓN</span><h1>Etiquetas</h1><p>Clasificá conversaciones con los mismos nombres que usa la operación.</p></div><button className="primary" onClick={() => setEditing("new")}>＋ Nueva etiqueta</button></div>
      {error && <button className="module-error" onClick={() => setError("")}>{error} ×</button>}
      <div className="tag-admin-grid">{tags.map((tag) => <article className="panel tag-admin-card" key={tag.id}><i style={{ background: tag.color }} /><div><strong>{tag.name}</strong><small>{tag.color.toUpperCase()}</small></div><button onClick={() => setEditing(tag)}>Editar</button><button onClick={() => remove(tag)}>Eliminar</button></article>)}{!tags.length && <div className="panel empty-table">Todavía no hay etiquetas creadas.</div>}</div>
      {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">ETIQUETAS</span><h2>{editing === "new" ? "Nueva etiqueta" : "Editar etiqueta"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><label>Nombre<input name="name" defaultValue={editing === "new" ? "" : editing.name} required autoFocus /></label><label>Color<input name="color" type="color" defaultValue={editing === "new" ? "#ed6a2c" : editing.color} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="primary" type="submit">Guardar etiqueta</button></div></form></div>}
    </div>
  );
}

const financeCategories = ["Ventas", "Servicios", "Proveedores", "Sueldos", "Marketing", "Impuestos", "Gastos operativos", "Otros"];

export function FinancesModule({ businessId }: { businessId: string }) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [editing, setEditing] = useState<TransactionRecord | "new" | null>(null);
  const [error, setError] = useState("");

  async function reload() {
    const data = await api<{ transactions: TransactionRecord[] }>(`/api/finances?businessId=${encodeURIComponent(businessId)}`);
    setTransactions(data.transactions);
  }

  useEffect(() => {
    void api<{ transactions: TransactionRecord[] }>(`/api/finances?businessId=${encodeURIComponent(businessId)}`)
      .then((data) => setTransactions(data.transactions))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar"));
  }, [businessId]);

  const totals = useMemo(() => {
    const result = { ARS: { ingreso: 0, egreso: 0 }, USD: { ingreso: 0, egreso: 0 } };
    for (const item of transactions) result[item.currency][item.type] += item.amount;
    return result;
  }, [transactions]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/finances", {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, id: typeof editing === "object" && editing ? editing.id : undefined, type: form.get("type"), concept: form.get("concept"), amount: Number(form.get("amount")), currency: form.get("currency"), category: form.get("category"), date: form.get("date"), status: form.get("status"), notes: form.get("notes") }),
      });
      setEditing(null);
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar");
    }
  }

  async function remove(item: TransactionRecord) {
    if (!window.confirm(`¿Eliminar el movimiento “${item.concept}”?`)) return;
    await api("/api/finances", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, id: item.id }) });
    setTransactions((current) => current.filter((transaction) => transaction.id !== item.id));
  }

  const money = (value: number, currency: "ARS" | "USD") => new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  return (
    <div className="real-module">
      <div className="module-heading"><div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Finanzas</h1><p>Ingresos y egresos persistentes, separados por empresa.</p></div><button className="primary" onClick={() => setEditing("new")}>＋ Registrar movimiento</button></div>
      {error && <button className="module-error" onClick={() => setError("")}>{error} ×</button>}
      <div className="finance-kpis"><div className="panel"><small>Balance ARS</small><strong>{money(totals.ARS.ingreso - totals.ARS.egreso, "ARS")}</strong><span>{money(totals.ARS.ingreso, "ARS")} ingresados</span></div><div className="panel"><small>Egresos ARS</small><strong>{money(totals.ARS.egreso, "ARS")}</strong><span>{transactions.filter((item) => item.currency === "ARS").length} movimientos</span></div><div className="panel"><small>Balance USD</small><strong>{money(totals.USD.ingreso - totals.USD.egreso, "USD")}</strong><span>{money(totals.USD.ingreso, "USD")} ingresados</span></div></div>
      <div className="panel table-panel"><div className="data-table"><div className="data-row finance-grid data-head"><span>FECHA</span><span>CONCEPTO</span><span>CATEGORÍA</span><span>ESTADO</span><span>MONTO</span><span>ACCIONES</span></div>{transactions.map((item) => <div className="data-row finance-grid" key={item.id}><span>{new Date(item.date).toLocaleDateString("es-AR")}</span><span><strong>{item.concept}</strong></span><span>{item.category}</span><span><b className={`state-pill ${item.status === "pagado" ? "on" : "off"}`}>{item.status}</b></span><span className={item.type === "ingreso" ? "money-in" : "money-out"}>{item.type === "ingreso" ? "+" : "−"} {money(item.amount, item.currency)}</span><span className="row-actions"><button onClick={() => setEditing(item)}>Editar</button><button onClick={() => remove(item)}>Eliminar</button></span></div>)}{!transactions.length && <div className="empty-table">Todavía no hay movimientos registrados.</div>}</div></div>
      {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">FINANZAS</span><h2>{editing === "new" ? "Nuevo movimiento" : "Editar movimiento"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><div className="form-grid"><label>Tipo<select name="type" defaultValue={editing === "new" ? "ingreso" : editing.type}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></label><label>Estado<select name="status" defaultValue={editing === "new" ? "pagado" : editing.status}><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select></label></div><label>Concepto<input name="concept" defaultValue={editing === "new" ? "" : editing.concept} required autoFocus /></label><div className="form-grid"><label>Monto<input name="amount" type="number" min="0" step="0.01" defaultValue={editing === "new" ? "" : editing.amount} required /></label><label>Moneda<select name="currency" defaultValue={editing === "new" ? "ARS" : editing.currency}><option>ARS</option><option>USD</option></select></label></div><div className="form-grid"><label>Categoría<select name="category" defaultValue={editing === "new" ? "Otros" : editing.category}>{financeCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Fecha<input name="date" type="date" defaultValue={editing === "new" ? new Date().toISOString().slice(0, 10) : new Date(editing.date).toISOString().slice(0, 10)} required /></label></div><label>Notas<textarea name="notes" defaultValue={editing === "new" ? "" : editing.notes || ""} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="primary" type="submit">Guardar movimiento</button></div></form></div>}
    </div>
  );
}

type MetricsData = {
  totals: { chats?: number; contacts?: number; messages?: number; user_messages?: number; agent_messages?: number } | null;
  history: { month: string; messages: number; chats: number }[];
  topContacts: { phone_number: string; name: string; count: number }[];
  tagDistribution: { id: string; name: string; color: string; count: number }[];
  finances: { type: "ingreso" | "egreso"; currency: "ARS" | "USD"; total: number }[];
};

export function MetricsModule({ businessId, businessType }: { businessId: string; businessType: string }) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<MetricsData>(`/api/metrics?businessId=${encodeURIComponent(businessId)}`)
      .then(setData)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error al cargar"));
  }, [businessId]);

  const maximum = Math.max(1, ...(data?.history.map((item) => Number(item.messages)) ?? [1]));
  const financeBalance = (currency: "ARS" | "USD") => (data?.finances ?? []).reduce((sum, item) => item.currency === currency ? sum + (item.type === "ingreso" ? Number(item.total) : -Number(item.total)) : sum, 0);
  return (
    <div className="real-module">
      <div className="module-heading"><div><span className="eyebrow">ANÁLISIS</span><h1>Métricas</h1><p>Actividad real de mensajes, contactos y operación de {businessType.toLowerCase()}.</p></div><span className="sync-badge">● Datos en vivo</span></div>
      {error && <button className="module-error" onClick={() => setError("")}>{error} ×</button>}
      {!data ? <div className="panel empty-table">Cargando métricas...</div> : <><div className="finance-kpis metrics-kpis"><div className="panel"><small>Conversaciones</small><strong>{Number(data.totals?.chats ?? 0).toLocaleString("es-AR")}</strong><span>Chats del negocio</span></div><div className="panel"><small>Mensajes</small><strong>{Number(data.totals?.messages ?? 0).toLocaleString("es-AR")}</strong><span>{Number(data.totals?.agent_messages ?? 0)} enviados por el equipo</span></div><div className="panel"><small>Contactos</small><strong>{Number(data.totals?.contacts ?? 0).toLocaleString("es-AR")}</strong><span>Base consolidada</span></div><div className="panel"><small>Balance ARS</small><strong>{new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(financeBalance("ARS"))}</strong><span>Ingresos menos egresos</span></div></div><div className="metrics-real-grid"><div className="panel metrics-panel"><div className="panel-head"><div><span className="eyebrow">EVOLUCIÓN</span><h2>Mensajes por mes</h2></div></div><div className="metric-bars real-bars">{data.history.map((item) => <div key={item.month}><span style={{ height: `${Math.max(4, Number(item.messages) / maximum * 100)}%` }} /><small>{item.month.slice(5)}</small></div>)}{!data.history.length && <div className="empty-table">Sin actividad todavía.</div>}</div></div><div className="panel ranked-panel"><div className="panel-head"><div><span className="eyebrow">CONTACTOS</span><h2>Más activos</h2></div></div>{data.topContacts.map((contact, index) => <div className="rank-row" key={contact.phone_number}><b>{index + 1}</b><span><strong>{contact.name}</strong><small>{contact.phone_number}</small></span><em>{contact.count} mensajes</em></div>)}{!data.topContacts.length && <div className="empty-table">Sin contactos todavía.</div>}</div><div className="panel ranked-panel"><div className="panel-head"><div><span className="eyebrow">ETIQUETAS</span><h2>Distribución</h2></div></div>{data.tagDistribution.map((tag) => <div className="tag-stat" key={tag.id}><i style={{ background: tag.color }} /><span>{tag.name}</span><strong>{tag.count}</strong></div>)}{!data.tagDistribution.length && <div className="empty-table">Sin etiquetas todavía.</div>}</div></div></>}
    </div>
  );
}
