import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../core/store';
import { Btn, EmptyHint } from '../components/ui';
import type { Project } from '../core/types';

function ProjectThumb({ p }: { p: Project }) {
  // 轻量 SVG 示意缩略图：盒体立面 + 玻璃网格 + 环境
  const boxes = p.buildingBodies.filter((b) => b.kind === 'box');
  const hasWater = p.environment.some((e) => e.kind === 'water');
  const treeCount = p.environment.filter((e) => e.kind === 'tree').length;
  const isMall = p.name.includes('商场') || p.name.includes('连廊');
  return (
    <svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id={`sky-${p.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isMall ? '#fde9d0' : '#bfe0f5'} />
          <stop offset="100%" stopColor="#eef6fb" />
        </linearGradient>
      </defs>
      <rect width="320" height="150" fill={`url(#sky-${p.id})`} />
      {hasWater && <rect x="0" y="118" width="320" height="32" fill="#7fb4d4" />}
      <rect x="0" y="112" width="320" height="10" fill="#cdd8c8" />
      {boxes.map((b, i) => {
        if (b.kind !== 'box') return null;
        const w = Math.min(150, b.size.x * 2.4);
        const h = Math.max(24, Math.min(96, b.size.y * 2.6));
        const x = 160 - w / 2 + (b.center.x ?? 0) * 2.2;
        const y = 112 - h;
        const cols = Math.max(2, Math.round(b.size.x / 6));
        const rows = Math.max(1, b.floors || Math.round(b.size.y / 4));
        const ww = Math.max(1, (w - 8) / cols - 2);
        const wh = Math.max(1.5, (h - 10) / rows - 2);
        return (
          <g key={b.id} opacity={0.96 - i * 0.08}>
            <rect x={x} y={y} width={w} height={h} fill={b.color ?? '#c9d2da'} stroke="#8ba0af" />
            {Array.from({ length: rows }).map((_, r) =>
              Array.from({ length: cols }).map((_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={x + 4 + (c * (w - 8)) / cols}
                  y={y + 5 + (r * (h - 10)) / rows}
                  width={(w - 8) / cols - 2}
                  height={(h - 10) / rows - 2}
                  fill={(r + c) % 5 === 0 ? '#5b7fa6' : '#a9cbe2'}
                  opacity={0.9}
                />
              )),
            )}
          </g>
        );
      })}
      {Array.from({ length: Math.min(8, treeCount) }).map((_, i) => (
        <g key={i}>
          <rect x={18 + i * 40} y={100} width="4" height="14" fill="#7a5a3c" />
          <circle cx={20 + i * 40} cy={98} r="11" fill="#3f7d4e" />
        </g>
      ))}
    </svg>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, createProject, duplicateProject, deleteProject, setCurrent, exportProject, importBundle } = useStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  const open = (id: string) => {
    setCurrent(id);
    navigate('/building');
  };

  const onImportFile = async (file?: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const id = await importBundle(file);
      navigate('/building');
      void id;
    } catch (e) {
      useStore.getState().pushToast(`导入失败：${(e as Error).message}`, 'err');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>项目列表</h1>
          <p>新建、复制、自动保存与分享防鸟撞评估项目。所有数据保存在浏览器 IndexedDB，可导出单个文件发给同事。</p>
        </div>
        <div className="actions">
          <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? '导入中…' : '⬆ 导入项目文件'}
          </Btn>
          <Btn variant="primary" onClick={() => { const id = createProject(); open(id); }}>＋ 新建项目</Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImportFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyHint
          title="还没有项目"
          desc="新建一个项目开始，或导入 .birdglass.json 项目文件。"
          action={<Btn variant="primary" onClick={() => open(createProject())}>＋ 新建第一个项目</Btn>}
        />
      ) : (
        <div className="proj-grid">
          <div className="proj-card new" onClick={() => open(createProject())}>
            <div className="plus">＋</div>
            <div style={{ fontWeight: 700 }}>新建空白项目</div>
          </div>
          {projects.map((p) => {
            const highRisk = p.latestSnapshotId
              ? p.snapshots[0]?.risks.filter((r) => r.score >= 60).length
              : null;
            return (
              <article key={p.id} className="proj-card" onClick={() => open(p.id)}>
                <div className="proj-thumb">
                  <ProjectThumb p={p} />
                  <span className="loc">📍 {p.location || '未填写地点'}</span>
                </div>
                <div className="proj-body">
                  <h3>{p.name}</h3>
                  <div className="proj-meta">
                    <span>🧊 {p.surfaces.length} 块玻璃</span>
                    <span>🌳 {p.environment.filter((e) => e.kind === 'tree').length} 株树</span>
                    <span>💧 {p.environment.filter((e) => e.kind === 'water').length} 处水</span>
                    {highRisk != null && <span style={{ color: highRisk ? 'var(--danger)' : 'var(--ok)', fontWeight: 700 }}>高风险 {highRisk}</span>}
                  </div>
                  <div className="proj-desc">{p.description || '暂无项目说明'}</div>
                  <div className="muted">更新于 {new Date(p.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="proj-actions" onClick={(e) => e.stopPropagation()}>
                  <Btn variant="primary" size="sm" onClick={() => open(p.id)}>打开</Btn>
                  <Btn size="sm" onClick={() => { const id = duplicateProject(p.id); if (id) setCurrent(id); }}>复制</Btn>
                  <Btn size="sm" onClick={() => exportProject(p.id)}>导出</Btn>
                  <Btn
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (confirm(`确定删除项目「${p.name}」？此操作不可恢复。`)) deleteProject(p.id);
                    }}
                  >
                    删除
                  </Btn>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
