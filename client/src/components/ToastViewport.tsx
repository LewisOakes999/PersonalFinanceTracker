import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts, type ToastItem } from "../lib/toast";

const STYLES: Record<ToastItem["type"], string> = {
  success: "border-[#34e0c4]/50 text-[#34e0c4]",
  error: "border-[#ff6b8a]/50 text-[#ff9bae]",
  info: "border-[#64d2ff]/50 text-[#64d2ff]",
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-[min(360px,90vw)] flex-col gap-2">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`glass rounded-xl border px-4 py-3 text-left text-sm text-glass ${STYLES[t.type]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
