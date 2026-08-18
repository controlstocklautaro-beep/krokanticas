"use client";

import { FormEvent, useEffect, useState } from "react";

type Role = "owner" | "admin" | "manager" | "reception" | "cashier" | "staff";
type UserRecord = { id: string; name: string; email: string; role: Role; active: boolean; must_change_password: boolean; last_login_at?: number | null; created_at: number };

const roleLabels: Record<Role, string> = {
  owner: "Propietario",
  admin: "Administrador",
  manager: "Encargado",
  reception: "Atención",
  cashier: "Caja",
  staff: "Equipo",
};

async function usersApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("No se pudo conectar con el panel");
  const data = await response.json() as T & { error?: string };
  if (response.status === 401) { window.location.replace("/login"); throw new Error("La sesión venció"); }
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function UsersModule({ businessId, currentUser }: { businessId: string; currentUser: { id?: string; email: string; role: Role } }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [editing, setEditing] = useState<"new" | UserRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const data = await usersApi<{ users: UserRecord[] }>(`/api/users?businessId=${encodeURIComponent(businessId)}`);
    setUsers(data.users);
  }

  useEffect(() => {
    let active = true;
    void usersApi<{ users: UserRecord[] }>(`/api/users?businessId=${encodeURIComponent(businessId)}`).then((data) => {
      if (active) setUsers(data.users);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios");
    });
    return () => { active = false; };
  }, [businessId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      businessId,
      id: editing === "new" ? undefined : editing?.id,
      name: String(form.get("name") || ""),
      email: editing === "new" ? String(form.get("email") || "") : undefined,
      role: String(form.get("role") || "staff"),
      active: editing === "new" ? undefined : form.get("active") === "on",
      password: String(form.get("password") || "") || undefined,
    };
    try {
      await usersApi("/api/users", { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setEditing(null); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el usuario"); }
    finally { setBusy(false); }
  }

  return <div className="k-module k-users-module">
    <div className="k-heading"><div><span className="k-eyebrow">SEGURIDAD Y ACCESOS</span><h1>Usuarios</h1><p>Administrá quién puede ingresar y qué funciones puede utilizar dentro del panel.</p></div><button className="k-primary" onClick={() => setEditing("new")}>＋ Nuevo usuario</button></div>
    {error && <button className="k-error" onClick={() => setError("")}>{error} ×</button>}
    <div className="k-users-summary"><div><span>USUARIOS</span><strong>{users.length}</strong><small>registrados</small></div><div><span>ACTIVOS</span><strong>{users.filter((user) => user.active).length}</strong><small>con acceso</small></div><div><span>ADMINISTRADORES</span><strong>{users.filter((user) => user.active && ["owner", "admin"].includes(user.role)).length}</strong><small>pueden gestionar usuarios</small></div></div>
    <div className="k-users-list">{users.map((user) => <article className={`k-user-card ${user.active ? "" : "disabled"}`} key={user.id}><span className="k-user-avatar">{initials(user.name)}</span><div className="k-user-main"><div><h2>{user.name}{user.email === currentUser.email && <em>Vos</em>}</h2><p>{user.email}</p></div><div className="k-user-meta"><b>{roleLabels[user.role]}</b><span className={user.active ? "active" : "inactive"}>{user.active ? "Acceso activo" : "Desactivado"}</span>{user.must_change_password && <span className="warning">Debe cambiar contraseña</span>}</div></div><div className="k-user-login"><span>ÚLTIMO INGRESO</span><strong>{user.last_login_at ? new Date(user.last_login_at).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nunca"}</strong></div><button className="k-user-edit" onClick={() => setEditing(user)}>Editar</button></article>)}</div>
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="modal k-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="k-eyebrow">ACCESO AL PANEL</span><h2>{editing === "new" ? "Nuevo usuario" : "Editar usuario"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><label>Nombre<input name="name" required minLength={2} maxLength={100} defaultValue={editing === "new" ? "" : editing.name} /></label>{editing === "new" && <label>Correo electrónico<input name="email" type="email" required autoComplete="off" /></label>}<label>Rol<select name="role" defaultValue={editing === "new" ? "staff" : editing.role}><option value="owner" disabled={currentUser.role !== "owner"}>Propietario</option><option value="admin">Administrador</option><option value="manager">Encargado</option><option value="reception">Atención</option><option value="cashier">Caja</option><option value="staff">Equipo</option></select></label><label>{editing === "new" ? "Contraseña temporal" : "Nueva contraseña temporal (opcional)"}<input name="password" type="password" minLength={10} required={editing === "new"} autoComplete="new-password" placeholder="Al menos una letra y un número" /></label>{editing !== "new" && <label className="k-checkbox"><input name="active" type="checkbox" defaultChecked={editing.active} /><span>Permitir que este usuario ingrese al panel</span></label>}<p className="k-form-note">Las contraseñas temporales obligan al usuario a renovarlas. Desactivar un usuario cierra sus sesiones abiertas.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="k-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar usuario"}</button></div></form></div>}
  </div>;
}
