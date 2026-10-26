import { AnimatePresence, m } from 'motion/react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const Ctx = createContext<(msg: string) => void>(() => undefined);
export const useToast = (): ((msg: string) => void) => useContext(Ctx);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <AnimatePresence>
        {msg && (
          <m.div className="toast" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
            {msg}
          </m.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
};
