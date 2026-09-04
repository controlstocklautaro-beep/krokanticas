"use client";

// Web Audio API context singleton
let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

export function unlockAudio() {
  if (audioUnlocked) return;
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().then(() => {
      audioUnlocked = true;
    });
  } else if (ctx) {
    audioUnlocked = true;
  }
}

// Auto unlock on first user interaction
if (typeof window !== "undefined") {
  const unlockEvents = ["click", "touchstart", "keydown"];
  const handleUnlock = () => {
    unlockAudio();
    for (const evt of unlockEvents) {
      window.removeEventListener(evt, handleUnlock);
    }
  };
  for (const evt of unlockEvents) {
    window.addEventListener(evt, handleUnlock, { passive: true });
  }
}

const SOUND_PREF_KEY = "krokanticas_sound_enabled";
const VOLUME_PREF_KEY = "krokanticas_sound_volume";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const val = localStorage.getItem(SOUND_PREF_KEY);
  return val !== "false";
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_PREF_KEY, enabled ? "true" : "false");
}

export function getSoundVolume(): number {
  if (typeof window === "undefined") return 1;
  const val = localStorage.getItem(VOLUME_PREF_KEY);
  return val ? Math.max(0, Math.min(1, parseFloat(val))) : 1;
}

export function setSoundVolume(volume: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOLUME_PREF_KEY, String(Math.max(0, Math.min(1, volume))));
}

/**
 * Sonido de Campana de Cocina:
 * Tono fuerte, claro y resonante de 3 notas armónicas (Do-Mi-Sol / 523Hz -> 659Hz -> 784Hz)
 * simulando una campana de pedido de restaurante con excelente volumen y penetración acústica.
 */
export function playKitchenOrderSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const baseVolume = getSoundVolume();
  const now = ctx.currentTime;

  // Triada armónica en progresión ascendente
  const notes = [
    { freq: 523.25, time: 0.0, dur: 0.85, gain: 0.7 },   // C5
    { freq: 659.25, time: 0.12, dur: 0.95, gain: 0.85 }, // E5
    { freq: 783.99, time: 0.24, dur: 1.3, gain: 1.0 },   // G5
    { freq: 1046.50, time: 0.24, dur: 1.1, gain: 0.4 },  // C6 (armónico brillante)
  ];

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Forma de onda rica y brillante
    osc.type = "sine";
    osc.frequency.setValueAtTime(note.freq, now + note.time);

    const startTime = now + note.time;
    const endTime = startTime + note.dur;
    const peakGain = note.gain * baseVolume * 0.9;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(peakGain * 0.4, startTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(endTime);
  }
}

/**
 * Sonido de Mensaje estilo WhatsApp:
 * Doble tono sutil, rápido y limpio (estilo pop/water drop) de WhatsApp.
 */
export function playChatMessageSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const baseVolume = getSoundVolume();
  const now = ctx.currentTime;

  // Dos blips suaves y distintivos
  const tones = [
    { freq: 880, time: 0.0, dur: 0.08, gain: 0.35 },    // A5
    { freq: 1318.5, time: 0.07, dur: 0.18, gain: 0.45 }, // E6
  ];

  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(tone.freq, now + tone.time);

    const startTime = now + tone.time;
    const endTime = startTime + tone.dur;
    const peakGain = tone.gain * baseVolume * 0.7;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(endTime);
  }
}

/**
 * Sonido de Alerta de Sirena para Derivaciones / Intervención Humana Requerida:
 * Doble oscilación de sirena modulada potente y urgente (estilo sirena/alarma de emergencia)
 */
export function playHandoffAlertSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const baseVolume = getSoundVolume();
  const now = ctx.currentTime;

  // Realizamos 2 ciclos de sirena ascendente y descendente (urgente / atención)
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth"; // Tono brillante y penetrante tipo sirena de emergencia

  // Modulación de frecuencia de sirena: 600Hz -> 1050Hz -> 650Hz -> 1050Hz -> 600Hz
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(1050, now + 0.18);
  osc.frequency.exponentialRampToValueAtTime(620, now + 0.36);
  osc.frequency.exponentialRampToValueAtTime(1050, now + 0.54);
  osc.frequency.exponentialRampToValueAtTime(620, now + 0.75);

  const peakGain = 0.55 * baseVolume;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.05);
  gain.gain.setValueAtTime(peakGain, now + 0.65);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.86);

  // Segundo oscilador armónico para mayor cuerpo
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = "sine";
  subOsc.frequency.setValueAtTime(310, now);
  subOsc.frequency.exponentialRampToValueAtTime(525, now + 0.18);
  subOsc.frequency.exponentialRampToValueAtTime(310, now + 0.36);
  subOsc.frequency.exponentialRampToValueAtTime(525, now + 0.54);
  subOsc.frequency.exponentialRampToValueAtTime(310, now + 0.75);

  const subPeakGain = 0.4 * baseVolume;
  subGain.gain.setValueAtTime(0.001, now);
  subGain.gain.linearRampToValueAtTime(subPeakGain, now + 0.05);
  subGain.gain.setValueAtTime(subPeakGain, now + 0.65);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

  subOsc.connect(subGain);
  subGain.connect(ctx.destination);

  subOsc.start(now);
  subOsc.stop(now + 0.86);
}

/**
 * Gestión de Notificaciones del Sistema (Desktop Notifications API)
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}

export function canSendDesktopNotifications(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return Notification.permission === "granted";
}

export function sendDesktopNotification(options: {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  onClick?: () => void;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notif = new Notification(options.title, {
      body: options.body,
      tag: options.tag || "krokanticas-alert",
      icon: options.icon || "/favicon.ico",
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
      if (options.onClick) options.onClick();
    };

    // Auto close after 7 seconds
    setTimeout(() => {
      try {
        notif.close();
      } catch {
        // ignore
      }
    }, 7000);
  } catch (err) {
    console.warn("No se pudo disparar notificación de escritorio", err);
  }
}
