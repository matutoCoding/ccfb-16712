import { useMemo, useState } from 'react';
import { useCurrentProject, useLatestSnapshot } from '../components/useCurrent';
import { useStore } from '../core/store';
import { executeBaseline } from '../core/actions';
import { scoreSurface, LEVEL_LABEL, DEFAULT_WEIGHTS } from '../core/risk';
import type { RiskResult, RiskWeights } from '../core/types';
import { Viewport } from '../components/Viewport';
import { ElevationChart, HeatLegend } from '../components/Charts';
import { Btn, Card, EmptyHint, Field, LevelBadge, ScorePill, Segmented } from '../components/ui';

export default function RiskPage() {
  const project = useCurrentProject();
  const snap = useLatestSnapshot(project);
  const glass = useStore((s) => s.glass);
  const settings = useStore((s) => s.settings);
  const updateProject = useStore((s) => s.updateProject);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'heatmap' | 'material'>('heatmap');
  const [filter, setFilter] = useState<'all' | 'high'>('all');

  // 权重变化时用同一套评分模型即时重算（统计值不变）
  const risks = useMemo<RiskResult[]>(() => {
    if (!project || !snap) return [];
    const gmap = new Map(glass.map((g) => [g.id, g]));
    return snap.reflectionStats.map((stat) => {
      const s = project.surfaces.find((x) => x.id === stat.surfaceId)!;
      return scoreSurface({ surface: s, stat, glass: gmap.get(s.glassTypeId), project, settings, weights: project.weights });
    });
  }, [project, snap, glass, settings]);

  const riskMap = useMemo(() => new Map(risks.map((r) => [r.surfaceId, r.score])), [risks]);
  const riskById = useMemo(() => new Map(risks.map((r) => [r.surfaceId, r])), [risks]);

  if (!project) return <div className="page"><EmptyHint title="请先选择项目" /></div>;

  const run = async () => {
    setRunning(true);
    try {
      await executeBaseline(project.id);
    } finally {
      setRunning(false);
    }
  };

  const setWeight = (k: keyof RiskWeights, v: number) =>
    updateProject(project.id, (p) => { p.weights[k] = v; });

  const counts = {
    critical: risks.filter((r) => r.level === 'critical').length,
    high: risks.filter((r) => r.level === 'high').length,
    medium: risks.filter((r) => r.level === 'medium').length,
    low: risks.filter((r) => r.level === 'low').length,
  };
  const highArea = project.surfaces
    .filter((s) => (riskById.get(s.id)?.score ?? 0) >= settings.highThreshold)
    .reduce((a, s) => a + s.areaM2, 0);
  const avg = risks.length ? risks.reduce((a, r) => a + r.score, 0) / risks.length : 0;

  const rows = project.surfaces
    .map((s) => ({ s, r: riskById.get(s.id) }))
    .filter((x): x is { s: typeof x.s; r: RiskResult } => !!x.r)
    .filter((x) => filter === 'all' || x.r.score >= settings.highThreshold)
    .sort((a, b) => b.r.score - a.r.score);

  const selected = project.surfaces.find((s) => s.id === selectedId);
  const selectedRisk = selectedId ? riskById.get(selectedId) : undefined;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>风险评估</h1>
          <p>综合菲涅尔加权反射强度、周边绿化距离、鸟撞楼层曲线、可看穿度与转角因子，得到每块玻璃 0–100 风险分，并在三维立面与正交立面上生成热力图。</p>
        </div>
        <div className="actions">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部' }, { value: 'high', label: '仅高风险' }]} />
          <Btn onClick={run} disabled={running}>{running ? '⏳ 计算中…' : '↻ 重新运行 GPU 分析'}</Btn>
          <Btn variant="primary" onClick={() => (window.location.hash = '#/measures')}>生成改造方案 →</Btn>
        </div>
      </div>

      {!snap ? (
        <Card><EmptyHint icon="🔥" title="还没有可评估的反射结果" desc="先运行一次 GPU 反射分析以生成统计，再计算风险热力图。" action={<Btn variant="primary" onClick={run} disabled={running}>▶ 运行分析</Btn>} /></Card>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat danger"><div className="k">极高 / 高风险玻璃</div><div className="v">{counts.critical + counts.high}<small>块</small></div><div className="sub">极高 {counts.critical} · 高 {counts.high}</div></div>
            <div className="stat warn"><div className="k">中风险</div><div className="v">{counts.medium}<small>块</small></div></div>
            <div className="stat accent"><div className="k">平均风险分</div><div className="v">{avg.toFixed(1)}</div></div>
            <div className="stat"><div className="k">高风险玻璃面积</div><div className="v">{highArea.toFixed(0)}<small>㎡</small></div></div>
          </div>

          <div className="layout-split">
            <div>
              <div className="viewport-toolbar" style={{ position: 'relative', marginBottom: 10 }}>
                <Segmented value={mode} onChange={setMode} options={[{ value: 'heatmap', label: '🔥 风险热力图' }, { value: 'material', label: '🧊 玻璃材质' }]} />
                <span className="spacer" />
                <HeatLegend />
              </div>
              <Viewport project={project} glass={glass} mode={mode} riskMap={riskMap} selectedId={selectedId} onPick={setSelectedId} height={480} />

              <Card title="正交风险立面图（报告同款）" style={{ marginTop: 18 }} extra={<HeatLegend />}>
                <ElevationChart project={project} scoreMap={riskMap} selectedId={selectedId} onSelect={setSelectedId} />
              </Card>
            </div>

            <div>
              <Card title="风险权重（本项目）">
                {(Object.keys(DEFAULT_WEIGHTS) as (keyof RiskWeights)[]).map((k) => (
                  <Field key={k} label={`${weightLabel(k)} · ${project.weights[k].toFixed(2)}`}>
                    <input type="range" min={0} max={0.6} step={0.05} value={project.weights[k]} onChange={(e) => setWeight(k, parseFloat(e.target.value))} />
                  </Field>
                ))}
                <Btn size="sm" onClick={() => updateProject(project.id, (p) => { p.weights = { ...DEFAULT_WEIGHTS }; })}>恢复默认权重</Btn>
              </Card>

              {selected && selectedRisk ? (
                <Card title={selected.name}>
                  <div className="toolbar-row">
                    <ScorePill score={selectedRisk.score} level={selectedRisk.level} />
                    <LevelBadge level={selectedRisk.level} />
                    <span className="spacer" />
                    <span className="muted">绿化 {selectedRisk.nearestGreenDistanceM}m</span>
                  </div>
                  <FactorRow label="反射强度" v={selectedRisk.reflectionScore} color="#2563eb" />
                  <FactorRow label="绿化邻近" v={selectedRisk.greenScore} color="#16a34a" />
                  <FactorRow label="楼层高度" v={selectedRisk.floorScore} color="#0ea5e9" />
                  <FactorRow label="看穿/连廊" v={selectedRisk.seeThroughScore} color="#dc2626" />
                  <FactorRow label="转角" v={selectedRisk.cornerScore} color="#f97316" />
                  {selectedRisk.mitigationPct > 0 && <p className="muted" style={{ color: 'var(--ok)', fontWeight: 700 }}>图案威慑已削减 {selectedRisk.mitigationPct}% 风险</p>}
                </Card>
              ) : (
                <Card><EmptyHint icon="👆" title="选择玻璃查看风险因子" desc="点击视口、立面图或下方表格。" /></Card>
              )}
            </div>
          </div>

          <Card title={`玻璃风险排名（${rows.length}）`} pad={false} style={{ marginTop: 18 }}>
            <div className="table-wrap" style={{ maxHeight: 460 }}>
              <table className="data">
                <thead><tr><th>#</th><th>玻璃</th><th>等级</th><th className="num">风险分</th><th className="num">反射</th><th className="num">绿化m</th><th className="num">看穿</th><th>因子</th></tr></thead>
                <tbody>
                  {rows.map(({ s, r }, i) => (
                    <tr key={s.id} className={selectedId === s.id ? 'selected' : ''} onClick={() => setSelectedId(s.id)}>
                      <td className="muted">{i + 1}</td>
                      <td style={{ maxWidth: 240 }}><div style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div></td>
                      <td><LevelBadge level={r.level} /></td>
                      <td className="num"><ScorePill score={r.score} level={r.level} /></td>
                      <td className="num">{r.reflectionScore}</td>
                      <td className="num">{r.nearestGreenDistanceM}</td>
                      <td className="num">{r.seeThroughScore}</td>
                      <td style={{ minWidth: 130 }}>
                        <div className="progress-line"><i style={{ width: `${r.score}%`, background: scoreColor(r.score) }} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function FactorRow({ label, v }: { label: string; v: number; color?: string }) {
  return (
    <div className="factor-row">
      <span className="muted">{label}</span>
      <div className="factor-track"><div className="factor-fill" style={{ width: `${v}%` }} /></div>
      <span className="v">{Math.round(v)}</span>
    </div>
  );
}

function weightLabel(k: keyof RiskWeights): string {
  return { reflection: '反射强度', greenProximity: '绿化邻近', floorHeight: '楼层高度', seeThrough: '看穿/连廊', corner: '转角' }[k];
}
function scoreColor(s: number) {
  const c = s >= 80 ? '#dc2626' : s >= 60 ? '#ea580c' : s >= 35 ? '#ca8a04' : '#2563eb';
  return c;
}

void LEVEL_LABEL;
