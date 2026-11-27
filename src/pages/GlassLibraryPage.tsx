import { useMemo, useState } from 'react';
import { useStore } from '../core/store';
import type { GlassType, PatternType } from '../core/types';
import { uid } from '../core/geom';
import { iorFromNormalReflectance, normalReflectanceFromIor } from '../core/fresnel';
import { Btn, Card, Field, Modal, NumberInput } from '../components/ui';
import { PatternSwatch } from '../components/PatternSwatch';
import { FresnelCurve } from '../components/Charts';

function blankGlass(): GlassType {
  return {
    id: uid('glass'),
    name: '新建玻璃类型',
    vendor: '自定义',
    reflectance: 0.15,
    transmittance: 0.6,
    coatingColor: '#9fc3d8',
    ior: iorFromNormalReflectance(0.15),
    birdSafe: false,
    pattern: { type: 'none', color: '#f4f6f8', sizeM: 0.012, spacingXM: 0.05, spacingYM: 0.05 },
  };
}

export default function GlassLibraryPage() {
  const glass = useStore((s) => s.glass);
  const { addGlass, updateGlass, deleteGlass, resetGlass } = useStore();
  const [editing, setEditing] = useState<GlassType | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [query, setQuery] = useState('');

  const list = useMemo(
    () => glass.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()) || (g.vendor ?? '').includes(query)),
    [glass, query],
  );

  const save = () => {
    if (!editing) return;
    const fixed: GlassType = {
      ...editing,
      birdSafe: editing.pattern.type !== 'none' ? true : editing.birdSafe,
    };
    if (isNew) addGlass(fixed);
    else updateGlass(fixed.id, fixed);
    setEditing(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>玻璃库</h1>
          <p>维护反射率、透射率、镀膜颜色与防鸟撞点阵/条纹参数。折射率由法向反射率 R₀ 反解，反射率随入射角严格按菲涅尔方程变化。</p>
        </div>
        <div className="actions">
          <input className="select" style={{ width: 220 }} placeholder="搜索玻璃/厂商…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Btn variant="ghost" onClick={() => { if (confirm('恢复内置玻璃库？自定义类型不受影响之外的内置项将被重置。')) resetGlass(); }}>恢复内置</Btn>
          <Btn variant="primary" onClick={() => { setEditing(blankGlass()); setIsNew(true); }}>＋ 新增玻璃</Btn>
        </div>
      </div>

      <div className="glass-grid">
        {list.map((g) => (
          <article className="glass-card" key={g.id}>
            <PatternSwatch glass={g} />
            <div className="glass-info">
              <h4>
                {g.name}
                {g.builtin && <span className="tag">内置</span>}
              </h4>
              <div className="muted">{g.vendor} · n={g.ior.toFixed(3)}</div>
              <div className="glass-tags">
                {g.birdSafe ? <span className="tag safe">🦅 防鸟撞</span> : <span className="tag">非防鸟撞</span>}
                {g.pattern.type === 'dots' && <span className="tag">点阵 {Math.round(g.pattern.spacingXM * 1000)}×{Math.round(g.pattern.spacingYM * 1000)}mm</span>}
                {g.pattern.type === 'stripes' && <span className="tag">条纹周期 {Math.round(g.pattern.spacingXM * 1000)}mm</span>}
                {g.pattern.type === 'none' && <span className="tag">无图案</span>}
              </div>
              <div className="glass-props">
                <span>法向反射率 <b>{(g.reflectance * 100).toFixed(0)}%</b></span>
                <span>透射率 <b>{(g.transmittance * 100).toFixed(0)}%</b></span>
                <span>掠射 R(90°) <b>≈100%</b></span>
                <span>颜色 <b><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: g.coatingColor, border: '1px solid #94a3b8', verticalAlign: '-1px', marginRight: 4 }} />{g.coatingColor}</b></span>
              </div>
              {g.note && <div className="muted" style={{ fontSize: 11.5 }}>{g.note}</div>}
              <div className="card-actions">
                <Btn size="sm" variant="primary" onClick={() => { setEditing({ ...g, pattern: { ...g.pattern } }); setIsNew(false); }}>编辑</Btn>
                {!g.builtin && (
                  <Btn size="sm" variant="danger" onClick={() => confirm(`删除玻璃「${g.name}」？`) && deleteGlass(g.id)}>删除</Btn>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <GlassEditor
          glass={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={save}
          isNew={isNew}
        />
      )}
    </div>
  );
}

function GlassEditor({ glass, onChange, onClose, onSave, isNew }: {
  glass: GlassType;
  onChange: (g: GlassType) => void;
  onClose: () => void;
  onSave: () => void;
  isNew: boolean;
}) {
  const set = (patch: Partial<GlassType>) => onChange({ ...glass, ...patch });
  const setPattern = (patch: Partial<GlassType['pattern']>) =>
    onChange({ ...glass, pattern: { ...glass.pattern, ...patch } });

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? '新增玻璃类型' : `编辑 · ${glass.name}`}
      width={860}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn variant="primary" onClick={onSave}>保存玻璃</Btn>
        </>
      }
    >
      <div className="grid grid-2">
        <div>
          <Field label="名称"><input value={glass.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="厂商 / 系列"><input value={glass.vendor ?? ''} onChange={(e) => set({ vendor: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label={`法向反射率 ${(glass.reflectance * 100).toFixed(0)}%`}>
              <input type="range" min={0.02} max={0.7} step={0.01} value={glass.reflectance}
                onChange={(e) => {
                  const r = parseFloat(e.target.value);
                  set({ reflectance: r, ior: iorFromNormalReflectance(r) });
                }} />
            </Field>
            <Field label="透射率">
              <NumberInput value={glass.transmittance} min={0} max={1} step={0.01}
                onChange={(v) => set({ transmittance: Math.min(1, Math.max(0, v)) })} />
            </Field>
          </div>
          <div className="grid grid-2">
            <Field label="折射率 n（随反射率联动，可高级覆盖）">
              <NumberInput value={glass.ior} min={1} max={3} step={0.001}
                onChange={(v) => set({ ior: v, reflectance: normalReflectanceFromIor(v) })} />
            </Field>
            <Field label="镀膜 / 基片颜色">
              <input type="color" value={glass.coatingColor} onChange={(e) => set({ coatingColor: e.target.value })} />
            </Field>
          </div>

          <Card title="防鸟撞图案" >
            <div className="toolbar-row" style={{ marginBottom: 10 }}>
              {(['none', 'dots', 'stripes'] as PatternType[]).map((t) => (
                <button key={t} className={`check-pill ${glass.pattern.type === t ? 'on' : ''}`} onClick={() => setPattern({ type: t })} type="button">
                  {t === 'none' ? '无图案' : t === 'dots' ? '点阵' : '条纹'}
                </button>
              ))}
            </div>
            {glass.pattern.type !== 'none' && (
              <div className="grid grid-2">
                <Field label="图案颜色"><input type="color" value={glass.pattern.color} onChange={(e) => setPattern({ color: e.target.value })} /></Field>
                <Field label={glass.pattern.type === 'dots' ? '圆点直径 (m)' : '条纹宽度 (m)'}>
                  <NumberInput value={glass.pattern.sizeM} min={0.004} max={0.06} step={0.001}
                    onChange={(v) => setPattern({ sizeM: v })} />
                </Field>
                <Field label={glass.pattern.type === 'dots' ? '水平中心间距 (m)' : '条纹周期 (m)'}>
                  <NumberInput value={glass.pattern.spacingXM} min={0.02} max={0.3} step={0.005}
                    onChange={(v) => setPattern({ spacingXM: v })} />
                </Field>
                {glass.pattern.type === 'dots' && (
                  <Field label="竖直中心间距 (m)">
                    <NumberInput value={glass.pattern.spacingYM} min={0.02} max={0.3} step={0.005}
                      onChange={(v) => setPattern({ spacingYM: v })} />
                  </Field>
                )}
              </div>
            )}
            <Field label="备注"><textarea value={glass.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>
          </Card>
        </div>

        <div>
          <PatternSwatch glass={glass} height={150} />
          <Card title="菲涅尔反射率曲线（严格方程）" style={{ marginTop: 14 }}>
            <FresnelCurve ior={glass.ior} />
            <p className="muted" style={{ marginTop: 6 }}>
              垂直正视时 R₀={(glass.reflectance * 100).toFixed(2)}%；随入射角增大反射率上升，掠射角趋近 1（100%）。
              GPU 着色器与统计使用同一公式，可在「设置 → GPU 菲涅尔自检」查看与解析公式的误差。
            </p>
          </Card>
        </div>
      </div>
    </Modal>
  );
}
