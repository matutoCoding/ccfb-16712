import { useMemo } from 'react';
import type { Project, SurfaceReflectionStat } from '../core/types';
import { buildElevations } from '../core/elevation';
import { heatColor } from '../core/geom';
import { fresnelReflectanceDeg, normalReflectanceFromIor } from '../core/fresnel';

export function ElevationChart({ project, scoreMap, selectedId, onSelect }: {
  project: Project;
  scoreMap?: Map<string, number>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const elevations = useMemo(() => buildElevations(project), [project]);
  if (!elevations.length) return <div className="muted">暂无可绘制的玻璃立面</div>;

  return (
    <div className="elev-grid">
      {elevations.map((e) => (
        <div className="elev-block" key={e.key}>
          <div className="elev-title">{e.label}</div>
          <svg
            className="elev-svg"
            viewBox={`-1 -1 ${e.widthM + 2} ${e.heightM + 2}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
          >
            {/* 地面线 */}
            <line x1={-1} y1={e.heightM + 0.02} x2={e.widthM + 1} y2={e.heightM + 0.02} stroke="#64748b" strokeWidth={0.12} />
            <g transform={`translate(0,${e.heightM}) scale(1,-1)`}>
              {e.rects.map((r) => {
                const score = scoreMap?.get(r.id);
                const [rr, gg, bb] = heatColor((score ?? 0) / 100);
                const selected = selectedId === r.id;
                return (
                  <rect
                    key={r.id}
                    x={r.x + 0.03}
                    y={r.y + 0.03}
                    width={Math.max(0.1, r.w - 0.06)}
                    height={Math.max(0.1, r.h - 0.06)}
                    fill={score == null ? '#9fc3d8' : `rgb(${rr},${gg},${bb})`}
                    stroke={selected ? '#f59e0b' : 'rgba(15,35,55,0.55)'}
                    strokeWidth={selected ? 0.18 : 0.05}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: onSelect ? 'pointer' : 'default' }}
                    onClick={() => onSelect?.(r.id)}
                  >
                    <title>{`${r.name}${score != null ? ` · 风险 ${score.toFixed(0)}` : ''}`}</title>
                  </rect>
                );
              })}
            </g>
          </svg>
        </div>
      ))}
    </div>
  );
}

export function HeatLegend() {
  return (
    <div className="heat-legend">
      <span>低</span>
      <div className="heat-bar" />
      <span>高</span>
      <span className="muted" style={{ marginLeft: 8 }}>0–35 低 · 35–60 中 · 60–80 高 · ≥80 极高</span>
    </div>
  );
}

export function FresnelCurve({ ior, size = 'md' }: { ior: number; size?: 'sm' | 'md' }) {
  const W = size === 'sm' ? 260 : 360;
  const H = size === 'sm' ? 130 : 180;
  const pad = { l: 38, r: 12, t: 14, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const pts: string[] = [];
  for (let a = 0; a <= 90; a += 1) {
    const r = fresnelReflectanceDeg(a, ior);
    const x = pad.l + (a / 90) * iw;
    const y = pad.t + ih - r * ih;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const r0 = normalReflectanceFromIor(ior);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fresnel-svg">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih - t * ih} y2={pad.t + ih - t * ih} stroke="#e2e8f0" />
          <text x={pad.l - 6} y={pad.t + ih - t * ih + 3} textAnchor="end" fontSize={9} fill="#64748b">{t.toFixed(2)}</text>
        </g>
      ))}
      {[0, 15, 30, 45, 60, 75, 90].map((a) => (
        <text key={a} x={pad.l + (a / 90) * iw} y={H - 8} textAnchor="middle" fontSize={9} fill="#64748b">{a}°</text>
      ))}
      <polyline points={pts.join(' ')} fill="none" stroke="#2563eb" strokeWidth={2.2} />
      {/* 法向 R0 点 */}
      <circle cx={pad.l} cy={pad.t + ih - r0 * ih} r={3.5} fill="#0ea5e9" />
      <text x={pad.l + 6} y={pad.t + ih - r0 * ih - 6} fontSize={10} fill="#0369a1">R(0°)={(r0 * 100).toFixed(2)}%</text>
      {/* 掠射极限 */}
      <circle cx={pad.l + iw} cy={pad.t} r={3.5} fill="#dc2626" />
      <text x={pad.l + iw - 4} y={pad.t + 12} textAnchor="end" fontSize={10} fill="#b91c1c">R(90°)→100%</text>
      <text x={pad.l + iw / 2} y={H - 0} textAnchor="middle" fontSize={10} fill="#475569">入射角 θ（法线→视线）</text>
    </svg>
  );
}

export function CompositionBar({ stat }: { stat: SurfaceReflectionStat }) {
  const segs = [
    { label: '天空', value: stat.skyReflection, color: '#60a5fa' },
    { label: '树木', value: stat.treeReflection, color: '#16a34a' },
    { label: '水体', value: stat.waterReflection, color: '#0891b2' },
    { label: '建筑/地面', value: Math.max(0, 1 - stat.skyReflection - stat.treeReflection - stat.waterReflection), color: '#94a3b8' },
  ];
  return (
    <div>
      <div className="comp-bar">
        {segs.map((s) => (
          <div key={s.label} style={{ width: `${Math.max(0, s.value) * 100}%`, background: s.color }} title={`${s.label} ${(s.value * 100).toFixed(0)}%`} />
        ))}
      </div>
      <div className="comp-legend">
        {segs.map((s) => (
          <span key={s.label}><i style={{ background: s.color }} />{s.label} {(s.value * 100).toFixed(0)}%</span>
        ))}
      </div>
    </div>
  );
}
