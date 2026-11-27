import { useMemo, useRef, useState } from 'react';
import { useCurrentProject } from '../components/useCurrent';
import { useStore } from '../core/store';
import { Viewport } from '../components/Viewport';
import { Btn, Card, EmptyHint, Field, Modal, NumberInput, Segmented } from '../components/ui';
import { GlassSelect } from '../components/GlassSelect';
import type { BoxBody, GlassSurface, TreeItem, WaterBody } from '../core/types';
import { uid } from '../core/geom';
import { makeRibbonWindows } from '../core/surfaces';
import { parseObj, type ParsedObj } from '../core/obj';
import { groupToGlassSurface } from '../core/objSurface';

type Tab = 'surface' | 'bodies' | 'env';

export default function BuildingPage() {
  const project = useCurrentProject();
  const updateProject = useStore((s) => s.updateProject);
  const glass = useStore((s) => s.glass);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('surface');
  const [objOpen, setObjOpen] = useState(false);

  const selected = project?.surfaces.find((s) => s.id === selectedId) ?? null;

  const riskMap = useMemo(() => new Map<string, number>(), []);

  if (!project) {
    return <div className="page"><EmptyHint title="请先选择或新建一个项目" /></div>;
  }
  const mutate = (fn: (p: NonNullable<typeof project>) => void) => updateProject(project.id, fn);

  const onPick = (id: string | null) => {
    setSelectedId(id);
    if (id) setTab('surface');
  };

  const addBox = () => {
    const body: BoxBody = {
      id: uid('body'), kind: 'box', name: `新增建筑 ${project.buildingBodies.length + 1}`,
      center: { x: 0, y: 6, z: 0 }, size: { x: 20, y: 12, z: 10 }, floors: 3, floorHeightM: 3.6, color: '#cdd5dc',
    };
    const surfs = makeRibbonWindows({ body, floors: 3, floorHeight: 3.6, segCount: 4, glassTypeId: 'glass-low-e' });
    mutate((p) => { p.buildingBodies.push(body); p.surfaces.push(...surfs); });
    useStore.getState().pushToast('已添加盒体与带状窗', 'ok');
  };

  const addTree = () => {
    const t: TreeItem = {
      id: uid('tree'), kind: 'tree', name: '景观乔木',
      position: { x: Math.round((Math.random() - 0.5) * 30), y: 0, z: -8 - Math.random() * 8 },
      crownRadiusM: 3, heightM: 7, color: '#3f7d4e',
    };
    mutate((p) => { p.environment.push(t); });
  };
  const addWater = () => {
    const w: WaterBody = {
      id: uid('water'), kind: 'water', name: '景观水体',
      center: { x: 0, y: 0, z: -18 }, widthM: 12, depthM: 6, color: '#3e7ca8',
    };
    mutate((p) => { p.environment.push(w); });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>建筑与环境</h1>
          <p>导入 OBJ 体块并把指定子网格标为玻璃，或直接编辑参数化立面；单独勾选「转角」「连廊/可看穿」。在场地中布置简模乔木与水体。</p>
        </div>
        <div className="actions">
          <Btn onClick={() => setObjOpen(true)}>⬆ 导入 OBJ</Btn>
          <Btn onClick={addBox}>＋ 盒体建筑</Btn>
          <Btn variant="primary" onClick={() => (window.location.hash = '#/reflection')}>前往反射分析 →</Btn>
        </div>
      </div>

      <div className="layout-split">
        <div>
          <Viewport project={project} glass={glass} mode="material" riskMap={riskMap} selectedId={selectedId} onPick={onPick} height={520} />
          <Card title={`玻璃面清单（${project.surfaces.length}）`} style={{ marginTop: 18 }}
            extra={<span className="muted">单击视口玻璃或表格行进行标注</span>} pad={false}>
            <div className="table-wrap" style={{ maxHeight: 340 }}>
              <table className="data">
                <thead>
                  <tr><th>名称</th><th>玻璃</th><th className="num">楼层</th><th className="num">面积㎡</th><th>标记</th></tr>
                </thead>
                <tbody>
                  {project.surfaces.map((s) => {
                    const g = glass.find((x) => x.id === s.glassTypeId);
                    return (
                      <tr key={s.id} className={selectedId === s.id ? 'selected' : ''} onClick={() => onPick(s.id)}>
                        <td>{s.name}</td>
                        <td>{g?.name ?? '⚠ 缺失玻璃'}</td>
                        <td className="num">{s.floor || '跨层'}</td>
                        <td className="num">{s.areaM2.toFixed(1)}</td>
                        <td>
                          {s.isCorner && <span className="tag" style={{ background: '#ffedd5', color: '#c2410c' }}>转角</span>}{' '}
                          {s.isSeeThrough && <span className="tag" style={{ background: '#fee2e2', color: '#b91c1c' }}>可看穿</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'surface', label: '玻璃标注' },
                { value: 'bodies', label: `建筑体 ${project.buildingBodies.length}` },
                { value: 'env', label: `环境 ${project.environment.length}` },
              ]}
            />
          </Card>

          {tab === 'surface' && (
            selected ? (
              <SurfaceEditor key={selected.id} surface={selected} />
            ) : (
              <Card><EmptyHint icon="👆" title="未选择玻璃" desc="在左侧三维视口中单击任意玻璃面，或从下方清单选择，即可指定玻璃类型、楼层与转角/连廊属性。" /></Card>
            )
          )}

          {tab === 'bodies' && <BodiesPanel />}
          {tab === 'env' && <EnvPanel onAddTree={addTree} onAddWater={addWater} />}

          <Card title="项目信息">
            <Field label="项目名称">
              <input value={project.name} onChange={(e) => mutate((p) => { p.name = e.target.value; })} />
            </Field>
            <Field label="地点">
              <input value={project.location} onChange={(e) => mutate((p) => { p.location = e.target.value; })} />
            </Field>
            <Field label="项目说明">
              <textarea value={project.description} onChange={(e) => mutate((p) => { p.description = e.target.value; })} />
            </Field>
          </Card>
        </div>
      </div>

      {objOpen && <ObjImportModal onClose={() => setObjOpen(false)} />}
    </div>
  );
}

/* ---------------- 玻璃属性编辑 ---------------- */

function SurfaceEditor({ surface }: { surface: GlassSurface }) {
  const project = useCurrentProject()!;
  const updateProject = useStore((s) => s.updateProject);
  const mutate = (fn: (p: typeof project) => void) => updateProject(project.id, fn);
  const patch = (pp: Partial<GlassSurface>) => mutate((p) => {
    const s = p.surfaces.find((x) => x.id === surface.id);
    if (s) Object.assign(s, pp);
  });

  return (
    <Card title="玻璃面属性" extra={<Btn size="sm" variant="danger" onClick={() => {
      if (confirm('删除这块玻璃？')) mutate((p) => { p.surfaces = p.surfaces.filter((x) => x.id !== surface.id); });
    }}>删除</Btn>}>
      <div className="surface-detail">
        <h4>{surface.name}</h4>
        <div className="muted">面积 {surface.areaM2.toFixed(2)} ㎡ · 中心高度 {surface.centerHeightM.toFixed(1)} m</div>
      </div>
      <div style={{ height: 12 }} />
      <Field label="名称"><input value={surface.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
      <Field label="玻璃类型"><GlassSelect value={surface.glassTypeId} onChange={(id) => patch({ glassTypeId: id })} /></Field>
      <div className="grid grid-2">
        <Field label="楼层（0=跨层/连廊）"><NumberInput value={surface.floor} min={0} max={200} step={1} onChange={(v) => patch({ floor: Math.round(v) })} /></Field>
        <Field label="最近绿化距离覆盖 (m，留空自动)">
          <NumberInput value={surface.greenDistanceOverrideM ?? NaN} min={0} max={200} step={0.5}
            onChange={(v) => patch({ greenDistanceOverrideM: Number.isFinite(v) ? v : null })} />
        </Field>
      </div>
      <div className="check-list" style={{ margin: '6px 0 12px' }}>
        <label className="inline-switch">
          <span className="switch"><input type="checkbox" checked={surface.isCorner} onChange={(e) => patch({ isCorner: e.target.checked })} /><span className="track" /></span>
          转角玻璃（两面相交，鸟类易误判为通道）
        </label>
        <label className="inline-switch">
          <span className="switch"><input type="checkbox" checked={surface.isSeeThrough} onChange={(e) => patch({ isSeeThrough: e.target.checked })} /><span className="track" /></span>
          连廊 / 可看穿（对侧也有玻璃或开洞）
        </label>
        {surface.isSeeThrough && (
          <Field label="看穿通道深度 (m)">
            <NumberInput value={surface.seeThroughDepthM ?? 4} min={0.5} max={60} step={0.1} onChange={(v) => patch({ seeThroughDepthM: v })} />
          </Field>
        )}
      </div>
      <div className="kv-list">
        <dt>法线</dt><dd className="mono">({surface.normal.x.toFixed(2)}, {surface.normal.y.toFixed(2)}, {surface.normal.z.toFixed(2)})</dd>
        <dt>来源</dt><dd>{surface.source.type === 'box-face' ? `参数化盒体·${surface.source.face}` : surface.source.type === 'obj-range' ? 'OBJ 子网格' : '手动'}</dd>
      </div>
    </Card>
  );
}

/* ---------------- 建筑体面板 ---------------- */

function BodiesPanel() {
  const project = useCurrentProject()!;
  const updateProject = useStore((s) => s.updateProject);
  const mutate = (fn: (p: typeof project) => void) => updateProject(project.id, fn);

  return (
    <Card title="建筑体块">
      <div className="check-list">
        {project.buildingBodies.map((b) => (
          <div key={b.id} className="elev-block" style={{ padding: 12 }}>
            <div className="toolbar-row" style={{ marginBottom: 6 }}>
              <input value={b.name} style={{ padding: '6px 9px', border: '1px solid var(--border-strong)', borderRadius: 8, fontWeight: 650 }}
                onChange={(e) => mutate((p) => { const x = p.buildingBodies.find((y) => y.id === b.id); if (x) x.name = e.target.value; })} />
              <span className="spacer" />
              <Btn size="sm" variant="danger" onClick={() => confirm('删除该建筑体及其玻璃？') && mutate((p) => {
                p.buildingBodies = p.buildingBodies.filter((x) => x.id !== b.id);
                if (b.kind === 'box') p.surfaces = p.surfaces.filter((s) => !(s.source.type === 'box-face' && s.source.bodyId === b.id));
              })}>删除</Btn>
            </div>
            {b.kind === 'box' ? (
              <div className="grid grid-3">
                {(['x', 'y', 'z'] as const).map((ax) => (
                  <Field key={`c${ax}`} label={`中心 ${ax.toUpperCase()}`}>
                    <NumberInput value={b.center[ax]} step={0.5} onChange={(v) => mutate((p) => { const x = p.buildingBodies.find((y) => y.id === b.id); if (x?.kind === 'box') x.center[ax] = v; })} />
                  </Field>
                ))}
                {(['x', 'y', 'z'] as const).map((ax) => (
                  <Field key={`s${ax}`} label={`尺寸 ${ax.toUpperCase()}`}>
                    <NumberInput value={b.size[ax]} min={0.5} step={0.5} onChange={(v) => mutate((p) => { const x = p.buildingBodies.find((y) => y.id === b.id); if (x?.kind === 'box') x.size[ax] = Math.max(0.5, v); })} />
                  </Field>
                ))}
                <Field label="楼层数"><NumberInput value={b.floors} min={0} step={1} onChange={(v) => mutate((p) => { const x = p.buildingBodies.find((y) => y.id === b.id); if (x?.kind === 'box') x.floors = Math.round(v); })} /></Field>
              </div>
            ) : (
              <div className="muted">OBJ 体块 · {(b.indices.length / 3).toFixed(0)} 三角形 · 缩放 {b.scale}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- 环境面板 ---------------- */

function EnvPanel({ onAddTree, onAddWater }: { onAddTree: () => void; onAddWater: () => void }) {
  const project = useCurrentProject()!;
  const updateProject = useStore((s) => s.updateProject);
  const mutate = (fn: (p: typeof project) => void) => updateProject(project.id, fn);

  return (
    <Card title="周边树木与水体" extra={<span style={{ display: 'flex', gap: 6 }}>
      <Btn size="sm" onClick={onAddTree}>＋ 树</Btn>
      <Btn size="sm" onClick={onAddWater}>＋ 水</Btn>
    </span>}>
      <div className="check-list">
        {project.environment.map((e) => (
          <div key={e.id} className="elev-block" style={{ padding: 11 }}>
            <div className="toolbar-row" style={{ marginBottom: 6 }}>
              <strong>{e.kind === 'tree' ? '🌳' : '💧'} {e.name}</strong>
              <span className="spacer" />
              <Btn size="sm" variant="danger" onClick={() => mutate((p) => { p.environment = p.environment.filter((x) => x.id !== e.id); })}>删除</Btn>
            </div>
            <div className="grid grid-3">
              <Field label="X"><NumberInput value={e.kind === 'tree' ? e.position.x : e.center.x} step={0.5}
                onChange={(v) => mutate((p) => { const x = p.environment.find((y) => y.id === e.id); if (!x) return; if (x.kind === 'tree') x.position.x = v; else x.center.x = v; })} /></Field>
              <Field label="Z"><NumberInput value={e.kind === 'tree' ? e.position.z : e.center.z} step={0.5}
                onChange={(v) => mutate((p) => { const x = p.environment.find((y) => y.id === e.id); if (!x) return; if (x.kind === 'tree') x.position.z = v; else x.center.z = v; })} /></Field>
              {e.kind === 'tree' ? (
                <Field label="树冠半径 m"><NumberInput value={e.crownRadiusM} min={0.5} step={0.25}
                  onChange={(v) => mutate((p) => { const x = p.environment.find((y) => y.id === e.id); if (x?.kind === 'tree') x.crownRadiusM = v; })} /></Field>
              ) : (
                <Field label="水面宽 m"><NumberInput value={e.widthM} min={1} step={0.5}
                  onChange={(v) => mutate((p) => { const x = p.environment.find((y) => y.id === e.id); if (x?.kind === 'water') x.widthM = v; })} /></Field>
              )}
              {e.kind === 'tree' && (
                <Field label="树高 m"><NumberInput value={e.heightM} min={1} step={0.5}
                  onChange={(v) => mutate((p) => { const x = p.environment.find((y) => y.id === e.id); if (x?.kind === 'tree') x.heightM = v; })} /></Field>
              )}
              {e.kind === 'water' && (
                <Field label="水面纵深 m"><NumberInput value={e.depthM} min={1} step={0.5}
                  onChange={(v) => mutate((p) => { const x = p.environment.find((y) => y.id === e.id); if (x?.kind === 'water') x.depthM = v; })} /></Field>
              )}
            </div>
          </div>
        ))}
        {project.environment.length === 0 && <div className="muted">尚未布置环境，点击右上角添加乔木或水体。</div>}
      </div>
    </Card>
  );
}

/* ---------------- OBJ 导入 ---------------- */

function ObjImportModal({ onClose }: { onClose: () => void }) {
  const project = useCurrentProject()!;
  const updateProject = useStore((s) => s.updateProject);
  const pushToast = useStore((s) => s.pushToast);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedObj | null>(null);
  const [fileName, setFileName] = useState('');
  const [glassGroups, setGlassGroups] = useState<Set<number>>(new Set());
  const [glassTypeId, setGlassTypeId] = useState('glass-reflective-blue');
  const [autoScale, setAutoScale] = useState(true);
  const [scale, setScale] = useState(0.01);

  const readFile = async (f: File) => {
    const text = await f.text();
    const p = parseObj(text);
    if (p.triangleCount === 0) {
      pushToast('未在 OBJ 中解析到三角面', 'err');
      return;
    }
    setParsed(p);
    setFileName(f.name.replace(/\.obj$/i, ''));
    setGlassGroups(new Set());
  };

  const confirm = () => {
    if (!parsed) return;
    // 归一化变换
    const b = parsed.bounds;
    const maxDim = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) || 1;
    const s = autoScale ? 40 / maxDim : scale;
    const center = { x: (b.min.x + b.max.x) / 2, y: b.min.y, z: (b.min.z + b.max.z) / 2 };
    const translation = { x: -center.x * s, y: -center.y * s, z: -center.z * s };

    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const glassRanges: { start: number; count: number; glassId: string }[] = [];
    const newSurfaces: GlassSurface[] = [];

    parsed.groups.forEach((g, gi) => {
      const base = positions.length / 3;
      const start = indices.length;
      for (let i = 0; i < g.positions.length; i++) positions.push(g.positions[i]);
      for (let i = 0; i < g.normals.length; i++) normals.push(g.normals[i]);
      for (let v = 0; v < g.positions.length / 3; v++) indices.push(base + v);
      if (glassGroups.has(gi)) {
        glassRanges.push({ start, count: indices.length - start, glassId: glassTypeId });
        const surf = groupToGlassSurface(g, { scale: s, translation }, glassTypeId, glassRanges.length - 1);
        newSurfaces.push(surf);
      }
    });

    const bodyId = uid('obj');
    for (const sf of newSurfaces) sf.source = { type: 'obj-range', bodyId, rangeIndex: sf.source.type === 'obj-range' ? sf.source.rangeIndex : 0 };

    updateProject(project.id, (p) => {
      p.buildingBodies.push({
        id: bodyId, kind: 'obj', name: fileName || '导入 OBJ',
        positions: new Float32Array(positions), normals: new Float32Array(normals),
        indices: new Uint32Array(indices), glassRanges, translation, scale: s, color: '#b9c6d0',
      });
      p.surfaces.push(...newSurfaces);
    }, true);
    pushToast(`已导入 OBJ：${parsed.triangleCount} 三角面，标记 ${newSurfaces.length} 组玻璃`, 'ok');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="导入 OBJ 体块并标注玻璃" width={760}
      footer={<><Btn onClick={onClose}>取消</Btn><Btn variant="primary" disabled={!parsed} onClick={confirm}>导入并生成玻璃面</Btn></>}>
      {!parsed ? (
        <div className="empty-hint">
          <div className="empty-icon">📐</div>
          <h4>选择简单 OBJ 模型</h4>
          <p>支持 v / vn / f 与 o/g 分组。建议使用分组区分玻璃幕墙，导入后勾选对应分组即可单独标为玻璃。</p>
          <Btn variant="primary" onClick={() => fileRef.current?.click()}>选择 .obj 文件</Btn>
          <input ref={fileRef} type="file" accept=".obj" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </div>
      ) : (
        <>
          <p className="muted">已解析 <b>{fileName}</b>：{parsed.vertexCount} 顶点 / {parsed.triangleCount} 三角面 / {parsed.groups.length} 分组。勾选要标为玻璃的分组：</p>
          <div className="table-wrap" style={{ maxHeight: 260, border: '1px solid var(--border)', borderRadius: 10, margin: '10px 0' }}>
            <table className="data">
              <thead><tr><th>作为玻璃</th><th>分组名</th><th className="num">三角面</th></tr></thead>
              <tbody>
                {parsed.groups.map((g, i) => (
                  <tr key={i} onClick={() => setGlassGroups((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}>
                    <td><input type="checkbox" checked={glassGroups.has(i)} readOnly /></td>
                    <td>{g.name}</td>
                    <td className="num">{g.triangleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="玻璃类型"><GlassSelect value={glassTypeId} onChange={setGlassTypeId} /></Field>
          <div className="grid grid-2">
            <label className="inline-switch" style={{ alignSelf: 'center' }}>
              <input type="checkbox" checked={autoScale} onChange={(e) => setAutoScale(e.target.checked)} />
              自动归一化到约 40m 并落地居中
            </label>
            {!autoScale && <Field label="缩放系数"><NumberInput value={scale} min={0.0001} step={0.005} onChange={setScale} /></Field>}
          </div>
        </>
      )}
    </Modal>
  );
}
