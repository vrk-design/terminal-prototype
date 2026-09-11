import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CircleCheck, CircleMinus, CirclePlus, FlaskConical, X } from "lucide-react";
import "./Notifications.css";

type NotificationTone = "info" | "success" | "error";
type NotificationInput =
  | { kind: "standard"; tone: NotificationTone; title: string; message: string; detail: string }
  | { kind: "simulation"; message: string; detail: string };
type Notification = NotificationInput & { id: number };
type NotificationActions = {
  notify: (notification: NotificationInput) => void;
  placeOrder: (message: string) => void;
  createSimulatedPosition: (message: string) => void;
};

const NotificationContext = createContext<NotificationActions | null>(null);

export function Notifications({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismiss = useCallback((id: number) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback((notification: NotificationInput) => {
    const id = ++nextId.current;
    setNotifications((current) => [{ ...notification, id }, ...current].slice(0, 3));
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const placeOrder = useCallback((message: string) => {
    notify({ kind: "standard", tone: "info", title: "Order Placed", message, detail: "BroAccount" });
    window.setTimeout(() => notify({ kind: "standard", tone: "success", title: "Order Filled", message, detail: "BroAccount" }), 900);
  }, [notify]);

  const createSimulatedPosition = useCallback((message: string) => {
    notify({ kind: "simulation", message, detail: "Risk Profile · BroAccount" });
  }, [notify]);

  return (
    <NotificationContext.Provider value={{ notify, placeOrder, createSimulatedPosition }}>
      {children}
      <div className="notification-stack" aria-live="polite" aria-label="Notifications">
        {notifications.map((notification) => {
          const Icon = notification.kind === "simulation" ? FlaskConical : notification.tone === "success" ? CircleCheck : notification.tone === "error" ? CircleMinus : CirclePlus;
          const title = notification.kind === "simulation" ? "Simulated position was created" : notification.title;
          const tone = notification.kind === "simulation" ? "simulation" : notification.tone;
          return (
            <article className={`terminal-notification is-${tone}`} role="status" key={notification.id}>
              <div className="notification-title"><Icon aria-hidden="true" /><strong>{title}</strong></div>
              <p>{notification.message}</p>
              <span>{notification.detail}</span>
              <button type="button" aria-label={`Dismiss ${title}`} onClick={() => dismiss(notification.id)}><X aria-hidden="true" /></button>
            </article>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext)!;
}
