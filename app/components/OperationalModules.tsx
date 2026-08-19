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
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`El servidor no pudo cargar los datos (${response.status}). Recargá la página e intentá nuevamente.`);
  }
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
  const [filterType, setFilterType] = useState<"all" | "bot_on" | "bot_off" | string>("all");
  const [tagMenu, setTagMenu] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#25D366");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const QUICK_REPLIES = [
    "¡Hola! ¿Cómo estás? Te dejamos nuestra carta de empanadas 🥟",
    "¡Excelente! Tu pedido ya está confirmado y pasando a cocina 👨‍🍳",
    "El cadete ya salió hacia tu domicilio con tu pedido 🛵",
    "Tu pedido ya está listo para retirar por el local 🥟📍",
    "Te compartimos el alias de Mercado Pago para la transferencia: Krokanticas2021",
    "¡Muchas gracias por tu compra! Que lo disfrutes mucho ⭐",
  ];

  const TAG_COLORS = [
    "#25D366", "#5477ef", "#ed6a2c", "#e4a140", "#8a60d0", "#e04040", "#00a884", "#35a47b"
  ];

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
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
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
    const timer = window.setInterval(refresh, 6_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [businessId]);

  useEffect(() => {
    if (!selectedPhone) return;
    let active = true;
    const refresh = () => api<{ messages: MessageRecord[] }>(`/api/messages?businessId=${encodeURIComponent(businessId)}&phone_number=${encodeURIComponent(selectedPhone)}`)
      .then((data) => { if (active) setMessages(data.messages); })
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Error al cargar mensajes"));
    void refresh();
    const timer = window.setInterval(refresh, 4_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [businessId, selectedPhone]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [selectedPhone, messages.length]);

  const selectedChat = chats.find((chat) => chat.phone_number === selectedPhone) ?? null;

  // Filtrado de chats
  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      const matchSearch = `${chat.user_name} ${chat.phone_number} ${chat.last_message || ""}`.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterType === "all") return true;
      if (filterType === "bot_on") return chat.agent_active;
      if (filterType === "bot_off") return !chat.agent_active;
      return chat.tags.includes(filterType);
    });
  }, [chats, search, filterType]);

  async function send(textToSend?: string) {
    const outgoing = (typeof textToSend === "string" ? textToSend : message).trim();
    if (!selectedPhone || !outgoing) return;
    setMessage("");
    setShowQuickReplies(false);
    setBusy(true);
    try {
      await api("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, phone_number: selectedPhone, message: outgoing }),
      });
      await Promise.all([refreshMessages(selectedPhone), refreshChats()]);
    } catch (sendError) {
      setMessage(outgoing);
      setError(sendError instanceof Error ? sendError.message : "No se pudo enviar");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBot() {
    if (!selectedChat) return;
    const next = !selectedChat.agent_active;
    setChats((current) => current.map((chat) => chat.phone_number === selectedChat.phone_number ? { ...chat, agent_active: next } : chat));
    try {
      await api("/api/toggle-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, phone_number: selectedChat.phone_number, agent_active: next }),
      });
    } catch {
      await refreshChats();
    }
  }

  async function toggleTag(tag: TagRecord) {
    if (!selectedChat) return;
    const selected = selectedChat.tags.includes(tag.name);
    await api(selected ? "/api/remove-tags" : "/api/assign-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, phone_number: selectedChat.phone_number, tags: [tag.name] }),
    });
    await refreshChats();
  }

  async function createTagSubmit(event: FormEvent) {
    event.preventDefault();
    if (!newTagName.trim()) return;
    try {
      const data = await api<{ success: boolean; tag: TagRecord }>("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name: newTagName.trim(), color: newTagColor }),
      });
      setNewTagName("");
      setCreatingTag(false);
      await refreshChats();
      if (selectedChat && data.tag) {
        await toggleTag(data.tag);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error creando etiqueta");
    }
  }

  async function upload(file: File) {
    if (!selectedPhone) return;
    const endpoint = file.type.startsWith("image/") ? "/api/upload-image" : file.type.startsWith("audio/") ? "/api/upload-media" : null;
    if (!endpoint) {
      setError("Solo se admiten imágenes y audios");
      return;
    }
    const form = new FormData();
    form.set("businessId", businessId);
    form.set("phone_number", selectedPhone);
    form.set("sender", "agent");
    form.set("file", file);
    setBusy(true);
    try {
      await api(endpoint, { method: "POST", body: form });
      await refreshMessages(selectedPhone);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el archivo");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function deleteChat() {
    if (!selectedPhone || !window.confirm(`¿Eliminar la conversación con ${selectedChat?.user_name || selectedPhone}? Los mensajes se borrarán pero el contacto se conservará.`)) return;
    await api("/api/delete-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, phone_number: selectedPhone }),
    });
    setMessages([]);
    setSelectedPhone(null);
    await refreshChats();
  }

  function formatTime(timestamp: number) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  function getTagColor(tagName: string) {
    const found = tags.find((t) => t.name === tagName);
    return found ? found.color : "#5477ef";
  }

  useEffect(() => {
    function handlePopState() {
      setSelectedPhone(null);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function openChat(phoneNumber: string) {
    setSelectedPhone(phoneNumber);
    if (typeof window !== "undefined" && window.innerWidth <= 780) {
      window.history.pushState({ krokanticasChat: phoneNumber }, "");
    }
  }

  function handleBack() {
    setSelectedPhone(null);
  }

  return (
    <div className="k-wa-container">
      {/* Visualizador de imagen en grande */}
      {previewImage && (
        <div className="modal-backdrop" onMouseDown={() => setPreviewImage(null)}>
          <div className="k-img-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="k-close-btn" onClick={() => setPreviewImage(null)}>✕</button>
            <img src={previewImage} alt="Vista previa" className="k-full-img" />
          </div>
        </div>
      )}

      {/* Modal Crear Etiqueta */}
      {creatingTag && (
        <div className="modal-backdrop" onMouseDown={() => setCreatingTag(false)}>
          <form className="modal k-modal" onSubmit={createTagSubmit} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="k-eyebrow">WHATSAPP</span>
                <h2>Nueva Etiqueta</h2>
              </div>
              <button type="button" onClick={() => setCreatingTag(false)}>×</button>
            </div>
            <label>
              Nombre de la etiqueta
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Ej: Pedido VIP, Pagó Seña, Reclamo..."
                required
                autoFocus
              />
            </label>
            <label>
              Color identificador
              <div className="k-color-picker-grid">
                {TAG_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`k-color-circle ${newTagColor === c ? "selected" : ""}`}
                    style={{ background: c }}
                    onClick={() => setNewTagColor(c)}
                  />
                ))}
              </div>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setCreatingTag(false)}>Cancelar</button>
              <button className="k-primary">Crear y Asignar</button>
            </div>
          </form>
        </div>
      )}

      <div className={`k-wa-layout ${selectedPhone ? "chat-open" : "list-open"}`}>
        {/* PANEL IZQUIERDO: LISTA DE CHATS */}
        <aside className="k-wa-sidebar">
          {/* Header de la lista */}
          <div className="k-wa-sidebar-head">
            <div className="k-wa-user-avatar">💬</div>
            <div className="k-wa-head-title">
              <strong>Chats</strong>
              <small>{chats.length} conversaciones</small>
            </div>
            <button
              className="k-wa-tag-btn"
              onClick={() => setCreatingTag(true)}
              title="Crear nueva etiqueta"
            >
              🏷️＋
            </button>
          </div>

          {/* Buscador WhatsApp */}
          <div className="k-wa-search-box">
            <div className="k-wa-search-input">
              <span>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar o empezar un nuevo chat..."
              />
              {search && <button className="k-wa-clear" onClick={() => setSearch("")}>✕</button>}
            </div>
          </div>

          {/* Filtros Rápidos (Chips) */}
          <div className="k-wa-filter-chips">
            <button
              className={`k-chip ${filterType === "all" ? "active" : ""}`}
              onClick={() => setFilterType("all")}
            >
              Todos ({chats.length})
            </button>
            <button
              className={`k-chip ${filterType === "bot_on" ? "active" : ""}`}
              onClick={() => setFilterType("bot_on")}
            >
              🤖 Bot ON
            </button>
            <button
              className={`k-chip ${filterType === "bot_off" ? "active" : ""}`}
              onClick={() => setFilterType("bot_off")}
            >
              👤 Humano
            </button>
            {tags.map((t) => (
              <button
                key={t.id}
                className={`k-chip ${filterType === t.name ? "active" : ""}`}
                style={{
                  borderColor: filterType === t.name ? t.color : undefined,
                  background: filterType === t.name ? t.color : undefined,
                  color: filterType === t.name ? "#fff" : undefined,
                }}
                onClick={() => setFilterType(filterType === t.name ? "all" : t.name)}
              >
                <i style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
          </div>

          {/* Lista de Conversaciones */}
          <div className="k-wa-chat-list">
            {filteredChats.map((chat) => {
              const isSelected = selectedPhone === chat.phone_number;
              return (
                <div
                  key={chat.phone_number}
                  className={`k-wa-chat-item ${isSelected ? "selected" : ""}`}
                  onClick={() => openChat(chat.phone_number)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="k-wa-avatar" style={{ background: chat.agent_active ? "#e2f1ea" : "#fff1d9", color: chat.agent_active ? "#1e805f" : "#a36a19" }}>
                    {initials(chat.user_name)}
                  </div>
                  <div className="k-wa-chat-info">
                    <div className="k-wa-chat-top">
                      <strong className="k-wa-chat-name">{chat.user_name}</strong>
                      <time className="k-wa-chat-time">{relativeTime(chat.updated_at)}</time>
                    </div>

                    <div className="k-wa-chat-mid">
                      <span className="k-wa-last-msg">
                        {chat.last_message ? chat.last_message : <i>Sin mensajes</i>}
                      </span>
                    </div>

                    <div className="k-wa-chat-bottom">
                      <div className="k-wa-tags-row">
                        {chat.tags.slice(0, 2).map((tg) => (
                          <span key={tg} className="k-wa-pill" style={{ background: getTagColor(tg) + "22", color: getTagColor(tg), borderColor: getTagColor(tg) + "55" }}>
                            {tg}
                          </span>
                        ))}
                        {chat.tags.length > 2 && <span className="k-wa-pill-more">+{chat.tags.length - 2}</span>}
                      </div>

                      <span className={`k-wa-bot-badge ${chat.agent_active ? "on" : "off"}`}>
                        {chat.agent_active ? "🤖 Bot ON" : "👤 Manual"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {!filteredChats.length && (
              <div className="k-wa-empty-list">
                <span>◌</span>
                <p>No se encontraron conversaciones con este filtro.</p>
              </div>
            )}
          </div>
        </aside>

        {/* PANEL DERECHO: VENTANA DE MENSAJES */}
        {selectedChat ? (
          <main className="k-wa-window">
            {/* Header del Chat */}
            <header className="k-wa-header">
              {/* Botón Volver Atrás en móvil */}
              <button
                type="button"
                className="k-wa-back-btn"
                onClick={handleBack}
                title="Volver a la lista de chats"
              >
                ←
              </button>

              <div className="k-wa-avatar" style={{ background: selectedChat.agent_active ? "#e2f1ea" : "#fff1d9", color: selectedChat.agent_active ? "#1e805f" : "#a36a19" }}>
                {initials(selectedChat.user_name)}
              </div>
              <div className="k-wa-header-info">
                <div className="k-wa-header-name-row">
                  <strong>{selectedChat.user_name}</strong>
                  <span className="k-wa-phone">{selectedChat.phone_number}</span>
                </div>
                <div className="k-wa-header-status">
                  <span className={`k-wa-status-dot ${selectedChat.agent_active ? "active" : ""}`} />
                  <small>{selectedChat.agent_active ? "Bot de IA activo" : "Atención humana"}</small>
                </div>
              </div>

              {/* Botones de Acción en Header */}
              <div className="k-wa-header-actions">
                {/* Switch de Bot */}
                <button
                  className={`k-wa-toggle-bot ${selectedChat.agent_active ? "active" : ""}`}
                  onClick={toggleBot}
                  title={selectedChat.agent_active ? "Pausar bot para intervenir como humano" : "Activar bot para que responda la IA"}
                >
                  {selectedChat.agent_active ? "🤖 Bot ON" : "👤 Manual"}
                </button>

                {/* Menú de Etiquetas */}
                <div className="k-wa-tag-menu-wrap">
                  <button
                    className="k-wa-btn-tag"
                    onClick={() => setTagMenu(!tagMenu)}
                    title="Asignar o quitar etiquetas"
                  >
                    🏷️
                  </button>

                  {tagMenu && (
                    <div className="k-wa-tag-popover" onMouseDown={(e) => e.stopPropagation()}>
                      <div className="k-wa-popover-head">
                        <strong>Etiquetas de este chat</strong>
                        <button onClick={() => setCreatingTag(true)}>＋ Nueva</button>
                      </div>
                      <div className="k-wa-tag-items">
                        {tags.map((t) => {
                          const isAssigned = selectedChat.tags.includes(t.name);
                          return (
                            <button
                              key={t.id}
                              className={`k-wa-tag-opt ${isAssigned ? "checked" : ""}`}
                              onClick={() => toggleTag(t)}
                            >
                              <i style={{ background: t.color }} />
                              <span>{t.name}</span>
                              <b className="k-check">{isAssigned ? "✓" : ""}</b>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Abrir en WhatsApp Real */}
                <a
                  href={`https://wa.me/${selectedChat.phone_number.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="k-wa-btn-ext"
                  title="Abrir chat en WhatsApp"
                >
                  📲
                </a>

                {/* Borrar Chat */}
                <button className="k-wa-btn-del" onClick={deleteChat} title="Eliminar conversación">
                  🗑
                </button>
              </div>
            </header>

            {/* Etiquetas Activas en Header */}
            {selectedChat.tags.length > 0 && (
              <div className="k-wa-tags-bar">
                <span>Etiquetas:</span>
                {selectedChat.tags.map((tg) => (
                  <span
                    key={tg}
                    className="k-wa-tag-badge"
                    style={{ background: getTagColor(tg), color: "#fff" }}
                  >
                    {tg}
                    <button onClick={() => toggleTag(tags.find((t) => t.name === tg) || { id: "", name: tg, color: "" })}>×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Cuerpo de Mensajes con Fondo WhatsApp */}
            <div className="k-wa-messages-body">
              {messages.map((item) => {
                const isOut = item.sender === "agent";
                return (
                  <div key={item.id} className={`k-wa-bubble-wrap ${isOut ? "out" : "in"}`}>
                    <div className={`k-wa-bubble ${isOut ? "bubble-out" : "bubble-in"}`}>
                      {item.media_deleted && (item.type === "image" || item.type === "audio") ? (
                        <em className="k-wa-expired">Archivo vencido</em>
                      ) : item.type === "image" ? (
                        <img
                          src={item.message}
                          alt="Imagen enviada"
                          className="k-wa-img-msg"
                          onClick={() => setPreviewImage(item.message)}
                        />
                      ) : item.type === "audio" ? (
                        <audio controls src={item.message} className="k-wa-audio-msg" />
                      ) : (
                        <span className="k-wa-text-msg">{item.message}</span>
                      )}

                      <div className="k-wa-meta">
                        <time>{formatTime(item.created_at)}</time>
                        {isOut && <span className="k-wa-ticks">✓✓</span>}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!messages.length && (
                <div className="k-wa-no-messages">
                  <p>Todavía no hay mensajes en esta conversación. Escribí abajo para iniciar el chat.</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Panel de Respuestas Rápidas */}
            {showQuickReplies && (
              <div className="k-wa-quick-replies">
                <div className="k-wa-quick-head">
                  <small>RESPUESTAS RÁPIDAS (Tocá para enviar al instante)</small>
                  <button onClick={() => setShowQuickReplies(false)}>✕</button>
                </div>
                <div className="k-wa-quick-grid">
                  {QUICK_REPLIES.map((reply, idx) => (
                    <button key={idx} onClick={() => void send(reply)}>
                      {reply}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Barra de Composición (Composer) */}
            <footer className="k-wa-composer">
              <button
                type="button"
                className={`k-wa-quick-toggle ${showQuickReplies ? "active" : ""}`}
                onClick={() => setShowQuickReplies(!showQuickReplies)}
                title="Respuestas rápidas predefinidas"
              >
                ⚡
              </button>

              <input
                ref={fileInput}
                type="file"
                accept="image/*,audio/*"
                className="hidden-file"
                onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
              />
              <button
                type="button"
                className="k-wa-attach"
                onClick={() => fileInput.current?.click()}
                title="Adjuntar imagen o comprobante"
              >
                📎
              </button>

              <form
                className="k-wa-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escribí un mensaje..."
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="k-wa-send-btn"
                  disabled={busy || !message.trim()}
                  title="Enviar mensaje"
                >
                  ➤
                </button>
              </form>
            </footer>
          </main>
        ) : (
          <main className="k-wa-empty-window">
            <div className="k-wa-empty-box">
              <div className="k-wa-big-icon">💬</div>
              <h2>WhatsApp Business Conectado</h2>
              <p>Seleccioná una conversación de la izquierda para ver los mensajes, responder como humano o activar el bot de IA.</p>
            </div>
          </main>
        )}
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
