import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from '../core/store';
import { Toasts } from './ui';

const NAV = [
  { to: '/', label: '项目列表', ico: '🗂️', end: true },
  { section: '评估工作流' },
  { to: '/building', label: '建筑与环境', ico: '🏢' },
  { to: '/glass', label: '玻璃库', ico: '🧊' },
  { to: '/reflection', label: '反射分析', ico: '🌤️' },
  { to: '/risk', label: '风险评估', ico: '🔥' },
  { to: '/measures', label: '措施方案', ico: '🛠️' },
  { section: '系统' },
  { to: '/settings', label: '设置与自检', ico: '⚙️' },
];

export default function Layout() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const projects = useStore((s) => s.projects);
  const currentId = useStore((s) => s.currentId);
  const setCurrent = useStore((s) => s.setCurrent);
  const saveState = useStore((s) => s.saveState);
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    init();
  }, [init]);

  // 在项目子页面且当前项目被删除时回列表
  useEffect(() => {
    if (ready && loc.pathname !== '/' && loc.pathname !== '/glass' && !currentId) navigate('/');
  }, [ready, currentId, loc.pathname, navigate]);

  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#0f766e', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🪶</div>
          <h2 style={{ marginTop: 10 }}>羽鉴 · 正在打开本地项目库…</h2>
          <p className="muted">IndexedDB / WebGPU 初始化中</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">🪟</div>
          <div className="brand-text">
            <div className="brand-name">羽鉴 BirdGlass</div>
            <div className="brand-sub">防鸟撞评估 · WEBGPU</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n, i) =>
            'section' in n ? (
              <div className="nav-section" key={`s${i}`}>{n.section}</div>
            ) : (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <span className="ico">{n.ico}</span>
                <span>{n.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          反射核：严格菲涅尔方程
          <br />
          数据仅存于本机 IndexedDB
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="proj-switch">
            <span style={{ fontSize: 18 }}>🏗️</span>
            <select
              className="select"
              style={{ width: 'auto', maxWidth: 340, fontWeight: 650 }}
              value={currentId ?? ''}
              onChange={(e) => {
                setCurrent(e.target.value || null);
                if (loc.pathname === '/') navigate('/building');
              }}
            >
              <option value="" disabled>选择项目…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="spacer" />
          <span className={`save-state ${saveState}`}>
            <i className="save-dot" />
            {saveState === 'saving' ? '自动保存中…' : saveState === 'saved' ? '已保存到 IndexedDB' : saveState === 'error' ? '保存失败' : '自动保存已就绪'}
          </span>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}
