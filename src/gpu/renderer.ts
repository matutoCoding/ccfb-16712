import type { GlassMaterial, Project, SceneObject } from '../types';
import { getGpuContext } from './device';
import { SCENE_WGSL } from './scene_wgsl';
import { createCylinderObject, createSphereObject } from '../core/geometry';
import { hexToRgb01 } from '../core/math';
import { multiply, orbitEye, perspective, lookAt, type CameraOrbit } from '../core/mat4';

const VERTEX_WORDS = 24;
const MAX_TREE_SPHERES = 48;

export class GpuSceneRenderer {
  private canvas: HTMLCanvasElement;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private uniformBuffer!: GPUBuffer;
  private treeBuffer!: GPUBuffer;
  private bindGroup0!: GPUBindGroup;
  private bindGroup1!: GPUBindGroup;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexCount = 0;
  private depthTexture: GPUTexture | null = null;
  private raf = 0;
  private disposed = false;
  private treeData = new Float32Array(MAX_TREE_SPHERES * 4);
  private materials: GlassMaterial[] = [];
  private project: Project | null = null;
  private selectedId: string | null = null;
  camera: CameraOrbit = { target: [0, 6, 0], distance: 48, yaw: 0.35, pitch: 0.42 };
  onPick?: (id: string | null) => void;
  private drag = { active: false, x: 0, y: 0, moved: 0, button: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(): Promise<boolean> {
    const gpu = await getGpuContext();
    if (!gpu) return false;
    this.device = gpu.device;
    const context = this.canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) return false;
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });

    const module = this.device.createShaderModule({ code: SCENE_WGSL });
    this.pipeline = await this.device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: VERTEX_WORDS * 4,
          stepMode: 'vertex',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 48, format: 'float32x4' },
            { shaderLocation: 4, offset: 64, format: 'float32x4' },
            { shaderLocation: 5, offset: 80, format: 'float32x3' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });

    this.uniformBuffer = this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.treeBuffer = this.device.createBuffer({ size: MAX_TREE_SPHERES * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.bindGroup0 = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }] });
    this.bindGroup1 = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: this.treeBuffer } }] });

    this.attachControls();
    this.loop();
    return true;
  }

  setScene(project: Project, materials: GlassMaterial[], selectedId: string | null) {
    this.project = project;
    this.materials = materials;
    this.selectedId = selectedId;
    if (!this.device) return;
    const renderObjects = this.buildEnvironmentObjects(project);
    const vertices: number[] = [];
    const materialMap = new Map(materials.map((m) => [m.id, m]));

    for (const obj of renderObjects) {
      if (obj.visible === false) continue;
      const color = hexToRgb01(obj.color);
      const glass = obj.glass ? materialMap.get(obj.glass.materialId) ?? materials[0] : undefined;
      for (const index of obj.indices) {
        const p = index * 3;
        const n = index * 3;
        const pos = [obj.positions[p], obj.positions[p + 1], obj.positions[p + 2]];
        const normal = [obj.normals[n] ?? 0, obj.normals[n + 1] ?? 1, obj.normals[n + 2] ?? 0];
        vertices.push(pos[0], pos[1], pos[2]);
        vertices.push(normal[0], normal[1], normal[2]);
        vertices.push(color[0], color[1], color[2]);
        vertices.push(0, 0, 0);
        if (obj.glass && glass) {
          const pattern = this.packPattern(glass);
          const pc = hexToRgb01(glass.pattern.color);
          vertices.push(1, glass.reflectance, glass.transmittance, glass.ior);
          vertices.push(...pattern);
          vertices.push(pc[0], pc[1], pc[2], 0);
        } else {
          vertices.push(obj.id === selectedId ? -1 : 0, 0, 0, 1);
          vertices.push(0, 1, 1, 0.01);
          vertices.push(0, 0, 0, 0);
        }
        if (obj.id === selectedId && obj.glass) {
          vertices[vertices.length - 24 + 12] = 2;
        }
      }
    }

    this.vertexCount = vertices.length / VERTEX_WORDS;
    if (this.vertexBuffer) this.vertexBuffer.destroy();
    this.vertexBuffer = this.device.createBuffer({ size: Math.max(vertices.length * 4, 4), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array(vertices));

    this.treeData.fill(0);
    project.trees.slice(0, MAX_TREE_SPHERES).forEach((t, i) => {
      this.treeData.set([t.x, t.height * 0.62, t.z, t.crownRadius], i * 4);
    });
    this.device.queue.writeBuffer(this.treeBuffer, 0, this.treeData);
  }

  frameProject(project: Project) {
    let min: [number, number, number] = [Infinity, Infinity, Infinity];
    let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const o of project.objects) {
      for (let i = 0; i < o.positions.length; i += 3) {
        min = [Math.min(min[0], o.positions[i]), Math.min(min[1], o.positions[i + 1]), Math.min(min[2], o.positions[i + 2])];
        max = [Math.max(max[0], o.positions[i]), Math.max(max[1], o.positions[i + 1]), Math.max(max[2], o.positions[i + 2])];
      }
    }
    if (!Number.isFinite(min[0])) return;
    this.camera.target = [(min[0] + max[0]) / 2, Math.max(4, (min[1] + max[1]) * 0.42), (min[2] + max[2]) / 2];
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    this.camera.distance = Math.max(24, size * 1.55);
  }

  private packPattern(m: GlassMaterial): [number, number, number, number] {
    const p = m.pattern;
    if (p.kind === 'dots') return [1, p.spacingXMm / 1000, p.spacingYMm / 1000, p.dotRadiusMm / 1000];
    if (p.kind === 'stripes') return [p.orientation === 'vertical' ? 3 : 2, p.spacingXMm / 1000, p.spacingYMm / 1000, p.stripeWidthMm / 1000];
    if (p.kind === 'grid') return [4, p.spacingXMm / 1000, p.spacingYMm / 1000, p.stripeWidthMm / 1000];
    return [0, 1, 1, 0.01];
  }

  private buildEnvironmentObjects(project: Project): SceneObject[] {
    const extras: SceneObject[] = [];
    project.trees.forEach((t) => {
      extras.push(createCylinderObject({ name: `${t.name}-树干`, radiusTop: 0.18, radiusBottom: 0.28, height: t.height * 0.48, center: [t.x, t.height * 0.24, t.z], color: '#7c5a3a' }));
      extras.push(createSphereObject({ name: t.name, radius: t.crownRadius, center: [t.x, t.height * 0.62, t.z], color: t.color }));
    });
    project.water.forEach((w) => {
      extras.push({
        id: `water-mesh-${w.id}`, name: w.name, kind: 'ground', color: w.color, visible: true, source: 'builtin',
        positions: [
          w.x - w.width / 2, 0.015, w.z - w.depth / 2,
          w.x + w.width / 2, 0.015, w.z - w.depth / 2,
          w.x + w.width / 2, 0.015, w.z + w.depth / 2,
          w.x - w.width / 2, 0.015, w.z + w.depth / 2,
        ],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        indices: [0, 1, 2, 0, 2, 3],
      });
    });
    return [...project.objects, ...extras];
  }

  private attachControls() {
    this.canvas.addEventListener('pointerdown', this.handleDown);
    this.canvas.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  private handleDown = (e: PointerEvent) => {
    this.drag = { active: true, x: e.clientX, y: e.clientY, moved: 0, button: e.button };
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private handleMove = (e: PointerEvent) => {
    if (!this.drag.active) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.camera.yaw -= dx * 0.006;
    this.camera.pitch = Math.max(0.08, Math.min(1.35, this.camera.pitch + dy * 0.005));
  };

  private handleUp = (e: PointerEvent) => {
    if (this.drag.active && this.drag.moved < 6 && e.target === this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.onPick?.(this.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height));
    }
    this.drag.active = false;
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camera.distance = Math.max(8, Math.min(120, this.camera.distance * (1 + Math.sign(e.deltaY) * 0.08)));
  };

  pick(x: number, y: number, width: number, height: number): string | null {
    if (!this.project) return null;
    const ndcX = (x / width) * 2 - 1;
    const ndcY = 1 - (y / height) * 2;
    const eye = orbitEye(this.camera);
    const forward = normalize3([this.camera.target[0] - eye[0], this.camera.target[1] - eye[1], this.camera.target[2] - eye[2]]);
    const right = normalize3(cross3(forward, [0, 1, 0]));
    const up = cross3(right, forward);
    const tan = Math.tan((45 * Math.PI) / 360);
    const aspect = width / height;
    const dir = normalize3([
      forward[0] + right[0] * ndcX * tan * aspect + up[0] * ndcY * tan,
      forward[1] + right[1] * ndcX * tan * aspect + up[1] * ndcY * tan,
      forward[2] + right[2] * ndcX * tan * aspect + up[2] * ndcY * tan,
    ]);

    let bestT = Infinity;
    let bestId: string | null = null;
    for (const obj of this.project.objects) {
      for (let i = 0; i < obj.indices.length; i += 3) {
        const a = readVec(obj.positions, obj.indices[i]);
        const b = readVec(obj.positions, obj.indices[i + 1]);
        const c = readVec(obj.positions, obj.indices[i + 2]);
        const t = rayTriangle(eye, dir, a, b, c);
        if (t !== null && t < bestT) { bestT = t; bestId = obj.id; }
      }
    }
    return bestId;
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.depthTexture?.destroy();
      this.depthTexture = this.device.createTexture({ size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.device || !this.vertexBuffer) return;
    this.resize();
    const eye = orbitEye(this.camera);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = perspective((45 * Math.PI) / 180, aspect, 0.1, 260);
    const view = lookAt(eye, this.camera.target, [0, 1, 0]);
    const viewProj = multiply(proj, view);
    const uniforms = new Float32Array(24);
    uniforms.set(viewProj, 0);
    uniforms.set([eye[0], eye[1], eye[2], 1], 16);
    uniforms.set([performance.now() / 1000, 0, 0, 0], 20);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: 0.925, g: 0.953, b: 0.972, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthTexture!.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.setBindGroup(1, this.bindGroup1);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.vertexBuffer?.destroy();
    this.depthTexture?.destroy();
    this.uniformBuffer?.destroy();
    this.treeBuffer?.destroy();
  }
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function readVec(arr: number[], index: number): [number, number, number] {
  return [arr[index * 3], arr[index * 3 + 1], arr[index * 3 + 2]];
}
function rayTriangle(origin: [number, number, number], dir: [number, number, number], a: [number, number, number], b: [number, number, number], c: [number, number, number]): number | null {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = cross3(dir, e2 as [number, number, number]);
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-7) return null;
  const inv = 1 / det;
  const tvec = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = (tvec[0] * p[0] + tvec[1] * p[1] + tvec[2] * p[2]) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross3(tvec as [number, number, number], e1 as [number, number, number]);
  const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > 0.05 ? t : null;
}
