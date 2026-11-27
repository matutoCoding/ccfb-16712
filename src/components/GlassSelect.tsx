import { useStore } from '../core/store';

export function GlassSelect({ value, onChange, allowEmpty, emptyLabel, disabled }: {
  value?: string | null;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const glass = useStore((s) => s.glass);
  return (
    <select className="select" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel ?? '— 不指定 —'}</option>}
      {glass.map((g) => (
        <option key={g.id} value={g.id}>
          {g.birdSafe ? '🦅 ' : ''}{g.name}（R {(g.reflectance * 100).toFixed(0)}%）
        </option>
      ))}
    </select>
  );
}
