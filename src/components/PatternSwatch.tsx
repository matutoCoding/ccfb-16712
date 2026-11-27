import type { GlassType } from '../core/types';

/** 用 CSS 渐变实时绘制点阵/条纹图案（尺寸按 m→px 缩放展示）。 */
export function PatternSwatch({ glass, height = 92 }: { glass: GlassType; height?: number }) {
  const p = glass.pattern;
  // 展示比例：1m = 220px，便于看清 50mm 间距
  const k = 220;
  let bg: React.CSSProperties = {
    background: `linear-gradient(135deg, ${glass.coatingColor} 0%, ${shade(glass.coatingColor, 18)} 100%)`,
  };
  if (p.type === 'dots') {
    const sx = Math.max(4, p.spacingXM * k);
    const sy = Math.max(4, p.spacingYM * k);
    const d = Math.max(3, p.sizeM * k);
    bg = {
      background: `radial-gradient(circle, ${p.color} ${d / 2}px, rgba(0,0,0,0) ${d / 2 + 0.6}px) 0 0 / ${sx}px ${sy}px, linear-gradient(135deg, ${glass.coatingColor}, ${shade(glass.coatingColor, 16)})`,
    };
  } else if (p.type === 'stripes') {
    const pitch = Math.max(6, p.spacingXM * k);
    const w = Math.max(2, p.sizeM * k);
    bg = {
      background: `repeating-linear-gradient(90deg, ${p.color} 0 ${w}px, rgba(0,0,0,0) ${w}px ${pitch}px), linear-gradient(180deg, ${glass.coatingColor}, ${shade(glass.coatingColor, -10)})`,
    };
  }
  return (
    <div className="glass-swatch" style={{ height, ...bg }}>
      <div className="shine" />
    </div>
  );
}

export function shade(hex: string, percent: number): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  return `rgb(${r},${g},${b})`;
}
