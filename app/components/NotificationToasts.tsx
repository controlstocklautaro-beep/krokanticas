"use client";

import { useEffect, useState } from "react";
import { ChefHat, MessageCircle, ArrowRight, X } from "lucide-react";

export type ToastItem = {
  id: string;
  type: "kitchen" | "whatsapp";
  title: string;
  subtitle: string;
  meta?: string;
  badgeText?: string;
  actionLabel?: string;
  onAction?: () => void;
  createdAt: number;
};

type NotificationToastsProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

export function NotificationToasts({ toasts, onDismiss }: NotificationToastsProps) {
  if (!toasts.length) return null;

  return (
    <div className="k-toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const duration = 8000; // 8 segundos visible
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [onDismiss]);

  const isKitchen = toast.type === "kitchen";

  return (
    <div
      className={`k-toast ${isKitchen ? "k-toast-kitchen" : "k-toast-whatsapp"}`}
      role="alert"
    >
      <div className="k-toast-icon">
        {isKitchen ? (
          <ChefHat size={22} color="#ffffff" aria-hidden />
        ) : (
          <MessageCircle size={22} color="#ffffff" aria-hidden />
        )}
      </div>

      <div className="k-toast-content">
        <div className="k-toast-header">
          <div className="k-toast-badge-wrap">
            <span className={`k-toast-badge ${isKitchen ? "kitchen" : "whatsapp"}`}>
              {isKitchen ? (
                <ChefHat size={13} aria-hidden />
              ) : (
                <MessageCircle size={13} aria-hidden />
              )}
              <span>{toast.badgeText || (isKitchen ? "Pedido a Cocina" : "WhatsApp Business")}</span>
            </span>
            <span className="k-toast-time">• Ahora</span>
          </div>

          <button
            type="button"
            className="k-toast-close"
            onClick={onDismiss}
            aria-label="Cerrar notificación"
          >
            <X size={15} />
          </button>
        </div>

        <h4 className="k-toast-title">{toast.title}</h4>

        <div className="k-toast-bubble">
          <p className="k-toast-subtitle">{toast.subtitle}</p>
        </div>

        {toast.meta && <div className="k-toast-meta">{toast.meta}</div>}

        {toast.onAction && (
          <div className="k-toast-footer">
            <button
              type="button"
              className="k-toast-action-btn"
              onClick={() => {
                toast.onAction?.();
                onDismiss();
              }}
            >
              <span>{toast.actionLabel || (isKitchen ? "Ver en Cocina" : "Abrir Conversación")}</span>
              <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        )}
      </div>

      <div className="k-toast-progress-track">
        <div
          className="k-toast-progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
