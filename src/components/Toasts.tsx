import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export default function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div key={toast.id} className={`toast is-${toast.kind}`}>
            <Icon size={15} className="toast__icon" />
            <span className="toast__text">{toast.message}</span>
            <button
              className="icon-btn"
              style={{ width: 20, height: 20, color: 'var(--text-faint)' }}
              onClick={() => dismiss(toast.id)}
              aria-label="关闭提示"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
