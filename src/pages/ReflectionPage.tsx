import { useMemo, useState } from 'react';
import { useCurrentProject, useLatestSnapshot } from '../components/useCurrent';
import { useStore } from '../core/store';
import { executeBaseline } from '../core/actions';
import { Btn, Card, EmptyHint, Field, NumberInput } from '../components/ui';
import { CompositionBar, FresnelCurve } from '../components/Charts';
import type { SurfaceReflectionStat } from '../core/types';

export default function ReflectionPage() {
  const project = useCurrentProject();
  const snap = useLatestSnapshot(project);
  const glass = useStore((s) => s.glass);
  const updateProject = useStore((s) => s.updateProject);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statMap = useMemo(() => new Map(snap?.reflectionStats.map((x) => [x.surfaceId, x])), [snap]);
  if (!project) return <div className="page"><EmptyHint title="请先选择项目" /></div>;

  const bird = project.bird;
  const setBird = (patch: Partial<typeof bird>) =>
    updateProject(project.id, (p) => { Object.assign(p.bird, patch); });

  const run = async () => {
    setRunning(true);
    try {
      await executeBaseline(project.id);
      useStore.getState().pushToast('反射统计完成（GPU 计算 + 逐面归约）', 'ok');
    } catch (e) {
      useStore.getState().pushToast(`分析失败：${(e as Error).message}`, 'err');
    } finally {
      setRunning(false);
    }
  };

  const selected = project.surfaces.find((s) => s.id === selectedId);
  const selectedStat = selectedId ? statMap.get(selectedId) : undefined;
  const selectedGlass = glass.find((g) => g.id === (selected?.retrofitGlassTypeId ?? selected?.glassTypeId));

  const avgF = snap ? snap.reflectionStats.reduce((a, s) => a + s.avgFresnel, 0) / Math.max(1, snap.reflectionStats.length) : 0;
  const avgHab = snap ? snap.reflectionStats.reduce((a, s) => a + s.habitatReflection, 0) / Math.max(1, snap.reflectionStats.length) : 0;
  const seeCnt = snap ? snap.reflectionStats.filter((s) => s.seeThrough > 0.5).length : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>反射分析</h1>
          <p>按鸟的飞行高度层与来袭方向，在 WebGPU 计算管线中对每块玻璃采样：严格菲涅尔方程求反射率，反射光线与树木/水体/建筑求交，统计玻璃里映出天空、树木还是环境，并计算可看穿度。</p>
        </div>
        <div className="actions">
          <Btn variant="primary" onClick={run} disabled={running || project.surfaces.length === 0}>
            {running ? '⏳ GPU 计算中…' : '▶ 运行 GPU 反射分析'}
          </Btn>
        </div>
      </div>

      <Card title="鸟击工况参数">
        <div className="grid grid-4">
          <Field label="最低飞行高度 (m)"><NumberInput value={bird.minHeightM} min={0.5} max={200} step={0.5} onChange={(v) => setBird({ minHeightM: v })} /></Field>
          <Field label="最高飞行高度 (m)"><NumberInput value={bird.maxHeightM} min={1} max={300} step={1} onChange={(v) => setBird({ maxHeightM: v })} /></Field>
          <Field label="高度采样层数"><NumberInput value={bird.heightSteps} min={1} max={20} step={1} onChange={(v) => setBird({ heightSteps: Math.round(v) })} /></Field>
          <Field label="观察距离 (m)"><NumberInput value={bird.observerDistanceM} min={5} max={120} step={1} onChange={(v) => setBird({ observerDistanceM: v })} /></Field>
          <Field label="主导来袭方位 (°，0=北 90=东)"><NumberInput value={bird.headingDeg} min={0} max={360} step={5} onChange={(v) => setBird({ headingDeg: v })} /></Field>
          <Field label="方向扫掠范围 (°)"><NumberInput value={bird.headingSpreadDeg} min={0} max={180} step={5} onChange={(v) => setBird({ headingSpreadDeg: v })} /></Field>
          <Field label="方向采样数"><NumberInput value={bird.headingSteps} min={1} max={15} step={2} onChange={(v) => setBird({ headingSteps: Math.round(v) })} /></Field>
          <Field label="采样规模预估">
            <div style={{ paddingTop: 7, fontWeight: 700, color: 'var(--primary-dark)' }}>
              ≈ {estimateSamples(project.surfaces.length, bird)} 条光线
            </div>
          </Field>
        </div>
      </Card>

      {!snap ? (
        <Card><EmptyHint icon="🌤️" title="尚未运行反射分析" desc="设置鸟的高度与方向后点击右上角按钮。计算包括逐样本菲涅尔反射、环境光线分类与逐面统计归约。" action={<Btn variant="primary" onClick={run} disabled={running}>▶ 立即运行</Btn>} /></Card>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat accent"><div className="k">计算引擎</div><div className="v" style={{ fontSize: 18, paddingTop: 6 }}>{snap.engine === 'webgpu' ? '🟢 WebGPU' : '🟡 CPU 参考'}</div><div className="sub">{snap.reflectionStats.length} 块玻璃 · 快照 {new Date(snap.createdAt).toLocaleTimeString('zh-CN')}</div></div>
            <div className="stat"><div className="k">平均法向/视角菲涅尔 R</div><div className="v">{(avgF * 100).toFixed(1)}<small>%</small></div></div>
            <div className="stat warn"><div className="k">平均栖息地倒影占比</div><div className="v">{(avgHab * 100).toFixed(0)}<small>%</small></div></div>
            <div className="stat danger"><div className="k">高看穿度玻璃</div><div className="v">{seeCnt}<small>块</small></div></div>
          </div>

          <div className="layout-split">
            <Card title={`每块玻璃的反射统计（${snap.reflectionStats.length}）`} pad={false}>
              <div className="table-wrap" style={{ maxHeight: 560 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>玻璃</th>
                      <th>反射所见</th>
                      <th className="num">平均R</th>
                      <th className="num">最大R</th>
                      <th className="num">栖息地</th>
                      <th className="num">看穿</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.reflectionStats.map((st) => {
                      const s = project.surfaces.find((x) => x.id === st.surfaceId);
                      if (!s) return null;
                      return (
                        <tr key={st.surfaceId} className={selectedId === st.surfaceId ? 'selected' : ''} onClick={() => setSelectedId(st.surfaceId)}>
                          <td style={{ maxWidth: 210 }}><div style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div><div className="muted">{st.sampleCount} 样本</div></td>
                          <td style={{ minWidth: 150 }}><CompositionBar stat={st} /></td>
                          <td className="num">{(st.avgFresnel * 100).toFixed(1)}%</td>
                          <td className="num" style={{ color: 'var(--danger)', fontWeight: 700 }}>{(st.maxFresnel * 100).toFixed(0)}%</td>
                          <td className="num">{(st.habitatReflection * 100).toFixed(0)}%</td>
                          <td className="num" style={{ fontWeight: st.seeThrough > 0.5 ? 800 : 500, color: st.seeThrough > 0.5 ? 'var(--danger)' : undefined }}>{(st.seeThrough * 100).toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div>
              {selected && selectedStat ? (
                <Card title="单玻璃鸟视角解析">
                  <h4 style={{ fontSize: 15 }}>{selected.name}</h4>
                  <CompositionBar stat={selectedStat} />
                  <div style={{ height: 10 }} />
                  <div className="kv-list" style={{ marginBottom: 10 }}>
                    <dt>平均菲涅尔 R</dt><dd>{(selectedStat.avgFresnel * 100).toFixed(2)}%</dd>
                    <dt>掠射最大 R</dt><dd style={{ color: 'var(--danger)' }}>{(selectedStat.maxFresnel * 100).toFixed(2)}%（趋近 100%）</dd>
                    <dt>反射强度指数</dt><dd>{selectedStat.reflectionIntensity.toFixed(3)}</dd>
                    <dt>可看穿度</dt><dd>{(selectedStat.seeThrough * 100).toFixed(0)}%</dd>
                  </div>
                  <FresnelCurve ior={selectedGlass?.ior ?? 1.52} size="sm" />
                  <p className="muted">该玻璃 n={selectedGlass?.ior.toFixed(3)}（{selectedGlass?.name ?? '未知'}）。视角越倾斜，菲涅尔反射越强，天空/树木倒影越逼真。</p>
                </Card>
              ) : (
                <Card><EmptyHint icon="👆" title="选择一块玻璃" desc="点击左侧表格行，查看该玻璃的反射构成与菲涅尔曲线。" /></Card>
              )}
              <Card title="判定原理">
                <ul className="muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
                  <li>每个「玻璃采样点 × 高度 × 方向」生成一条鸟视线。</li>
                  <li>入射角 θ 代入严格菲涅尔方程得到 R（非近似）。</li>
                  <li>反射光线与树冠球、水面、建筑 AABB、地面求交。</li>
                  <li>连廊/转角等人工标记计入可看穿度基准。</li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function estimateSamples(surfaceCount: number, bird: { heightSteps: number; headingSteps: number }): string {
  // 与 buildSamples 相同的网格估计（均值 8 点/面）
  const n = surfaceCount * 8 * bird.heightSteps * bird.headingSteps;
  return n.toLocaleString('zh-CN');
}
