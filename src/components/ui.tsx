import { useEffect, type ReactNode } from 'react';
import { useStore } from '../core/store';
import type { RiskResult } from '../core/types';
import { LEVEL_LABEL } from '../core/risk';

export function Card({ title, extra, children, className = '', pad = true, style }: {
  title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; pad?: boolean; style?: React.CSSProperties;
}) {
  return (
    <section className={`card ${className}`} style={style}>
      {title && (
        <header className="card-head">
          <h3>{title}</h3>
          {extra}
        </header>
      )}
      <div className={pad ? 'card-body' : 'card-body flush'}>{children}</div>
    </section>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle' | 'accent';
  size?: 'sm' | 'md';
};
export function Btn({ variant = 'subtle', size = 'md', className = '', ...rest }: BtnProps) {
  return <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest} />;
}

export function Field({ label, hint, children, inline }: { label: ReactNode; hint?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <label className={`field ${inline ? 'field-inline' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function NumberInput({ value, onChange, min, max, step, unit, disabled }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; disabled?: boolean;
}) {
  return (
    <span className="num-input">
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {unit && <em>{unit}</em>}
    </span>
  );
}

export function Select<T extends string>({ value, onChange, options, disabled }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean;
}) {
  return (
    <select className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[];
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 640, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: `min(${width}px, 94vw)` }}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function LevelBadge({ level }: { level: RiskResult['level'] }) {
  return <span className={`level-badge level-${level}`}>{LEVEL_LABEL[level]}风险</span>;
}

export function ScorePill({ score, level }: { score: number; level?: RiskResult['level'] }) {
  const color = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  return <span className={`score-pill score-${level ?? color}`}>{score.toFixed(0)}</span>;
}

export function EmptyHint({ icon = '🪟', title, desc, action }: { icon?: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty-hint">
      <div className="empty-icon">{icon}</div>
      <h4>{title}</h4>
      {desc && <p>{desc}</p>}
      {action}
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.kind === 'ok' ? '✓' : t.kind === 'err' ? '!' : 'ℹ'} {t.text}
        </div>
      ))}
    </div>
  );
}

export function compLabel(key: string): string {
  return (
    {
      reflection: '反射强度',
      green: '绿化邻近',
      floor: '楼层高度',
      see: '看穿/连廊',
      corner: '转角位置',
    } as Record<string, string>
  )[key] ?? key;
}
