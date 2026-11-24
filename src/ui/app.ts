import type { AnalysisResult, AppSettings, GlassMaterial, ID, Project } from '../types';
import type { AppContext, RouteName } from './context';
import { h, icon } from './dom';
import { ensureSeeded, dbPutProject, dbPutMaterial, dbDeleteMaterial, dbPutAppSettings } from '../core/db';
import { evaluateProject } from '../core/evaluate';
import { exportProjectJson } from '../core/project_io';
import { getGpuContext } from '../gpu/device';
import { renderProjectsPage } from './projects_page';
import { renderBuildingPage } from './building_page';
import { renderGlassPage } from './glass_page';
import { renderReflectionPage } from './reflection_page';
import { renderRiskPage } from './risk_page';
import { renderMeasuresPage } from './measures_page';
import { renderSettingsPage } from './settings_page';

const ROUTES: Array<{ id: RouteName; label: string; icon: string; index: string }> = [
  { id: 'projects', label: '项目列表', icon: 'projects', index: '01' },
  { id: 'building', label: '建筑与环境', icon: 'building', index: '02' },
  { id: 'glass', label: '玻璃库', icon: 'glass', index: '03' },
  { id: 'reflection', label: '反射分析', icon: 'reflection', index: '04' },
  { id: 'risk', label: '风险评估', icon: 'risk', index: '05' },
  { id: 'measures', label: '措施方案', icon: 'measures', index: '06' },
  { id: 'settings', label: '设置与校验', icon: 'settings', index: '07' },
];

export class BirdApp implements AppContext {
  projects: Project[] = [];
  materials: GlassMaterial[] = [];
  appSettings: AppSettings = { id: 'app', defaultBirdHeight: 6, defaultBirdDirection: 0, defaultSampleCount: 128, reduceMotion: false };
  currentId: ID | null = null;
  route: RouteName = 'projects';
  analysis: AnalysisResult | null = null;
  analysisStatus: 'idle' | 'running' | 'ready' | 'error' = 'idle';
  analysisError: string | null = null;
  selectedObjectId: ID | null = null;

  private root: HTMLElement;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveState: 'idle' | 'saving' | 'saved' = 'idle';
  private pageCleanup: (() => void) | null = null;
  private gpuLabel = '检测 WebGPU…';
  private gpuOk: boolean | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  get current(): Project | null {
    return this.projects.find((p) => p.id === this.currentId) ?? null;
  }

  async init() {
    const seeded = await ensureSeeded();
    this.projects = seeded.projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.materials = seeded.materials;
    this.appSettings = seeded.settings;
    this.currentId = localStorage.getItem('bgs-current-project');
    if (this.currentId && !this.current) this.currentId = null;
    window.addEventListener('hashchange', () => this.parseRouteAndRender());
    this.parseRouteAndRender();
    void this.detectGpu();
    if (this.current) void this.runAnalysis().then(() => this.refreshAnalysisViews());
  }

  private refreshAnalysisViews() {
    if (this.route === 'reflection' || this.route === 'risk' || this.route === 'measures') this.refresh();
  }

  private async detectGpu() {
    const gpu = await getGpuContext();
    this.gpuOk = Boolean(gpu);
    this.gpuLabel = gpu ? gpu.name.slice(0, 34) : 'CPU 参考模式';
    this.updateGpuBadge();
  }

  private updateGpuBadge() {
    const dot = document.querySelector<HTMLElement>('[data-gpu-dot]');
    const label = document.querySelector<HTMLElement>('[data-gpu-label]');
    if (dot) dot.className = `gpu-dot ${this.gpuOk === true ? 'ok' : this.gpuOk === false ? 'cpu' : ''}`;
    if (label) label.textContent = this.gpuLabel;
  }

