import type { GlassMaterial, Project, SceneObject, Vec3 } from '../types';
import { createCylinderObject, createSphereObject } from '../core/geometry';
import { hexToRgb01 } from '../core/math';
import { orbitEye, type CameraOrbit } from '../core/mat4';

export interface Scene2DController {
  sync: (project: Project, materials: GlassMaterial[], selectedId: string | null) => void;
  dispose: () => void;
}

interface TriangleDraw {
  id: string;
  points: Array<[number, number]>;
  depth: number;
  color: [number, number, number];
  alpha: number;
  selected: boolean;
  glass: boolean;
}

export function createScene2D(canvas: HTMLCanvasElement, onPick: (id: string | null) => void): Scene2DController {
  const ctx = canvas.getContext('2d');
  const camera: CameraOrbit = { target: [0, 6, 0], distance: 52, yaw: 0.35, pitch: 0.42 };
  let project: Project | null = null;
  let materials: GlassMaterial[] = [];
  let selectedId: string | null = null;
  let raf = 0;
  let disposed = false;
  const drag = { active: false, x: 0, y: 0, moved: 0 };

  function environmentObjects(p: Project): SceneObject[] {
    const extras: SceneObject[] = [];
    p.trees.forEach((t) => {
      extras.push(createCylinderObject({ name: `${t.name}-树干`, radiusTop: 0.18, radiusBottom: 0.28, height: t.height * 0.48, center: [t.x, t.height * 0.24, t.z], color: '#7c5a3a' }));
      extras.push(createSphereObject({ name: t.name, radius: t.crownRadius, center: [t.x, t.height * 0.62, t.z], color: t.color }));
    });
    p.water.forEach((w) => extras.push({
      id: `water2d-${w.id}`, name: w.name, kind: 'ground', color: w.color, visible: true, source: 'builtin',
      positions: [w.x - w.width / 2, .02, w.z - w.depth / 2, w.x + w.width / 2, .02, w.z - w.depth / 2, w.x + w.width / 2, .02, w.z + w.depth / 2, w.x - w.width / 2, .02, w.z + w.depth / 2],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], indices: [0, 1, 2, 0, 2, 3],
    }));
    return [...p.objects, ...extras];
  }

  function frameProject(p: Project) {
    let min: Vec3 = [Infinity, Infinity, Infinity];
    let max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const o of p.objects) for (let i = 0; i < o.positions.length; i += 3) {
      min = [Math.min(min[0], o.positions[i]), Math.min(min[1], o.positions[i + 1]), Math.min(min[2], o.positions[i + 2])];
      max = [Math.max(max[0], o.positions[i]), Math.max(max[1], o.positions[i + 1]), Math.max(max[2], o.positions[i + 2])];
    }
    if (Number.isFinite(min[0])) {
      camera.target = [(min[0] + max[0]) / 2, Math.max(4, (min[1] + max[1]) * .42), (min[2] + max[2]) / 2];
      camera.distance = Math.max(26, Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 1.65);
    }
  }

  function basis() {
    const eye = orbitEye(camera);
    const f = norm([camera.target[0] - eye[0], camera.target[1] - eye[1], camera.target[2] - eye[2]]);
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    return { eye, f, r, u };
  }

  function projectPoint(p: Vec3, width: number, height: number, b: ReturnType<typeof basis>): [number, number, number] | null {
    const rel = [p[0] - b.eye[0], p[1] - b.eye[1], p[2] - b.eye[2]];
    const z = rel[0] * b.f[0] + rel[1] * b.f[1] + rel[2] * b.f[2];
    if (z < .2) return null;
    const x = rel[0] * b.r[0] + rel[1] * b.r[1] + rel[2] * b.r[2];
    const y = rel[0] * b.u[0] + rel[1] * b.u[1] + rel[2] * b.u[2];
    const scale = height / 2 / Math.tan(Math.PI / 8);
    return [width / 2 + x * scale / z, height / 2 - y * scale / z, z];
  }

  function draw() {
    if (disposed || !ctx || !project) return;
    raf = requestAnimationFrame(draw);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#dff1fb'); grad.addColorStop(.58, '#f4f8fb'); grad.addColorStop(.59, '#e7edf0'); grad.addColorStop(1, '#d7e1e5');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    const b = basis();
    const triangles: TriangleDraw[] = [];
    const materialMap = new Map(materials.map((m) => [m.id, m]));
    for (const obj of environmentObjects(project)) {
      if (obj.visible === false) continue;
      const base = hexToRgb01(obj.color);
      const mat = obj.glass ? materialMap.get(obj.glass.materialId) : undefined;
      for (let i = 0; i < obj.indices.length; i += 3) {
        const verts: Array<[number, number, number]> = [];
        let depth = 0;
        for (let j = 0; j < 3; j++) {
          const idx = obj.indices[i + j] * 3;
          const p: Vec3 = [obj.positions[idx], obj.positions[idx + 1], obj.positions[idx + 2]];
          const q = projectPoint(p, w, h, b);
          if (!q) { verts.length = 0; break; }
          verts.push([q[0], q[1], q[2]]); depth += q[2];
        }
        if (verts.length !== 3) continue;
        const ni = obj.indices[i] * 3;
        const n = norm([obj.normals[ni] ?? 0, obj.normals[ni + 1] ?? 1, obj.normals[ni + 2] ?? 0]);
        const light = .48 + .5 * Math.max(0, n[0] * -.42 + n[1] * .82 + n[2] * .36);
        const coat = mat ? hexToRgb01(mat.coatingColor) : base;
        triangles.push({
          id: obj.id, points: verts.map((v) => [v[0], v[1]]), depth: depth / 3,
          color: mat ? [coat[0] * light + .18, coat[1] * light + .22, coat[2] * light + .28] : base.map((c) => c * light) as [number, number, number],
          alpha: obj.glass ? .78 : 1, selected: obj.id === selectedId, glass: Boolean(obj.glass),
        });
      }
    }
    triangles.sort((a, b2) => b2.depth - a.depth);
    for (const t of triangles) {
      ctx.beginPath(); ctx.moveTo(t.points[0][0], t.points[0][1]); ctx.lineTo(t.points[1][0], t.points[1][1]); ctx.lineTo(t.points[2][0], t.points[2][1]); ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(clamp255(t.color[0]) * 255)},${Math.round(clamp255(t.color[1]) * 255)},${Math.round(clamp255(t.color[2]) * 255)},${t.alpha})`;
      ctx.fill();
      ctx.strokeStyle = t.selected ? '#0f172a' : t.glass ? 'rgba(255,255,255,.65)' : 'rgba(71,85,105,.18)';
      ctx.lineWidth = t.selected ? 2.4 : .7;
      ctx.stroke();
    }
  }

  const down = (e: PointerEvent) => { drag.active = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; canvas.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (!drag.active) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    camera.yaw -= dx * .006; camera.pitch = Math.max(.08, Math.min(1.35, camera.pitch + dy * .005));
  };
  const up = (e: PointerEvent) => {
    if (drag.active && drag.moved < 6) {
      const rect = canvas.getBoundingClientRect();
      onPick(pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height));
    }
    drag.active = false;
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); camera.distance = Math.max(8, Math.min(130, camera.distance * (1 + Math.sign(e.deltaY) * .08))); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); window.addEventListener('pointerup', up); canvas.addEventListener('wheel', wheel, { passive: false });

  function pick(x: number, y: number, width: number, height: number): string | null {
    if (!project) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const px = x * dpr, py = y * dpr;
    let best = Infinity, id: string | null = null;
    for (const obj of project.objects) {
      for (let i = 0; i < obj.indices.length; i += 3) {
        const pts: Array<[number, number]> = [];
        let depth = 0;
        const b = basis();
        for (let j = 0; j < 3; j++) {
          const idx = obj.indices[i + j] * 3;
          const q = projectPoint([obj.positions[idx], obj.positions[idx + 1], obj.positions[idx + 2]], width * dpr, height * dpr, b);
          if (!q) { pts.length = 0; break; }
          pts.push([q[0] / dpr, q[1] / dpr]); depth += q[2];
        }
        if (pts.length === 3 && pointInTriangle(x, y, pts[0], pts[1], pts[2]) && depth / 3 < best) { best = depth / 3; id = obj.id; }
      }
    }
    return id;
  }

  raf = requestAnimationFrame(draw);
  return {
    sync(p, m, s) {
      const first = !project;
      project = p; materials = m; selectedId = s;
      if (first) frameProject(p);
    },
    dispose() {
      disposed = true; cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); canvas.removeEventListener('wheel', wheel);
    },
  };
}

function norm(v: Vec3): Vec3 { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function clamp255(v: number) { return Math.max(0, Math.min(1, v)); }
function pointInTriangle(p: number, q: number, a: [number, number], b: [number, number], c: [number, number]) {
  const d1 = sign(p, q, a, b), d2 = sign(p, q, b, c), d3 = sign(p, q, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0, hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
function sign(px: number, py: number, a: [number, number], b: [number, number]) { return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]); }
