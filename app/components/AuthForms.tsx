"use client";

import { FormEvent, useEffect, useState } from "react";

type ApiResult = { error?: string; message?: string; developmentResetUrl?: string; authenticated?: boolean; needsSetup?: boolean; setupAllowed?: boolean };

async function authApi(url: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("No se pudo conectar con el panel. Recargá la página.");
  const data = await response.json() as ApiResult;
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

function PasswordField({ value, onChange, autoComplete = "current-password", label = "Contraseña" }: { value: string; onChange: (value: string) => void; autoComplete?: string; label?: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field"><span>{label}</span><div className="auth-password"><input required minLength={10} maxLength={128} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder="Mínimo 10 caracteres" /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}>{visible ? "Ocultar" : "Ver"}</button></div></label>;
}

export function LoginForm() {
  const [setup, setSetup] = useState(false);
  const [setupBlocked, setSetupBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void authApi("/api/auth/status").then((status) => {
      if (status.authenticated) { window.location.replace("/"); return; }
      setSetup(Boolean(status.needsSetup && status.setupAllowed));
      setSetupBlocked(Boolean(status.needsSetup && !status.setupAllowed));
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el acceso")).finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (setup && password !== confirmation) { setError("Las contraseñas no coinciden"); return; }
    setBusy(true);
    try {
      await authApi(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup ? { name, email, password, setupToken } : { email, password }),
      });
      window.location.replace("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo ingresar");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="auth-loading" aria-live="polite">Preparando acceso seguro…</div>;

  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-title"><span>{setup ? "PRIMER ACCESO" : "ACCESO AL PANEL"}</span><h1>{setup ? "Crear administrador" : "Bienvenido"}</h1><p>{setup ? "Configurá el primer usuario propietario de Krokanticas." : "Ingresá con tu correo y contraseña."}</p></div>
    {setupBlocked && <div className="auth-alert">El administrador inicial debe crearse desde el acceso privado autorizado.</div>}
    {setup && <label className="auth-field"><span>Nombre del responsable</span><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Ej. Ana Krokanticas" /></label>}
    {setup && <label className="auth-field"><span>Clave de configuración inicial</span><input required type="password" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} autoComplete="off" placeholder="Clave configurada en Vercel" /></label>}
    <label className="auth-field"><span>Correo electrónico</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nombre@krokanticas.com" /></label>
    <PasswordField value={password} onChange={setPassword} autoComplete={setup ? "new-password" : "current-password"} />
    {setup && <PasswordField value={confirmation} onChange={setConfirmation} autoComplete="new-password" label="Repetir contraseña" />}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="auth-submit" type="submit" disabled={busy || setupBlocked}>{busy ? "Procesando…" : setup ? "Crear administrador e ingresar" : "Ingresar al panel"}</button>
    {!setup && <a className="auth-link" href="/forgot-password">¿Olvidaste tu contraseña?</a>}
  </form>;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setResetUrl("");
    try {
      const result = await authApi("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setMessage(result.message || "Solicitud registrada.");
      setResetUrl(result.developmentResetUrl || "");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo solicitar el enlace"); }
    finally { setBusy(false); }
  }

  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-title"><span>RECUPERACIÓN</span><h1>Recuperar acceso</h1><p>Te enviaremos un enlace de un solo uso, válido durante 30 minutos.</p></div>
    <label className="auth-field"><span>Correo electrónico</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nombre@krokanticas.com" /></label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {message && <div className="auth-success" role="status">{message}</div>}
    {resetUrl && <a className="auth-dev-link" href={resetUrl}>Abrir enlace local de recuperación</a>}
    <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Enviando…" : "Solicitar enlace"}</button>
    <a className="auth-link" href="/login">Volver al inicio de sesión</a>
  </form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!token) { setError("El enlace de recuperación no es válido"); return; }
    if (password !== confirmation) { setError("Las contraseñas no coinciden"); return; }
    setBusy(true);
    try {
      await authApi("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      setSuccess(true);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo cambiar la contraseña"); }
    finally { setBusy(false); }
  }

  if (success) return <div className="auth-form"><div className="auth-title"><span>CONTRASEÑA ACTUALIZADA</span><h1>Acceso recuperado</h1><p>Ya podés ingresar con tu nueva contraseña.</p></div><a className="auth-submit auth-submit-link" href="/login">Ir al inicio de sesión</a></div>;

  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-title"><span>NUEVA CONTRASEÑA</span><h1>Restablecer acceso</h1><p>Elegí una contraseña segura con al menos una letra y un número.</p></div>
    <PasswordField value={password} onChange={setPassword} autoComplete="new-password" label="Nueva contraseña" />
    <PasswordField value={confirmation} onChange={setConfirmation} autoComplete="new-password" label="Repetir contraseña" />
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar nueva contraseña"}</button>
    <a className="auth-link" href="/login">Volver al inicio de sesión</a>
  </form>;
}

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirmation) { setError("Las contraseñas no coinciden"); return; }
    setBusy(true);
    try {
      await authApi("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      window.location.replace("/");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la contraseña"); }
    finally { setBusy(false); }
  }

  return <form className="auth-form" onSubmit={submit}><div className="auth-title"><span>PRIMER INGRESO</span><h1>Creá tu contraseña</h1><p>La contraseña temporal solo sirve para ingresar una vez. Elegí ahora tu acceso personal.</p></div><PasswordField value={password} onChange={setPassword} autoComplete="new-password" label="Nueva contraseña" /><PasswordField value={confirmation} onChange={setConfirmation} autoComplete="new-password" label="Repetir contraseña" />{error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar y entrar al panel"}</button><a className="auth-link" href="/api/auth/logout">Cerrar sesión</a></form>;
}