  private parseRouteAndRender() {
    const hash = window.location.hash.replace(/^#\/?/, '') as RouteName;
    this.route = ROUTES.some((r) => r.id === hash) ? hash : 'projects';
    this.render();
  }

  navigate(route: RouteName, projectId?: ID) {
    if (projectId) this.currentId = projectId;
    if (route === 'projects') window.location.hash = '#/projects';
    else window.location.hash = `#/${route}`;
    if (this.route === route) this.render();
  }

  openProject(id: ID) {
    this.currentId = id;
    localStorage.setItem('bgs-current-project', id);
    this.analysis = null;
    this.analysisStatus = 'idle';
    this.selectedObjectId = null;
    this.navigate('building', id);
    void this.runAnalysis().then(() => this.refreshAnalysisViews());
  }

  setSelectedObject(id: ID | null) {
    this.selectedObjectId = id;
  }

  refresh() {
    this.render();
  }

  mutateProject(mutator: (project: Project) => void, options?: { immediate?: boolean; silent?: boolean }) {
    const project = this.current;
    if (!project) return;
    mutator(project);
    project.updatedAt = new Date().toISOString();
    this.projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveState = 'saving';
    this.updateSaveBadge();
    const persist = () => {
      void dbPutProject(project).then(() => {
        this.saveState = 'saved';
        this.updateSaveBadge();
      });
    };
    if (options?.immediate) persist();
    else this.saveTimer = setTimeout(persist, 650);
  }

  async saveNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.current) await dbPutProject(this.current);
    this.saveState = 'saved';
    this.updateSaveBadge();
  }

  async runAnalysis(): Promise<AnalysisResult | null> {
    const project = this.current;
    if (!project) return null;
    this.analysisStatus = 'running';
    this.analysisError = null;
    this.updateRunBadge();
    await this.saveNow();
    try {
      const result = await evaluateProject(project, this.materials);
      if (this.currentId !== project.id) return null;
      this.analysis = result;
      this.analysisStatus = 'ready';
      this.updateRunBadge();
      return result;
    } catch (error) {
      this.analysisStatus = 'error';
      this.analysisError = error instanceof Error ? error.message : String(error);
      this.toast(`分析失败:${this.analysisError}`, 'error');
      this.updateRunBadge();
      return null;
    }
  }

  async upsertMaterial(material: GlassMaterial) {
    const index = this.materials.findIndex((m) => m.id === material.id);
    if (index >= 0) this.materials[index] = material;
    else this.materials.push(material);
    await dbPutMaterial(material);
  }

  async deleteMaterial(id: ID) {
    this.materials = this.materials.filter((m) => m.id !== id);
    await dbDeleteMaterial(id);
  }

  toast(message: string, tone: 'default' | 'ok' | 'error' = 'default') {
    let stack = document.querySelector('.toast-stack') as HTMLElement | null;
    if (!stack) {
      stack = h('div', { class: 'toast-stack' });
      document.body.appendChild(stack);
    }
    const toast = h('div', { class: `toast ${tone === 'ok' ? 'ok' : tone === 'error' ? 'error' : ''}` }, tone === 'ok' ? icon('check', 17) : null, h('span', null, message));
    stack.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)'; setTimeout(() => toast.remove(), 220); }, 3200);
  }

  private updateSaveBadge() {
    const el = document.querySelector('[data-save-state]');
    if (!el) return;
    el.className = `save-state ${this.saveState === 'saving' ? 'saving' : this.saveState === 'saved' ? 'saved' : ''}`;
    el.textContent = this.saveState === 'saving' ? '自动保存中…' : this.saveState === 'saved' ? '已保存到 IndexedDB' : '编辑会自动保存';
  }

  private updateRunBadge() {
    const el = document.querySelector('[data-run-state]');
    if (!el) return;
    el.textContent = this.analysisStatus === 'running' ? 'GPU 计算中…' : this.analysis?.backend === 'webgpu' ? 'WebGPU 结果' : this.analysis ? 'CPU 参考结果' : '尚未分析';
    el.className = `badge ${this.analysis?.backend === 'webgpu' ? 'ok' : this.analysis ? 'warn' : ''}`;
  }

  private render() {
    this.pageCleanup?.();
    this.pageCleanup = null;
    const currentRoute = ROUTES.find((r) => r.id === this.route)!;
    const saveBadge = h('span', { class: 'save-state', 'data-save-state': 'true' }, '编辑会自动保存');
    const runBadge = h('span', { class: 'badge', 'data-run-state': 'true' }, '尚未分析');
    if (this.saveState === 'saving') { saveBadge.classList.add('saving'); saveBadge.textContent = '自动保存中…'; }
    if (this.saveState === 'saved') { saveBadge.classList.add('saved'); saveBadge.textContent = '已保存到 IndexedDB'; }
    if (this.analysis) { runBadge.classList.add(this.analysis.backend === 'webgpu' ? 'ok' : 'warn'); runBadge.textContent = this.analysis.backend === 'webgpu' ? 'WebGPU 结果' : 'CPU 参考结果'; }

    const exportButton = this.current ? h('button', { class: 'btn sm', onClick: () => exportProjectJson(this.current!, this.materials) }, icon('download', 15), '导出项目') : null;
    const topbar = h('header', { class: 'topbar' },
      h('div', null, h('h1', null, currentRoute.label), h('div', { class: 'subtitle' }, this.current ? this.current.name : '浏览器端建筑玻璃防鸟撞评估工作台')),
      h('div', { class: 'topbar-actions' }, runBadge, saveBadge, exportButton),
    );

    const nav = h('nav', { class: 'nav' }, ...ROUTES.map((item) => h('button', { class: `nav-item ${this.route === item.id ? 'active' : ''}`, onClick: () => this.navigate(item.id) }, icon(item.icon, 18), h('span', null, item.label), h('span', { class: 'nav-index' }, item.index))));
    const sidebar = h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, icon('bird', 24)), h('div', null, h('strong', null, '羽鉴 BirdGlass'), h('span', null, '防鸟撞评估工作台'))),
      nav,
      h('div', { class: 'sidebar-foot' }, h('div', null, h('span', { class: `gpu-dot ${this.gpuOk === true ? 'ok' : this.gpuOk === false ? 'cpu' : ''}`, 'data-gpu-dot': 'true' }), h('span', { 'data-gpu-label': 'true' }, this.gpuLabel)), h('div', { style: 'margin-top:6px;color:#94a3b8' }, 'Fresnel · Compute · IndexedDB')),
    );

    const content = h('main', { class: 'content', id: 'page-content' });
    const shell = h('div', { class: 'app-shell' }, sidebar, h('div', { class: 'main' }, topbar, content));
    this.root.replaceChildren(shell);

    let page: HTMLElement;
    try {
      page = this.renderRoute();
    } catch (error) {
      console.error('Page render failed', error);
      page = h('div', { class: 'card' }, h('div', { class: 'empty-state' }, h('h3', null, '页面渲染出现异常'), h('p', null, error instanceof Error ? error.message : String(error)), h('button', { class: 'btn primary', onClick: () => this.navigate('projects') }, '返回项目列表')));
    }
    content.appendChild(page);
    const cleanup = (page as HTMLElement & { dispose?: () => void }).dispose;
    if (typeof cleanup === 'function') this.pageCleanup = cleanup;
  }

  private renderRoute(): HTMLElement {
    if (this.route === 'projects') return renderProjectsPage(this);
    if (this.route === 'glass') return renderGlassPage(this);
    if (this.route === 'settings') return renderSettingsPage(this);

    if (!this.current) {
      return h('div', { class: 'card' }, h('div', { class: 'empty-state' }, h('div', { class: 'empty-icon' }, icon('projects', 26)), h('h3', null, '请先打开一个项目'), h('p', null, '建筑、反射、风险和措施数据都保存在具体项目中。'), h('button', { class: 'btn primary', onClick: () => this.navigate('projects') }, icon('arrow'), '前往项目列表')));
    }
    if (this.route === 'building') return renderBuildingPage(this);
    if (this.route === 'reflection') return renderReflectionPage(this);
    if (this.route === 'risk') return renderRiskPage(this);
    return renderMeasuresPage(this);
  }
}

export async function startApp(root: HTMLElement) {
  const app = new BirdApp(root);
  await app.init();
  if (!window.location.hash) window.location.hash = '#/projects';
}
