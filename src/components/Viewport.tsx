import { useEffect, useRef, useState } from 'react';
import type { GlassType, Project } from '../core/types';
import { getDevice } from '../gpu/wgpuContext';
import { Renderer3D, type ViewMode } from '../gpu/Renderer3D';
import { Renderer2DFallback } from '../gpu/Renderer2DFallback';

interface Props {
  project: Project;
  glass: GlassType[];
  mode: ViewMode;
  riskMap?: Map<string, number>;
  selectedId?: string | null;
  onPick?: (id: string | null) => void;
  height?: number | string;
}

type AnyRenderer = Renderer3D | Renderer2DFallback;

export function Viewport({ project, glass, mode, riskMap, selectedId, onPick, height = 460 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<AnyRenderer | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [engine, setEngine] = useState<'loading' | 'webgpu' | '2d'>('loading');
  const [error, setError] = useState<string>('');

  // 仅在项目 id 变化时重建渲染器
  const projectId = project.id;
  useEffect(() => {
    let cancelled = false;
    let renderer: AnyRenderer | null = null;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const device = await getDevice();
      if (cancelled) return;
      try {
        if (device) {
          const r = new Renderer3D(canvas);
          await r.init(device);
          if (cancelled) {
            r.dispose();
            return;
          }
          renderer = r;
          rendererRef.current = r;
          (window as unknown as { __renderer?: unknown }).__renderer = r;
          setEngine('webgpu');
        } else {
          const r = new Renderer2DFallback(canvas);
          await r.init();
          if (cancelled) {
            r.dispose();
            return;
          }
          renderer = r;
          rendererRef.current = r;
          setEngine('2d');
        }
        renderer.onPick = (id) => pickRef.current?.(id);
        renderer.setProject(project, glass);
        if (renderer instanceof Renderer3D) renderer.frameProject();
        renderer.setMode(mode);
        if (riskMap) renderer.setRiskMap(riskMap);
        renderer.setSelected(selectedId ?? null);
      } catch (e) {
        console.error(e);
        setError((e as Error).message);
        // WebGPU 管线失败时降级
        if (!cancelled && canvas) {
          const r = new Renderer2DFallback(canvas);
          renderer = r;
          rendererRef.current = r;
          renderer.onPick = (id) => pickRef.current?.(id);
          r.setProject(project, glass);
          setEngine('2d');
        }
      }
    })();
    return () => {
      cancelled = true;
      renderer?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    rendererRef.current?.setGlass(glass);
  }, [glass]);

  useEffect(() => {
    if (riskMap) rendererRef.current?.setRiskMap(riskMap);
  }, [riskMap]);

  useEffect(() => {
    rendererRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    rendererRef.current?.setSelected(selectedId ?? null);
  }, [selectedId]);

  // 项目几何被编辑后（引用变化）重建场景
  useEffect(() => {
    rendererRef.current?.setProject(project, glass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  return (
    <div className="viewport-wrap" style={{ height }}>
      <canvas ref={canvasRef} className="viewport-canvas" />
      <div className="viewport-badge">
        {engine === 'webgpu' ? (
          <span className="badge badge-gpu">● WebGPU 硬件渲染</span>
        ) : engine === '2d' ? (
          <span className="badge badge-cpu">● Canvas2D 兼容模式</span>
        ) : (
          <span className="badge">初始化图形引擎…</span>
        )}
      </div>
      {error && <div className="viewport-error">WebGPU 管线异常，已切换兼容视图：{error}</div>}
      <div className="viewport-hint">左键旋转 · 滚轮缩放 · Shift/右键平移 · 单击玻璃查看</div>
    </div>
  );
}
