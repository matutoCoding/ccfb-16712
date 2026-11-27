import type { GlassType, Project, Vec3 } from '../core/types';
import { heatColor } from '../core/geom';
import { orbitEye, mat4LookAt, mat4Multiply, mat4Perspective, type Mat4 } from '../core/mat4';
import type { ViewMode } from './Renderer3D';

interface Proj {
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}

/** WebGPU 不可用时的 Canvas2D 轴测/透视降级视图，支持旋转与点选。 */
export class Renderer2DFallback {
  canvas: HTMLCanvasElement;
  onPick?: (id: string | null) => void;
  private ctx: CanvasRenderingContext2D;
  private project?: Project;
  private glass: GlassType[] = [];
  private risk = new Map<string, number>();
  private selected: string | null = null;
  private mode: ViewMode = 'material';
  private raf = 0;
  yaw = 0.7;
  pitch = 0.45;
  distance = 75;
  target: Vec3 = { x: 0, y: 9, z: 0 };
  private mvp: Mat4 = new Float32Array(16);
  private w = 800;
  private h = 600;
  private dpr = 1;
  private dragging = false;
  private moved = false;
  private lx = 0;
  private ly = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  async init() {
    /* 同步渲染器，保留与 Renderer3D 相同的初始化接口 */
  }
  setProject(p: Project, g: GlassType[]) {
    this.project = p;
    this.glass = g;
  }
  setGlass(g: GlassType[]) {
    this.glass = g;
  }
  setRiskMap(m: Map<string, number>) {
    this.risk = m;
  }
  setMode(m: ViewMode) {
    this.mode = m;
  }
  setSelected(id: string | null) {
    this.selected = id;
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('wheel', this.wheel);
  }

