import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentProject, useLatestSnapshot } from '../components/useCurrent';
import { useStore } from '../core/store';
import { executeBaseline, executeRetrofit } from '../core/actions';
import { scoreSurface } from '../core/risk';
import type { RiskResult } from '../core/types';
import { Btn, Card, EmptyHint, LevelBadge, Modal, ScorePill } from '../components/ui';
import { GlassSelect } from '../components/GlassSelect';
import { ElevationChart } from '../components/Charts';
import { buildReportHtml, downloadHtml } from '../core/report';

export default function MeasuresPage() {
  const project = useCurrentProject();
  const snap = useLatestSnapshot(project);
  const glass = useStore((s) => s.glass);
  const settings = useStore((s) => s.settings);
  const updateProject = useStore((s) => s.updateProject);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetGlass, setTargetGlass] = useState('glass-frit-dots-50');
  const [after, setAfter] = useState<RiskResult[] | null>(snap?.retrofitRisks ?? null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const before = useMemo<RiskResult[]>(() => {
    if (!project || !snap) return [];
    const gm = new Map(glass.map((g) => [g.id, g]));
    return snap.reflectionStats.map((stat) => {
      const s = project.surfaces.find((x) => x.id === stat.surfaceId)!;
      // 改造前基线必须使用原始玻璃，不能用 retrofitGlassTypeId
      return scoreSurface({ surface: s, stat, glass: gm.get(s.glassTypeId), project, settings, weights: project.weights });
    });
  }, [project, snap, glass, settings]);

  const beforeMap = useMemo(() => new Map(before.map((r) => [r.surfaceId, r.score])), [before]);
  const afterMap = useMemo(() => (after ? new Map(after.map((r) => [r.surfaceId, r.score])) : undefined), [after]);

  const highIds = useMemo(() => before.filter((r) => r.score >= settings.highThreshold).map((r) => r.surfaceId), [before, settings.highThreshold]);

  useEffect(() => {
    if (snap) setSelected(new Set(highIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.id]);

  if (!project) return <div className="page"><EmptyHint title="请先选择项目" /></div>;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const applyToSelected = async (gid: string) => {
    updateProject(project.id, (p) => {
      p.surfaces.forEach((s) => {
        if (selected.has(s.id)) s.retrofitGlassTypeId = gid;
      });
    }, true);
    useStore.getState().pushToast(`已为 ${selected.size} 块玻璃指定改造型号，正在 GPU 复算…`, 'ok');
    await recompute();
  };

  const clearRetrofit = () => {
    updateProject(project.id, (p) => {
      p.surfaces.forEach((s) => { if (selected.has(s.id)) s.retrofitGlassTypeId = null; });
    }, true);
    setAfter(null);
  };

  const recompute = async () => {
    setBusy(true);
    try {
      // 确保有基线快照
      let s0 = useStore.getState().projects.find((p) => p.id === project.id)?.latestSnapshotId;
      if (!s0) await executeBaseline(project.id);
      const res = await executeRetrofit(project.id);
      setAfter(res.risks);
      updateProject(project.id, (p) => {
        const sn = p.snapshots.find((x) => x.id === p.latestSnapshotId);
        if (sn) sn.retrofitRisks = res.risks;
      }, true);
    } catch (e) {
      useStore.getState().pushToast(`复算失败：${(e as Error).message}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  const retrofitSurfaces = project.surfaces.filter((s) => s.retrofitGlassTypeId);
  const area = retrofitSurfaces.reduce((a, s) => a + s.areaM2, 0);
  const avgB = before.length ? before.reduce((a, r) => a + r.score, 0) / before.length : 0;
  const avgA = after?.length ? after.reduce((a, r) => a + r.score, 0) / after.length : null;
  const highA = after?.filter((r) => r.score >= settings.highThreshold).length;
  const totalDrop = after ? before.reduce((sum, r) => sum + Math.max(0, r.score - (after.find((x) => x.surfaceId === r.surfaceId)?.score ?? r.score)), 0) : 0;

  const openReport = () => setReportOpen(true);
  const fresnelErr = parseFloat(localStorage.getItem('bg-fresnel-error') ?? 'NaN');
  const reportHtml = reportOpen
    ? buildReportHtml({
        project,
        glass,
        settings,
        engine: snap?.engine ?? 'cpu-reference',
        before,
        after: after ?? undefined,
        sampleCount: undefined,
        fresnelErrorPct: Number.isFinite(fresnelErr) ? fresnelErr : null,
      })
    : '';

  const downloadReportFile = () => {
    const html = buildReportHtml({
      project, glass, settings, engine: snap?.engine ?? 'cpu-reference', before, after: after ?? undefined,
      fresnelErrorPct: Number.isFinite(fresnelErr) ? fresnelErr : null,
    });
    downloadHtml(`${project.name}-防鸟撞评估报告.html`, html);
    useStore.getState().pushToast('评估报告已导出（HTML，可打印为 PDF）', 'ok');
  };

  if (!snap) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>措施方案</h1><p>为高风险玻璃更换防鸟撞点阵/条纹玻璃，GPU 复算前后风险，统计改造面积并导出带风险立面图的报告。</p></div></div>
        <Card><EmptyHint icon="🛠️" title="请先运行风险分析" desc="需要反射统计与基线风险后才能制定改造方案。" action={<Btn variant="primary" onClick={async () => { await executeBaseline(project.id); }}>▶ 运行分析</Btn>} /></Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>措施方案与前后对比</h1>
          <p>勾选高风险玻璃并批量替换为防鸟撞玻璃；图案间距越密，鸟类可识别度越高、残余风险越低。所有前后风险均由同一 GPU 计算管线复算。</p>
        </div>
        <div className="actions">
          <Btn onClick={recompute} disabled={busy}>{busy ? '⏳ GPU 复算中…' : '↻ GPU 前后复算'}</Btn>
          <Btn variant="primary" onClick={openReport}>📄 预览 / 导出评估报告</Btn>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat accent"><div className="k">已拟定改造</div><div className="v">{retrofitSurfaces.length}<small>块</small></div></div>
        <div className="stat"><div className="k">改造面积</div><div className="v">{area.toFixed(0)}<small>㎡</small></div></div>
        <div className="stat warn"><div className="k">平均风险</div><div className="v">{avgB.toFixed(0)}{avgA != null && <><small style={{ textDecoration: 'line-through', opacity: 0.55 }}> {avgB.toFixed(0)}</small><small className="delta-down"> → {avgA.toFixed(0)}</small></>}</div></div>
        <div className="stat danger"><div className="k">高风险块</div><div className="v">{highIds.length}{highA != null && <small className="delta-down"> → {highA}</small>}</div><div className="sub">累计风险分下降 {totalDrop.toFixed(0)}</div></div>
      </div>

      <div className="layout-split rev">
        <Card title="批量改造">
          <div className="field">
            <span className="field-label">替换为防鸟玻璃型号</span>
            <GlassSelect value={targetGlass} onChange={setTargetGlass} />
          </div>
          <div className="toolbar-row">
            <Btn variant="primary" disabled={selected.size === 0} onClick={() => applyToSelected(targetGlass)}>应用到选中的 {selected.size} 块</Btn>
            <Btn onClick={() => setSelected(new Set(highIds))}>全选高风险（{highIds.length}）</Btn>
            <Btn onClick={() => setSelected(new Set(project.surfaces.map((s) => s.id)))}>全选所有</Btn>
            <Btn variant="ghost" onClick={() => setSelected(new Set())}>清空选择</Btn>
          </div>
          <Btn variant="danger" size="sm" onClick={clearRetrofit}>移除选中玻璃的改造指定</Btn>

          <h4 style={{ margin: '18px 0 8px' }}>改造型号说明</h4>
          {(() => {
            const g = glass.find((x) => x.id === targetGlass);
            if (!g) return null;
            return (
              <div className="elev-block" style={{ padding: 12 }}>
                <strong>🦅 {g.name}</strong>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  反射率 {(g.reflectance * 100).toFixed(0)}% / 透射率 {(g.transmittance * 100).toFixed(0)}%；
                  {g.pattern.type === 'dots'
                    ? `圆点 Ø${(g.pattern.sizeM * 1000).toFixed(0)}mm，间距 ${(g.pattern.spacingXM * 1000).toFixed(0)}×${(g.pattern.spacingYM * 1000)}mm`
                    : g.pattern.type === 'stripes'
                      ? `条纹宽 ${(g.pattern.sizeM * 1000).toFixed(0)}mm，周期 ${(g.pattern.spacingXM * 1000).toFixed(0)}mm`
                      : '无可见图案'}
                </p>
              </div>
            );
          })()}
        </Card>

        <Card title="待改造玻璃选择（按风险排序）" pad={false}>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table className="data">
              <thead><tr><th></th><th>玻璃</th><th className="num">风险</th><th>等级</th><th>当前替换</th></tr></thead>
              <tbody>
                {[...before].sort((a, b) => b.score - a.score).map((r) => {
                  const s = project.surfaces.find((x) => x.id === r.surfaceId)!;
                  return (
                    <tr key={s.id} onClick={() => toggle(s.id)}>
                      <td><input type="checkbox" checked={selected.has(s.id)} readOnly /></td>
                      <td style={{ maxWidth: 220 }}><div style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div></td>
                      <td className="num"><ScorePill score={r.score} level={r.level} /></td>
                      <td><LevelBadge level={r.level} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <GlassSelect allowEmpty value={s.retrofitGlassTypeId ?? ''} emptyLabel="不改造"
                          onChange={(gid) => {
                            updateProject(project.id, (p) => {
                              const x = p.surfaces.find((y) => y.id === s.id);
                              if (x) x.retrofitGlassTypeId = gid || null;
                            }, true);
                          }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Card title="改造前 · 风险立面"><ElevationChart project={project} scoreMap={beforeMap} /></Card>
        <Card title="改造后 · 风险立面">
          {afterMap ? <ElevationChart project={project} scoreMap={afterMap} /> : <EmptyHint icon="↻" title="尚未复算" desc="应用改造后点击「GPU 前后复算」查看改造后热力立面。" />}
        </Card>
      </div>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} html={reportHtml} iframeRef={iframeRef} onDownload={downloadReportFile}
        onPrint={() => iframeRef.current?.contentWindow?.print()} />
    </div>
  );
}

function ReportModal({ open, onClose, html, iframeRef, onDownload, onPrint }: {
  open: boolean; onClose: () => void; html: string;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onDownload: () => void; onPrint: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="评估报告预览（含风险立面图与改造清单）" width={980}
      footer={<><Btn onClick={onClose}>关闭</Btn><Btn onClick={onPrint}>🖨 打印 / PDF</Btn><Btn variant="primary" onClick={onDownload}>⬇ 下载 HTML 报告</Btn></>}>
      <iframe title="report-preview" ref={iframeRef} srcDoc={html} style={{ width: '100%', height: '68vh', border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }} />
    </Modal>
  );
}
