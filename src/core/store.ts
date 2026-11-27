import { create } from 'zustand';
import type { ExportBundle, GlassType, Project, Settings } from './types';
import { idb } from './db';
import { BUILTIN_GLASS } from './glassLibrary';
import { buildSeedProjects, createBlankProject } from './seed';
import { DEFAULT_SETTINGS } from './risk';
import { uid } from './geom';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  text: string;
}

interface AppState {
  ready: boolean;
  projects: Project[];
  glass: GlassType[];
  settings: Settings;
  currentId: string | null;
  saveState: SaveState;
  toasts: Toast[];

  init: () => Promise<void>;
  setCurrent: (id: string | null) => void;
  current: () => Project | undefined;

  createProject: (name?: string) => string;
  duplicateProject: (id: string) => string | null;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (id: string, fn: (p: Project) => void, immediate?: boolean) => void;

  addGlass: (g: GlassType) => void;
  updateGlass: (id: string, patch: Partial<GlassType>) => void;
  deleteGlass: (id: string) => void;
  resetGlass: () => void;

  updateSettings: (patch: Partial<Settings>) => void;

  exportProject: (id: string) => void;
  importBundle: (file: File) => Promise<string>;

  pushToast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleProjectSave(p: Project, immediate = false) {
  const doSave = () => {
    useStore.setState({ saveState: 'saving' });
    idb
      .put('projects', p)
      .then(() => useStore.setState({ saveState: 'saved' }))
      .catch(() => useStore.setState({ saveState: 'error' }));
  };
  if (!useStore.getState().settings.autoSave && !immediate) return;
  if (immediate) {
    const t = saveTimers.get(p.id);
    if (t) clearTimeout(t);
    doSave();
    return;
  }
  useStore.setState({ saveState: 'saving' });
  const old = saveTimers.get(p.id);
  if (old) clearTimeout(old);
  saveTimers.set(
    p.id,
    setTimeout(doSave, 650),
  );
}

/* TypedArray 安全的 JSON 序列化 */
function typedReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Float32Array) return { __typed: 'Float32Array', data: Array.from(value) };
  if (value instanceof Uint32Array) return { __typed: 'Uint32Array', data: Array.from(value) };
  return value;
}
function typedReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__typed' in (value as Record<string, unknown>)) {
    const v = value as { __typed: string; data: number[] };
    if (v.__typed === 'Float32Array') return new Float32Array(v.data);
    if (v.__typed === 'Uint32Array') return new Uint32Array(v.data);
  }
  return value;
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  projects: [],
  glass: BUILTIN_GLASS,
  settings: DEFAULT_SETTINGS,
  currentId: null,
  saveState: 'idle',
  toasts: [],

  init: async () => {
    if (get().ready) return;
    let settings = (await idb.getKv<Settings>('settings')) ?? DEFAULT_SETTINGS;
    settings = { ...DEFAULT_SETTINGS, ...settings, id: 'app-settings' };

    let glass = await idb.getAll<GlassType>('glass');
    if (!glass || glass.length === 0) {
      glass = BUILTIN_GLASS.map((g) => ({ ...g, pattern: { ...g.pattern } }));
      await Promise.all(glass.map((g) => idb.put('glass', g)));
    } else {
      // 合并可能新增的内置玻璃
      const ids = new Set(glass.map((g) => g.id));
      for (const bg of BUILTIN_GLASS) {
        if (!ids.has(bg.id)) {
          glass.push({ ...bg, pattern: { ...bg.pattern } });
          await idb.put('glass', bg);
        }
      }
    }

    let projects = await idb.getAll<Project>('projects');
    if (!projects || projects.length === 0) {
      projects = buildSeedProjects();
      await Promise.all(projects.map((p) => idb.put('projects', p)));
    }
    projects.sort((a, b) => b.updatedAt - a.updatedAt);

    const lastId = await idb.getKv<string>('currentId');
    set({
      ready: true,
      projects,
      glass,
      settings,
      currentId: lastId && projects.some((p) => p.id === lastId) ? lastId : projects[0]?.id ?? null,
    });
  },

  setCurrent: (id) => {
    set({ currentId: id });
    if (id) idb.setKv('currentId', id).catch(() => {});
  },

  current: () => get().projects.find((p) => p.id === get().currentId),

  createProject: (name) => {
    const p = createBlankProject(name?.trim() || `未命名项目 ${new Date().toLocaleDateString('zh-CN')}`);
    set((s) => ({ projects: [p, ...s.projects], currentId: p.id }));
    idb.put('projects', p).catch(() => {});
    idb.setKv('currentId', p.id).catch(() => {});
    get().pushToast('已创建新项目', 'ok');
    return p.id;
  },

  duplicateProject: (id) => {
    const src = get().projects.find((p) => p.id === id);
    if (!src) return null;
    const clone: Project = structuredClone(src);
    clone.id = uid('prj');
    clone.name = `${src.name} · 副本`;
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();
    clone.snapshots = [];
    clone.latestSnapshotId = null;
    set((s) => ({ projects: [clone, ...s.projects], currentId: clone.id }));
    idb.put('projects', clone).catch(() => {});
    get().pushToast('项目已复制', 'ok');
    return clone.id;
  },

  deleteProject: async (id) => {
    await idb.del('projects', id);
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      return { projects, currentId: s.currentId === id ? projects[0]?.id ?? null : s.currentId };
    });
  },

  updateProject: (id, fn, immediate) => {
    let saved: Project | null = null;
    set((s) => {
      const p = s.projects.find((x) => x.id === id);
      if (!p) return {};
      fn(p);
      p.updatedAt = Date.now();
      saved = p;
      return { projects: s.projects.map((x) => (x.id === id ? { ...p } : x)) };
    });
    if (saved) scheduleProjectSave(saved, immediate);
  },

  addGlass: (g) => {
    set((s) => ({ glass: [...s.glass, g] }));
    idb.put('glass', g).catch(() => {});
  },
  updateGlass: (id, patch) => {
    set((s) => ({ glass: s.glass.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
    const g = get().glass.find((x) => x.id === id);
    if (g) idb.put('glass', g).catch(() => {});
  },
  deleteGlass: (id) => {
    set((s) => ({ glass: s.glass.filter((g) => g.id !== id) }));
    idb.del('glass', id).catch(() => {});
  },
  resetGlass: () => {
    const glass = BUILTIN_GLASS.map((g) => ({ ...g, pattern: { ...g.pattern } }));
    set({ glass });
    idb.getAll<GlassType>('glass').then((all) => Promise.all(all.map((g) => idb.del('glass', g.id))));
    Promise.all(glass.map((g) => idb.put('glass', g)));
  },

  updateSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    idb.setKv('settings', get().settings).catch(() => {});
  },

  exportProject: (id) => {
    const p = get().projects.find((x) => x.id === id);
    if (!p) return;
    const used = new Set<string>();
    p.surfaces.forEach((s) => {
      used.add(s.glassTypeId);
      if (s.retrofitGlassTypeId) used.add(s.retrofitGlassTypeId);
    });
    const bundle: ExportBundle = {
      format: 'bird-glass-assessment',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: [p],
      glassTypes: get().glass.filter((g) => used.has(g.id)),
      settings: get().settings,
    };
    const json = JSON.stringify(bundle, typedReplacer, 2);
    downloadText(`${p.name}-防鸟撞评估项目.birdglass.json`, json);
    get().pushToast('项目已导出（含所用玻璃类型）', 'ok');
  },

  importBundle: async (file) => {
    const text = await file.text();
    const bundle = JSON.parse(text, typedReviver) as ExportBundle;
    if (bundle.format !== 'bird-glass-assessment' || !Array.isArray(bundle.projects)) {
      throw new Error('文件格式不正确：缺少 bird-glass-assessment 标识');
    }
    // 合并玻璃库
    for (const g of bundle.glassTypes ?? []) {
      if (!get().glass.some((x) => x.id === g.id)) {
        get().addGlass(g);
      }
    }
    let firstId = '';
    for (const src of bundle.projects) {
      const p: Project = src;
      p.id = uid('prj');
      p.name = src.name.includes('导入') ? src.name : `${src.name}（导入）`;
      p.createdAt = Date.now();
      p.updatedAt = Date.now();
      p.snapshots = [];
      p.latestSnapshotId = null;
      // 防御：确保 typed arrays 正确
      for (const b of p.buildingBodies) {
        if (b.kind === 'obj') {
          if (!(b.positions instanceof Float32Array)) b.positions = new Float32Array(b.positions as unknown as number[]);
          if (!(b.normals instanceof Float32Array)) b.normals = new Float32Array(b.normals as unknown as number[]);
          if (!(b.indices instanceof Uint32Array)) b.indices = new Uint32Array(b.indices as unknown as number[]);
        }
      }
      set((s) => ({ projects: [p, ...s.projects] }));
      await idb.put('projects', p);
      firstId = p.id;
    }
    set({ currentId: firstId });
    idb.setKv('currentId', firstId).catch(() => {});
    get().pushToast('导入成功', 'ok');
    return firstId;
  },

  pushToast: (text, kind = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), 3600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
