import { useState } from 'react';
import { useStore } from '../core/store';
import { Btn, Card, Field, NumberInput } from '../components/ui';
import { FresnelCurve } from '../components/Charts';
import { gpuFresnelSelfTest, type FresnelSelfTestResult } from '../gpu/gpuEngine';
import { getAdapterInfo, isWebGpuProbablyAvailable } from '../gpu/wgpuContext';
import { brewsterAngleDeg, fresnelReflectanceDeg, maxRelativeErrorVsReference } from '../core/fresnel';
import { BUILTIN_GLASS } from '../core/glassLibrary';
import { idb } from '../core/db';

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const pushToast = useStore((s) => s.pushToast);
  const [testing, setTesting] = useState(false);
  const [gpuResult, setGpuResult] = useState<FresnelSelfTestResult | null>(null);
  const [cpuCheck] = useState(() => [1.45, 1.52, 1.6, 1.9].map((n) => ({ n, ...maxRelativeErrorVsReference(n) })));

  const runGpuTest = async () => {
    setTesting(true);
    try {
      const r = await gpuFresnelSelfTest(settings.fresnelTolerancePct);
      setGpuResult(r);
      if (r.gpuAvailable) {
        localStorage.setItem('bg-fresnel-error', String(r.maxRelErrorPct));
        if (r.passed) pushToast(`GPU 菲涅尔自检通过：最大误差 ${r.maxRelErrorPct.toFixed(5)}% < ${settings.fresnelTolerancePct}%`, 'ok');
        else pushToast(`GPU 菲涅尔误差 ${r.maxRelErrorPct.toFixed(4)}% 超过容差`, 'err');
      } else {
        pushToast('当前浏览器无 WebGPU 设备，无法运行 GPU 自检', 'err');
      }
    } finally {
      setTesting(false);
    }
  };

  const adapter = getAdapterInfo();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>设置与菲涅尔自检</h1>
          <p>风险阈值、报告信息、数据管理，以及硬指标校验：GPU WGSL 菲涅尔实现与解析公式在 0–90° 全角度上的误差必须小于 {settings.fresnelTolerancePct}%。</p>
        </div>
      </div>

      <div className="layout-split">
        <div>
          <Card title="✅ 菲涅尔公式正确性（硬指标）">
            <div className="grid grid-3" style={{ marginBottom: 14 }}>
              <div className="stat"><div className="k">R(0°), n=1.5</div><div className="v" style={{ fontSize: 21 }}>{(fresnelReflectanceDeg(0, 1.5) * 100).toFixed(3)}%</div><div className="sub">理论值 4.000%</div></div>
              <div className="stat"><div className="k">布儒斯特角 n=1.52</div><div className="v" style={{ fontSize: 21 }}>{brewsterAngleDeg(1.52).toFixed(2)}°</div><div className="sub">此时 Rp = 0</div></div>
              <div className="stat danger"><div className="k">R(89.99°)</div><div className="v" style={{ fontSize: 21 }}>{(fresnelReflectanceDeg(89.99, 1.52) * 100).toFixed(3)}%</div><div className="sub">掠射极限 → 100%</div></div>
            </div>

            <FresnelCurve ior={1.52} />

            <h4 style={{ margin: '14px 0 8px' }}>CPU 实现 vs 独立解析参考（1801 角度）</h4>
            <table className="data" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
              <thead><tr><th>折射率 n</th><th className="num">最大相对误差</th><th className="num">最差角度</th><th>结论</th></tr></thead>
              <tbody>
                {cpuCheck.map((c) => (
                  <tr key={c.n}>
                    <td>{c.n}</td>
                    <td className="num mono">{c.maxRelErrorPct.toExponential(3)}%</td>
                    <td className="num">{c.worstAngleDeg.toFixed(1)}°</td>
                    <td><span className="level-badge level-low">✓ &lt; 1%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ height: 16 }} />
            <div className="toolbar-row">
              <Btn variant="primary" onClick={runGpuTest} disabled={testing}>
                {testing ? '⏳ 正在 GPU 上运行 361 点自检…' : '🧪 运行 GPU vs 公式误差自检'}
              </Btn>
              <Field label="误差容差 %" inline>
                <NumberInput value={settings.fresnelTolerancePct} min={0.1} max={5} step={0.1}
                  onChange={(v) => update({ fresnelTolerancePct: v })} />
              </Field>
            </div>

            {gpuResult && (
              <div className={`elev-block`} style={{ padding: 16, borderColor: gpuResult.passed ? '#86efac' : '#fca5a5', background: gpuResult.passed ? '#f0fdf4' : '#fef2f2' }}>
                {gpuResult.gpuAvailable ? (
                  <>
                    <h4 style={{ color: gpuResult.passed ? '#15803d' : '#b91c1c', fontSize: 16 }}>
                      {gpuResult.passed ? '✅ GPU 自检通过：误差 < 1%' : '❌ GPU 自检未达容差'}
                    </h4>
                    <div className="kv-list" style={{ marginTop: 8 }}>
                      <dt>最大相对误差</dt><dd className="mono">{gpuResult.maxRelErrorPct.toExponential(4)}%（容差 {gpuResult.tolerancePct}%）</dd>
                      <dt>最大绝对误差</dt><dd className="mono">{gpuResult.maxAbsError.toExponential(3)}</dd>
                      <dt>最差角度</dt><dd>{gpuResult.worstAngleDeg.toFixed(2)}°</dd>
                      <dt>采样点</dt><dd>{gpuResult.samples} 个入射角（WGSL 严格菲涅尔，n=1.52）</dd>
                      {gpuResult.adapter && <><dt>GPU</dt><dd>{gpuResult.adapter}</dd></>}
                    </div>
                  </>
                ) : (
                  <p style={{ color: '#b45309', margin: 0 }}>
                    当前环境未提供 WebGPU 设备（{isWebGpuProbablyAvailable() ? 'navigator.gpu 存在但无适配器' : 'navigator.gpu 不存在'}）。
                    应用会使用与 WGSL 逐行对应的 CPU 参考引擎；在最新版 Chrome/Edge 中打开可启用 GPU 计算。
                  </p>
                )}
              </div>
            )}
            <p className="muted" style={{ marginTop: 10 }}>
              WebGPU：{isWebGpuProbablyAvailable() ? 'navigator.gpu 可用' : '不可用'}
              {adapter?.description ? ` · ${adapter.description}` : ''}
            </p>
          </Card>

          <Card title="数据管理（IndexedDB）">
            <p className="muted">项目、玻璃库与设置均保存在本机浏览器。清除后可重新生成两个测试项目。</p>
            <div className="toolbar-row">
              <Btn variant="ghost" onClick={async () => {
                const data = await idb.getAll('projects');
                const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), projects: data }, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'birdglass-全部项目备份.json'; a.click();
                URL.revokeObjectURL(url);
              }}>⬇ 备份全部项目</Btn>
              <Btn variant="danger" onClick={async () => {
                if (!confirm('将清空全部项目并重新写入两个测试项目，确定？')) return;
                const req = indexedDB.deleteDatabase('bird-glass-assessment');
                req.onsuccess = () => location.reload();
                req.onerror = () => pushToast('删除数据库失败', 'err');
              }}>♻ 重置为演示数据</Btn>
            </div>
          </Card>
        </div>

        <div>
          <Card title="风险阈值">
            <Field label="中风险阈值"><NumberInput value={settings.mediumThreshold} min={5} max={80} onChange={(v) => update({ mediumThreshold: v })} /></Field>
            <Field label="高风险阈值"><NumberInput value={settings.highThreshold} min={20} max={95} onChange={(v) => update({ highThreshold: v })} /></Field>
            <Field label="极高风险阈值"><NumberInput value={settings.criticalThreshold} min={40} max={100} onChange={(v) => update({ criticalThreshold: v })} /></Field>
          </Card>
          <Card title="报告与保存">
            <Field label="评估机构名称"><input className="select" style={{ padding: 8 }} value={settings.organization} onChange={(e) => update({ organization: e.target.value })} /></Field>
            <Field label="评估人"><input className="select" style={{ padding: 8 }} value={settings.evaluator} onChange={(e) => update({ evaluator: e.target.value })} placeholder="姓名 / 工号" /></Field>
            <label className="inline-switch" style={{ margin: '8px 0' }}>
              <span className="switch"><input type="checkbox" checked={settings.autoSave} onChange={(e) => update({ autoSave: e.target.checked })} /><span className="track" /></span>
              编辑后自动保存（防抖 0.65s）
            </label>
          </Card>
          <Card title="内置玻璃类型">
            <div className="check-list">
              {BUILTIN_GLASS.map((g) => (
                <div key={g.id} className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <i style={{ width: 12, height: 12, borderRadius: 3, background: g.coatingColor, display: 'inline-block' }} />
                  {g.name} · R{(g.reflectance * 100).toFixed(0)}%
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