  private down = (e: PointerEvent) => {
    this.dragging = true;
    this.moved = false;
    this.lx = e.clientX;
    this.ly = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  };
  private move = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lx;
    const dy = e.clientY - this.ly;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
    this.lx = e.clientX;
    this.ly = e.clientY;
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(0.08, Math.min(1.4, this.pitch + dy * 0.005));
  };
  private up = (e: PointerEvent) => {
    if (this.dragging && !this.moved) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.onPick?.(this.pick(mx, my));
    }
    this.dragging = false;
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = Math.max(10, Math.min(240, this.distance * Math.exp(e.deltaY * 0.001)));
  };

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.w !== Math.floor(w * dpr) || this.h !== Math.floor(h * dpr) || this.dpr !== dpr) {
      this.dpr = dpr;
      this.w = Math.floor(w * dpr);
      this.h = Math.floor(h * dpr);
      this.canvas.width = this.w;
      this.canvas.height = this.h;
    }
  }

  private proj(p: Vec3): Proj {
    const m = this.mvp;
    const cx = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
    const cy = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    const cz = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
    const cw = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    if (cw <= 0.05) return { x: 0, y: 0, depth: cz, visible: false };
    const nx = cx / cw;
    const ny = cy / cw;
    return {
      x: (nx * 0.5 + 0.5) * this.w,
      y: (-ny * 0.5 + 0.5) * this.h,
      depth: cw,
      visible: cz >= -1 && cz <= 1,
    };
  }

  private pick(mx: number, my: number): string | null {
    if (!this.project) return null;
    const x = mx * this.dpr;
    const y = my * this.dpr;
    let best = Infinity;
    let id: string | null = null;
    for (const s of this.project.surfaces) {
      const pts = s.corners.map((c) => this.proj(c));
      if (pts.some((p) => !p.visible)) continue;
      if (pointInPoly(x, y, pts.map((p) => [p.x, p.y]))) {
        const d = pts.reduce((a, p) => a + p.depth, 0) / 4;
        if (d < best) {
          best = d;
          id = s.id;
        }
      }
    }
    return id;
  }

  private draw() {
    this.resize();
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    if (!W || !H) return;
    const eye = orbitEye(this.target, this.yaw, this.pitch, this.distance);
    const proj = mat4Perspective((45 * Math.PI) / 180, W / H, 0.1, 600);
    const view = mat4LookAt(eye, this.target, { x: 0, y: 1, z: 0 });
    this.mvp = mat4Multiply(proj, view);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#e8f1f8');
    bg.addColorStop(1, '#f4f6f8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 地面网格
    ctx.strokeStyle = 'rgba(90,110,130,0.28)';
    ctx.lineWidth = 1;
    for (let i = -50; i <= 50; i += 5) {
      this.line({ x: i, y: 0.02, z: -50 }, { x: i, y: 0.02, z: 50 });
      this.line({ x: -50, y: 0.02, z: i }, { x: 50, y: 0.02, z: i });
    }

    if (!this.project) return;
    const glassMap = new Map(this.glass.map((g) => [g.id, g]));

    type Draw = { depth: number; draw: () => void };
    const list: Draw[] = [];

    // 建筑盒体
    for (const b of this.project.buildingBodies) {
      if (b.kind !== 'box') continue;
      const { center: c, size: s } = b;
      const corners: Vec3[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
        corners.push({ x: c.x + (sx * s.x) / 2, y: c.y + (sy * s.y) / 2, z: c.z + (sz * s.z) / 2 });
      // 0:--- 1:--+? order from nested loops sx outer, sy mid, sz inner
      const idx = (sx: number, sy: number, sz: number) =>
        (sx < 0 ? 0 : 4) + (sy < 0 ? 0 : 2) + (sz < 0 ? 0 : 1);
      const faces = [
        [idx(1, -1, -1), idx(1, 1, -1), idx(1, 1, 1), idx(1, -1, 1)],
        [idx(-1, -1, 1), idx(-1, 1, 1), idx(-1, 1, -1), idx(-1, -1, -1)],
        [idx(-1, 1, -1), idx(-1, 1, 1), idx(1, 1, 1), idx(1, 1, -1)],
        [idx(-1, -1, 1), idx(-1, -1, -1), idx(1, -1, -1), idx(1, -1, 1)],
        [idx(1, -1, 1), idx(1, 1, 1), idx(-1, 1, 1), idx(-1, -1, 1)],
        [idx(-1, -1, -1), idx(-1, 1, -1), idx(1, 1, -1), idx(1, -1, -1)],
      ];
      const col = b.color ?? '#cdd5dc';
      for (const f of faces) {
        const ps = f.map((i) => this.proj(corners[i]));
        if (ps.some((p) => !p.visible)) continue;
        const depth = ps.reduce((a, p) => a + p.depth, 0) / 4;
        list.push({
          depth,
          draw: () => {
            ctx.beginPath();
            ctx.moveTo(ps[0].x, ps[0].y);
            ps.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.92;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(60,75,90,0.5)';
            ctx.lineWidth = 1 * this.dpr;
            ctx.stroke();
          },
        });
      }
    }

    // 树木（公告板圆）
    for (const e of this.project.environment) {
      if (e.kind !== 'tree') continue;
      const base = this.proj(e.position);
      const top = this.proj({ x: e.position.x, y: e.heightM, z: e.position.z });
      const depth = base.depth;
      list.push({
        depth,
        draw: () => {
          const rPx = Math.abs(base.y - top.y) * 0.55;
          ctx.fillStyle = '#7a5a3c';
          ctx.fillRect(base.x - rPx * 0.12, top.y + rPx * 0.7, rPx * 0.24, base.y - top.y * 0 - rPx * 0.2);
          ctx.beginPath();
          ctx.arc(base.x, top.y + rPx, rPx, 0, Math.PI * 2);
          ctx.fillStyle = e.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(30,70,40,0.5)';
          ctx.stroke();
        },
      });
    }

    // 玻璃
    for (const s of this.project.surfaces) {
      const ps = s.corners.map((c) => this.proj(c));
      if (ps.some((p) => !p.visible)) continue;
      const depth = ps.reduce((a, p) => a + p.depth, 0) / 4;
      const score = this.risk.get(s.id) ?? 0;
      const glass = glassMap.get(s.glassTypeId);
      list.push({
        depth,
        draw: () => {
          ctx.beginPath();
          ctx.moveTo(ps[0].x, ps[0].y);
          ps.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          if (this.mode === 'heatmap') {
            const [r, g, b] = heatColor(score / 100);
            ctx.fillStyle = `rgba(${r},${g},${b},0.82)`;
          } else {
            ctx.fillStyle = glass?.coatingColor ?? '#9fc3d8';
            ctx.globalAlpha = 0.55;
          }
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = this.selected === s.id ? '#f59e0b' : 'rgba(20,45,70,0.6)';
          ctx.lineWidth = (this.selected === s.id ? 2 : 1) * this.dpr;
          ctx.stroke();
        },
      });
    }

    list.sort((a, b) => b.depth - a.depth);
    list.forEach((d) => d.draw());

    // 角标
    ctx.fillStyle = 'rgba(30,45,60,0.75)';
    ctx.font = `${12 * this.dpr}px system-ui`;
    ctx.fillText('Canvas2D 兼容视图（WebGPU 不可用）', 12 * this.dpr, 22 * this.dpr);
  }

  private line(a: Vec3, b: Vec3) {
    const pa = this.proj(a);
    const pb = this.proj(b);
    if (!pa.visible || !pb.visible) return;
    this.ctx.beginPath();
    this.ctx.moveTo(pa.x, pa.y);
    this.ctx.lineTo(pb.x, pb.y);
    this.ctx.stroke();
  }
}

function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
