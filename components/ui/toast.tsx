"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type T = {
  id: number;
  title: string;
  body?: string;
  tone?: "ok" | "info";
  ms?: number;
};
const Ctx = createContext<{ show(t: Omit<T, "id">): void }>({ show() {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const show = useCallback((t: Omit<T, "id">) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { ...t, id }]);
    setTimeout(
      () => setItems((x) => x.filter((i) => i.id !== id)),
      t.ms ?? 3200,
    );
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed right-5 top-[calc(var(--demo-h,0px)+1.25rem)] z-50 flex w-[340px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto animate-[toastIn_var(--t-slow)_var(--e-spring)_both] rounded-2xl bg-white p-4 text-[13.5px] shadow-[0_30px_60px_-24px_#1c0d2299] ring-1 ring-line"
          >
            <b>{t.title}</b>
            {t.body && <p className="mt-1 text-xs text-ink-3">{t.body}</p>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
