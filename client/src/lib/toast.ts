// A tiny framework-agnostic toast bus. Call `toast.success/error/info(message)`
// from anywhere (components or the API client); the ToastViewport renders them.
export type ToastType = "success" | "error" | "info";
export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const l of listeners) l(items);
}

export function subscribeToasts(fn: (items: ToastItem[]) => void): () => void {
  listeners.add(fn);
  fn(items);
  return () => {
    listeners.delete(fn);
  };
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(message: string, type: ToastType) {
  const id = nextId++;
  items = [...items, { id, message, type }];
  emit();
  setTimeout(() => dismissToast(id), 4500);
}

export const toast = {
  success: (m: string) => push(m, "success"),
  error: (m: string) => push(m, "error"),
  info: (m: string) => push(m, "info"),
};
