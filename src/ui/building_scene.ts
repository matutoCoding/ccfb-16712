import type { GlassMaterial, Project } from '../types';
import { h, icon } from './dom';
import { GpuSceneRenderer } from '../gpu/renderer';
import { createScene2D, type Scene2DController } from './scene2d';

export interface SceneViewer {
  element: HTMLElement;
  sync: (project: Project, materials: GlassMaterial[], selectedId: string | null) => void;
  dispose: () => void;
}

export function createSceneViewer(onPick: (id: string | null) => void): SceneViewer {
  let canvas = h('canvas', { class: 'scene-canvas', 'aria-label': '建筑与环境三维视图' }) as HTMLCanvasElement;
  const status = h('span', { class: 'badge' }, h('span', { class: 'gpu-dot cpu' }), '正在初始化 WebGPU');
  const overlay = h('div', { class: 'scene-overlay' }, status, h('span', { class: 'badge' }, '拖拽旋转 · 滚轮缩放 · 点击选择'));
  const fallback = h('div', { class: 'webgpu-fallback', hidden: true }, h('div', { class: 'box' },
    h('div', { class: 'empty-icon' }, icon('glass', 26)),
    h('h3', null, 'WebGPU 视图未启动'),
    h('p', { class: 'muted' }, '请使用最新版 Chrome/Edge 并开启 WebGPU。当前已切换 Canvas2D 兼容预览;反射统计仍可使用 CPU 同公式参考模式。'),
  ));
  const element = h('div', { class: 'scene-wrap' }, canvas, overlay, fallback, h('div', { class: 'scene-help' }, '左键旋转 / 滚轮缩放 / 点玻璃标记'));

  let renderer: GpuSceneRenderer | null = null;
  let fallback2d: Scene2DController | null = null;
  let disposed = false;
  let last: { project: Project; materials: GlassMaterial[]; selectedId: string | null } | null = null;

  const start2d = () => {
    if (fallback2d || disposed) return;
    const nextCanvas = h('canvas', { class: 'scene-canvas', 'aria-label': 'Canvas2D 兼容建筑预览' }) as HTMLCanvasElement;
    canvas.replaceWith(nextCanvas);
    canvas = nextCanvas;
    fallback2d = createScene2D(canvas, onPick);
    status.className = 'badge warn';
    status.replaceChildren(h('span', { class: 'gpu-dot cpu' }), 'Canvas2D 兼容视图');
    if (last) fallback2d.sync(last.project, last.materials, last.selectedId);
  };

  const gpuRenderer = new GpuSceneRenderer(canvas);
  gpuRenderer.init().then((ok) => {
    if (disposed) { gpuRenderer.dispose(); return; }
    if (!ok) { start2d(); return; }
    renderer = gpuRenderer;
    renderer.onPick = onPick;
    status.className = 'badge ok';
    status.replaceChildren(h('span', { class: 'gpu-dot ok' }), 'WebGPU 渲染已连接');
    if (last) {
      renderer.setScene(last.project, last.materials, last.selectedId);
      renderer.frameProject(last.project);
    }
  }).catch((error) => {
    console.warn('WebGPU renderer failed, switching to Canvas2D', error);
    gpuRenderer.dispose();
    start2d();
  });

  return {
    element,
    sync(project, materials, selectedId) {
      last = { project, materials, selectedId };
      if (renderer) renderer.setScene(project, materials, selectedId);
      fallback2d?.sync(project, materials, selectedId);
    },
    dispose() {
      disposed = true;
      gpuRenderer.dispose();
      fallback2d?.dispose();
    },
  };
}
