import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// claude.ai Artifact プレビュー時は :root に safe-area の余白が付くため、ヘッダー位置を合わせる
const PREVIEW = import.meta.env.MODE === 'artifact';

export function PageHeader({ title, back, action }: { title: string; back?: boolean | string; action?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className={`sticky z-20 flex items-center gap-2 border-b border-slate-200 bg-slate-50/90 px-3 pb-2 backdrop-blur ${PREVIEW ? 'top-[env(safe-area-inset-top,0px)] pt-2' : 'top-0 pt-[max(0.5rem,env(safe-area-inset-top))]'} dark:border-slate-800 dark:bg-slate-950/90`}>
      {back && (
        <button
          type="button"
          aria-label="戻る"
          className="btn-ghost -ml-2 px-2"
          onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
        >
          ‹ 戻る
        </button>
      )}
      <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-xl space-y-4 px-4 py-4">{children}</main>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="muted mt-2 space-y-3 text-sm">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, to }: { label: string; value: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="text-2xl font-bold">{value}</div>
      <div className="muted text-xs">{label}</div>
    </>
  );
  return to ? (
    <Link to={to} className="card block p-3">
      {body}
    </Link>
  ) : (
    <div className="card p-3">{body}</div>
  );
}

/** ネイティブ <dialog> を使った確認ダイアログ */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'OK',
  danger,
  onConfirm,
  onCancel,
  confirmDisabled,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="w-[min(92vw,28rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 backdrop:bg-black/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {open && (
        <div className="space-y-3 p-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <div className="space-y-2 text-sm">{children}</div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              キャンセル
            </button>
            <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={confirmDisabled}>
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

export function formatDate(iso?: string, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** <input type="datetime-local"> 用のローカル時刻文字列 */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

export function errorMessage(e: unknown): string {
  if (e instanceof DOMException && e.name === 'QuotaExceededError')
    return '端末の保存容量が不足しています。不要なデータを削除するか、空き容量を確保してください。';
  return e instanceof Error ? e.message : '不明なエラーが発生しました';
}
