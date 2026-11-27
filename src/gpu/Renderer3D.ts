import type { GlassSurface, GlassType, Project, Vec3 } from '../core/types';
import { heatColor, hexToRgb01 } from '../core/geom';
import { orbitEye } from '../core/mat4';
import { mat4LookAt, mat4Multiply, mat4Perspective } from '../core/mat4';

interface GeoVertex {
  p: Vec3;
  n: Vec3;
  c: [number, number, number];
}

class GeoBuilder {
  v: number[] = [];
  tri(a: GeoVertex, b: GeoVertex, c: GeoVertex) {
    for (const x of [a, b, c]) this.v.push(x.p.x, x.p.y, x.p.z, x.n.x, x.n.y, x.n.z, x.c[0], x.c[1], x.c[2]);
  }
  get float32() {
    return new Float32Array(this.v);
  }
}

function addBox(g: GeoBuilder, center: Vec3, size: Vec3, color: [number, number, number]) {
  const [hx, hy, hz] = [size.x / 2, size.y / 2, size.z / 2];
  const faces: { n: Vec3; pts: Vec3[] }[] = [
    { n: { x: 1, y: 0, z: 0 }, pts: [{ x: hx, y: -hy, z: -hz }, { x: hx, y: hy, z: -hz }, { x: hx, y: hy, z: hz }, { x: hx, y: -hy, z: hz }] },
    { n: { x: -1, y: 0, z: 0 }, pts: [{ x: -hx, y: -hy, z: hz }, { x: -hx, y: hy, z: hz }, { x: -hx, y: hy, z: -hz }, { x: -hx, y: -hy, z: -hz }] },
    { n: { x: 0, y: 1, z: 0 }, pts: [{ x: -hx, y: hy, z: -hz }, { x: -hx, y: hy, z: hz }, { x: hx, y: hy, z: hz }, { x: hx, y: hy, z: -hz }] },
    { n: { x: 0, y: -1, z: 0 }, pts: [{ x: -hx, y: -hy, z: hz }, { x: -hx, y: -hy, z: -hz }, { x: hx, y: -hy, z: -hz }, { x: hx, y: -hy, z: hz }] },
    { n: { x: 0, y: 0, z: 1 }, pts: [{ x: hx, y: -hy, z: hz }, { x: hx, y: hy, z: hz }, { x: -hx, y: hy, z: hz }, { x: -hx, y: -hy, z: hz }] },
    { n: { x: 0, y: 0, z: -1 }, pts: [{ x: -hx, y: -hy, z: -hz }, { x: -hx, y: hy, z: -hz }, { x: hx, y: hy, z: -hz }, { x: hx, y: -hy, z: -hz }] },
  ];
  for (const f of faces) {
    const w = f.pts.map((p) => ({ x: p.x + center.x, y: p.y + center.y, z: p.z + center.z }));
    g.tri({ p: w[0], n: f.n, c: color }, { p: w[1], n: f.n, c: color }, { p: w[2], n: f.n, c: color });
    g.tri({ p: w[0], n: f.n, c: color }, { p: w[2], n: f.n, c: color }, { p: w[3], n: f.n, c: color });
  }
}

function addSphere(g: GeoBuilder, c: Vec3, r: number, color: [number, number, number], lat = 7, lon = 10) {
  for (let i = 0; i < lat; i++) {
    const t0 = (i / lat) * Math.PI;
    const t1 = ((i + 1) / lat) * Math.PI;
    for (let j = 0; j < lon; j++) {
      const p0 = (j / lon) * Math.PI * 2;
      const p1 = ((j + 1) / lon) * Math.PI * 2;
      const pt = (t: number, p: number): GeoVertex => {
        const n = { x: Math.sin(t) * Math.cos(p), y: Math.cos(t), z: Math.sin(t) * Math.sin(p) };
        return { p: { x: c.x + n.x * r, y: c.y + n.y * r, z: c.z + n.z * r }, n, c: color };
      };
      const a = pt(t0, p0);
      const b = pt(t1, p0);
      const cc = pt(t1, p1);
      const d = pt(t0, p1);
      g.tri(a, b, cc);
      g.tri(a, cc, d);
    }
  }
}

function addCylinder(g: GeoBuilder, c: Vec3, radius: number, h: number, color: [number, number, number], seg = 7) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const n0 = { x: Math.cos(a0), y: 0, z: Math.sin(a0) };
    const n1 = { x: Math.cos(a1), y: 0, z: Math.sin(a1) };
    const p = (n: Vec3, y: number): Vec3 => ({ x: c.x + n.x * radius, y, z: c.z + n.z * radius });
    const y0 = c.y - h / 2;
    const y1 = c.y + h / 2;
    g.tri({ p: p(n0, y0), n: n0, c: color }, { p: p(n1, y0), n: n1, c: color }, { p: p(n1, y1), n: n1, c: color });
    g.tri({ p: p(n0, y0), n: n0, c: color }, { p: p(n1, y1), n: n1, c: color }, { p: p(n0, y1), n: n0, c: color });
  }
}

const OPAQUE_WGSL = /* wgsl */ `
struct U { mvp: mat4x4<f32>, cam: vec3<f32>, mode: f32 }
@group(0) @binding(0) var<uniform> u: U;
struct VIn { @location(0) p: vec3<f32>, @location(1) n: vec3<f32>, @location(2) c: vec3<f32> };
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) c: vec3<f32>, @location(1) n: vec3<f32>, @location(2) wp: vec3<f32> };
@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  o.pos = u.mvp * vec4<f32>(v.p, 1.0);
  o.c = v.c; o.n = v.n; o.wp = v.p;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let n = normalize(v.n);
  let l = normalize(vec3<f32>(0.45, 0.8, 0.35));
  let d = max(dot(n, l), 0.0);
  let col = v.c * (0.6 + 0.5 * d) * (0.82 + 0.18 * (n.y * 0.5 + 0.5)) + vec3<f32>(0.04);
  return vec4<f32>(pow(col, vec3<f32>(0.96)), 1.0);
}
`;

const GLASS_WGSL = /* wgsl */ `
struct U { mvp: mat4x4<f32>, cam: vec3<f32>, mode: f32 }
@group(0) @binding(0) var<uniform> u: U;
struct VIn {
  @location(0) p: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) coat: vec3<f32>,
  @location(3) d0: vec4<f32>,
  @location(4) pat: vec4<f32>,
  @location(5) patc: vec3<f32>,
  @location(6) local: vec2<f32>,
};
struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) wp: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) coat: vec3<f32>,
  @location(3) d0: vec4<f32>,
  @location(4) pat: vec4<f32>,
  @location(5) patc: vec3<f32>,
  @location(6) local: vec2<f32>,
};
@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  o.pos = u.mvp * vec4<f32>(v.p, 1.0);
  o.wp = v.p; o.n = v.n; o.coat = v.coat; o.d0 = v.d0; o.pat = v.pat; o.patc = v.patc; o.local = v.local;
  return o;
}
fn fresnelDielectric(cosIIn: f32, ior: f32) -> f32 {
  let cosI = clamp(cosIIn, 0.0, 1.0);
  let n1 = 1.0; let n2 = max(ior, 1.0001);
  if (cosI <= 1e-7) { return 1.0; }
  let sinT2 = (n1*n1)/(n2*n2) * (1.0 - cosI*cosI);
  if (sinT2 > 1.0) { return 1.0; }
  let cosT = sqrt(max(0.0, 1.0 - sinT2));
  let rsA = (n1*cosI - n2*cosT)/(n1*cosI + n2*cosT);
  let rpA = (n2*cosI - n1*cosT)/(n2*cosI + n1*cosT);
  return clamp((rsA*rsA + rpA*rpA)*0.5, 0.0, 1.0);
}
fn heat(t: f32) -> vec3<f32> {
  let x = clamp(t, 0.0, 1.0);
  if (x < 0.25) { return mix(vec3<f32>(0.145,0.388,0.922), vec3<f32>(0.055,0.651,0.914), x/0.25); }
  if (x < 0.5) { return mix(vec3<f32>(0.055,0.651,0.914), vec3<f32>(0.98,0.8,0.082), (x-0.25)/0.25); }
  if (x < 0.75) { return mix(vec3<f32>(0.98,0.8,0.082), vec3<f32>(0.976,0.451,0.086), (x-0.5)/0.25); }
  return mix(vec3<f32>(0.976,0.451,0.086), vec3<f32>(0.863,0.149,0.149), (x-0.75)/0.25);
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let V = normalize(u.cam - v.wp);
  var N = normalize(v.n);
  var cosI = dot(N, V);
  if (cosI < 0.0) { N = -N; cosI = -cosI; }
  cosI = clamp(cosI, 0.0, 1.0);
  let R = fresnelDielectric(cosI, v.d0.x);
  let rd = 2.0 * cosI * N - V;

  // 程序化天空/地面环境
  var env: vec3<f32>;
  if (rd.y >= 0.0) {
    let skyT = pow(clamp(rd.y, 0.0, 1.0), 0.55);
    env = mix(vec3<f32>(0.80,0.89,0.96), vec3<f32>(0.16,0.42,0.70), skyT);
    let sun = max(dot(rd, normalize(vec3<f32>(0.5,0.6,0.3))), 0.0);
    env = env + vec3<f32>(1.0,0.95,0.8) * pow(sun, 220.0) * 1.4;
  } else {
    env = mix(vec3<f32>(0.42,0.47,0.42), vec3<f32>(0.30,0.34,0.30), clamp(-rd.y*3.0,0.0,1.0));
  }

  // 防鸟图案（米制局部坐标）
  var mark = 0.0;
  let ptype = v.pat.x;
  if (ptype > 0.5 && ptype < 1.5) {
    let sx = max(v.pat.z, 1e-3); let sy = max(v.pat.w, 1e-3);
    let dx = abs(fract(v.local.x / sx) - 0.5) * sx;
    let dy = abs(fract(v.local.y / sy) - 0.5) * sy;
    if (length(vec2<f32>(dx,dy)) <= v.pat.y * 0.5) { mark = 1.0; }
  } else if (ptype > 1.5) {
    let pitch = max(v.pat.z, 1e-3);
    if ((v.local.x % pitch) <= v.pat.y) { mark = 1.0; }
  }

  let mode = u.mode;
  if (mode > 0.5 && mode < 1.5) {
    // 热力图
    var col = heat(v.d0.y);
    col = mix(col, vec3<f32>(1.0), v.d0.w * 0.45);
    return vec4<f32>(col, 0.9);
  }

  // 材质模式：镀膜底色 + 菲涅尔环境反射
  var base = v.coat * (0.5 + 0.25 * (1.0 - R));
  var col = mix(base, env, clamp(R * 1.05, 0.0, 1.0));
  col = mix(col, v.patc, mark);
  var alpha = clamp(0.20 + 0.72 * R + mark * 0.85, 0.16, 0.96);
  if (v.d0.w > 0.5) { col = mix(col, vec3<f32>(1.0, 0.72, 0.1), 0.5); alpha = 0.95; }
  return vec4<f32>(pow(col, vec3<f32>(0.95)), alpha);
}
`;

const LINE_WGSL = /* wgsl */ `
struct U { mvp: mat4x4<f32>, cam: vec3<f32>, mode: f32 }
@group(0) @binding(0) var<uniform> u: U;
struct VIn { @location(0) p: vec3<f32>, @location(1) c: vec4<f32> };
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) c: vec4<f32> };
@vertex fn vs(v: VIn) -> VOut { var o: VOut; o.pos = u.mvp * vec4<f32>(v.p,1.0); o.c=v.c; return o; }
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> { return v.c; }
`;

export type ViewMode = 'material' | 'heatmap';

export class Renderer3D {
  canvas: HTMLCanvasElement;
  device!: GPUDevice;
  ctx!: GPUCanvasContext;
  format: GPUTextureFormat = 'bgra8unorm';
  private uniformBuf!: GPUBuffer;
  private bgl!: GPUBindGroupLayout;
  private pipelineLayout!: GPUPipelineLayout;
  private opaquePipe!: GPURenderPipeline;
  private glassPipe!: GPURenderPipeline;
  private linePipe!: GPURenderPipeline;
  private opaqueBuf?: GPUBuffer;
  private opaqueCount = 0;
  private glassBuf?: GPUBuffer;
  private glassVertexCount = 0;
  private lineBuf?: GPUBuffer;
  private lineVertCount = 0;
  private depthView?: GPUTextureView;
  private depthTex?: GPUTexture;

  yaw = 0.7;
  pitch = 0.42;
  distance = 70;
  target: Vec3 = { x: 0, y: 10, z: 0 };
  mode: ViewMode = 'material';
  private project?: Project;
  private glassTypes: GlassType[] = [];
  private riskMap = new Map<string, number>();
  private selectedId: string | null = null;

  private raf = 0;
  private ro?: ResizeObserver;
  private dragging = false;
  private moved = false;
  private lastX = 0;
  private lastY = 0;
  private pointerButton = 0;
  onPick?: (id: string | null) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(device: GPUDevice) {
    this.device = device;
    const ctx = this.canvas.getContext('webgpu');
    if (!ctx) throw new Error('无法获取 WebGPU canvas context');
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
    ctx.configure({ device, format: this.format, alphaMode: 'premultiplied' });

    this.bgl = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    this.uniformBuf = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const om = device.createShaderModule({ code: OPAQUE_WGSL });
    const gm = device.createShaderModule({ code: GLASS_WGSL });
    const lm = device.createShaderModule({ code: LINE_WGSL });
    for (const [nm, mod] of [['opaque', om], ['glass', gm], ['line', lm]] as const) {
      const ci = await mod.getCompilationInfo();
      for (const m of ci.messages) {
        console.warn(`[WGSL ${nm} ${m.type}] L${m.lineNum}:${m.linePos} ${m.message}`);
      }
    }
    const depthFormat: GPUTextureFormat = 'depth24plus';

    this.opaquePipe = device.createRenderPipeline({
      layout: this.pipelineLayout,
      vertex: {
        module: om,
        entryPoint: 'vs',
        buffers: [{ arrayStride: 36, attributes: [
          { shaderLocation: 0, format: 'float32x3', offset: 0 },
          { shaderLocation: 1, format: 'float32x3', offset: 12 },
          { shaderLocation: 2, format: 'float32x3', offset: 24 },
        ] }],
      },
      fragment: { module: om, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less' },
    });

    this.glassPipe = device.createRenderPipeline({
      layout: this.pipelineLayout,
      vertex: {
        module: gm,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 96,
          attributes: [
            { shaderLocation: 0, format: 'float32x3', offset: 0 },
            { shaderLocation: 1, format: 'float32x3', offset: 12 },
            { shaderLocation: 2, format: 'float32x3', offset: 24 },
            { shaderLocation: 3, format: 'float32x4', offset: 36 },
            { shaderLocation: 4, format: 'float32x4', offset: 52 },
            { shaderLocation: 5, format: 'float32x3', offset: 68 },
            { shaderLocation: 6, format: 'float32x2', offset: 80 },
          ],
        }],
      },
      fragment: {
        module: gm, entryPoint: 'fs',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: 'less' },
    });

    this.linePipe = device.createRenderPipeline({
      layout: this.pipelineLayout,
      vertex: {
        module: lm, entryPoint: 'vs',
        buffers: [{ arrayStride: 28, attributes: [
          { shaderLocation: 0, format: 'float32x3', offset: 0 },
          { shaderLocation: 1, format: 'float32x4', offset: 12 },
        ] }],
      },
      fragment: { module: lm, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'line-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
    });

    this.attachControls();
    this.ro = new ResizeObserver(() => this.resizeDepth());
    this.ro.observe(this.canvas);
    this.resizeDepth();
    const loop = () => {
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private uniformBindGroup() {
    return this.device.createBindGroup({ layout: this.bgl, entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }] });
  }

  setProject(p: Project, glass: GlassType[]) {
    this.project = p;
    this.glassTypes = glass;
    this.buildOpaque();
    this.buildGlass();
    this.buildLines();
  }

  setGlass(glass: GlassType[]) {
    this.glassTypes = glass;
    this.buildGlass();
  }
  setRiskMap(m: Map<string, number>) {
    this.riskMap = m;
    this.buildGlass();
  }
  setMode(m: ViewMode) {
    this.mode = m;
  }
  setSelected(id: string | null) {
    this.selectedId = id;
    this.buildGlass();
    this.buildLines();
  }

  frameProject() {
    if (!this.project) return;
    let maxR = 20;
    let cy = 8;
    for (const b of this.project.buildingBodies) {
      if (b.kind === 'box') {
        maxR = Math.max(maxR, Math.hypot(b.size.x, b.size.z) * 0.9 + b.size.y * 0.4);
        cy = Math.max(cy, b.size.y * 0.55);
      }
    }
    this.target = { x: 0, y: cy, z: 0 };
    this.distance = Math.max(45, maxR * 1.5);
  }

  /* ---------------- 几何构建 ---------------- */

  private buildOpaque() {
    if (!this.project) return;
    const g = new GeoBuilder();
    const groundCol: [number, number, number] = [0.83, 0.86, 0.82];
    addBox(g, { x: 0, y: -0.25, z: 0 }, { x: 220, y: 0.5, z: 220 }, groundCol);

    for (const b of this.project.buildingBodies) {
      const col = hexToRgb01(b.color ?? '#c7ced6');
      if (b.kind === 'box') {
        addBox(g, b.center, b.size, col.map((x) => x * 0.92) as [number, number, number]);
      } else {
        // OBJ 三角网（已含平移/缩放变换）
        const s = b.scale;
        const pos = b.positions;
        const nor = b.normals;
        for (let t = 0; t < b.indices.length; t += 3) {
          const ia = b.indices[t] * 3;
          const ib = b.indices[t + 1] * 3;
          const ic = b.indices[t + 2] * 3;
          const vp = (ii: number): Vec3 => ({
            x: b.translation.x + pos[ii] * s,
            y: b.translation.y + pos[ii + 1] * s,
            z: b.translation.z + pos[ii + 2] * s,
          });
          const vn = (ii: number): Vec3 => ({ x: nor[ii] || 0, y: nor[ii + 1] || 1, z: nor[ii + 2] || 0 });
          g.tri({ p: vp(ia), n: vn(ia), c: col }, { p: vp(ib), n: vn(ib), c: col }, { p: vp(ic), n: vn(ic), c: col });
        }
      }
    }

    for (const e of this.project.environment) {
      if (e.kind === 'tree') {
        const crown = hexToRgb01(e.color);
        addCylinder(g, { x: e.position.x, y: e.heightM * 0.28, z: e.position.z }, 0.28, e.heightM * 0.56, [0.45, 0.32, 0.2]);
        addSphere(g, { x: e.position.x, y: e.heightM * 0.66, z: e.position.z }, e.crownRadiusM, crown);
      } else {
        // 水面用半透明蓝盒表示（不透明构建里给深色底，真正水面在 line/glass 之外暂用薄盒）
        addBox(
          g,
          { x: e.center.x, y: -0.02, z: e.center.z },
          { x: e.widthM, y: 0.12, z: e.depthM },
          hexToRgb01(e.color).map((x) => x * 0.9) as [number, number, number],
        );
      }
    }

    const data = g.float32;
    this.opaqueCount = data.length / 9;
    this.opaqueBuf?.destroy();
    this.opaqueBuf = this.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.opaqueBuf, 0, data);
  }

  private buildGlass() {
    if (!this.project) return;
    const glassMap = new Map(this.glassTypes.map((x) => [x.id, x]));
    const verts: number[] = [];
    const stride = 24;
    const pushVertex = (s: GlassSurface, p: Vec3, lx: number, ly: number) => {
      const gid = this.mode === 'heatmap' && s.retrofitGlassTypeId ? s.retrofitGlassTypeId : s.glassTypeId;
      const glass = glassMap.get(gid) ?? glassMap.get(s.glassTypeId);
      const coat = hexToRgb01(glass?.coatingColor ?? '#9fc3d8');
      const risk = (this.riskMap.get(s.id) ?? 0) / 100;
      const selected = this.selectedId === s.id ? 1 : 0;
      const ptype = glass?.pattern.type === 'dots' ? 1 : glass?.pattern.type === 'stripes' ? 2 : 0;
      const pat = glass?.pattern;
      const pc = hexToRgb01(pat?.color ?? '#ffffff');
      // 沿外法线微推，避免与盒体表面 z-fighting
      const off = 0.05;
      verts.push(
        p.x + s.normal.x * off, p.y + s.normal.y * off, p.z + s.normal.z * off,
        s.normal.x, s.normal.y, s.normal.z,
        coat[0], coat[1], coat[2],
        glass?.ior ?? 1.5, risk, glass?.transmittance ?? 0.5, selected,
        ptype, pat?.sizeM ?? 0.01, pat?.spacingXM ?? 0.05, pat?.spacingYM ?? 0.05,
        pc[0], pc[1], pc[2],
        lx, ly,
        0, 0,
      );
    };

    for (const s of this.project.surfaces) {
      const [a, b, c, d] = s.corners;
      // 局部米制坐标
      const lx = [0, 1, 1, 0];
      const eu = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const ev = Math.hypot(d.x - a.x, d.y - a.y, d.z - a.z);
      const lu = [0, eu, eu, 0];
      const lv = [0, 0, ev, ev];
      const order = [0, 1, 2, 0, 2, 3];
      const corners = [a, b, c, d];
      for (const idx of order) pushVertex(s, corners[idx], lu[idx], lv[idx]);
      void lx;
    }
    this.glassVertexCount = verts.length / stride;
    const data = new Float32Array(verts);
    this.glassBuf?.destroy();
    this.glassBuf = this.device.createBuffer({ size: Math.max(96, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.glassBuf, 0, data);
  }

  private buildLines() {
    if (!this.project) return;
    const lv: number[] = [];
    const seg = (a: Vec3, b: Vec3, col: [number, number, number, number]) => {
      lv.push(a.x, a.y, a.z, ...col, b.x, b.y, b.z, ...col);
    };
    // 场地网格
    const gc: [number, number, number, number] = [0.35, 0.42, 0.5, 0.35];
    for (let i = -50; i <= 50; i += 5) {
      seg({ x: i, y: 0.02, z: -50 }, { x: i, y: 0.02, z: 50 }, gc);
      seg({ x: -50, y: 0.02, z: i }, { x: 50, y: 0.02, z: i }, gc);
    }
    // 玻璃边界
    for (const s of this.project.surfaces) {
      const col: [number, number, number, number] =
        this.selectedId === s.id ? [1, 0.72, 0.1, 1] : [0.08, 0.16, 0.24, 0.55];
      const [a0, b0, c0, d0] = s.corners;
      const o = 0.045;
      const off = (p: Vec3): Vec3 => ({ x: p.x + s.normal.x * o, y: p.y + s.normal.y * o, z: p.z + s.normal.z * o });
      const [a, b, c, d] = [off(a0), off(b0), off(c0), off(d0)];
      seg(a, b, col); seg(b, c, col); seg(c, d, col); seg(d, a, col);
    }
    const data = new Float32Array(lv);
    this.lineVertCount = data.length / 7;
    this.lineBuf?.destroy();
    this.lineBuf = this.device.createBuffer({ size: Math.max(28, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.lineBuf, 0, data);
  }

  /* ---------------- 相机 / 交互 ---------------- */

  private attachControls() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    const el = this.canvas;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('wheel', this.onWheel);
    this.opaqueBuf?.destroy();
    this.glassBuf?.destroy();
    this.lineBuf?.destroy();
    this.depthTex?.destroy();
    try {
      this.ctx?.unconfigure();
    } catch {
      /* noop */
    }
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.moved = false;
    this.pointerButton = e.button;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.pointerButton === 2 || e.shiftKey) {
      const eye = orbitEye(this.target, this.yaw, this.pitch, this.distance);
      const fwd = norm3(sub3(this.target, eye));
      const right = norm3(cross3(fwd, { x: 0, y: 1, z: 0 }));
      const up = cross3(right, fwd);
      const k = this.distance * 0.0016;
      this.target = {
        x: this.target.x - right.x * dx * k + up.x * dy * k,
        y: this.target.y - right.y * dx * k + up.y * dy * k,
        z: this.target.z - right.z * dx * k + up.z * dy * k,
      };
    } else {
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(0.05, Math.min(1.45, this.pitch + dy * 0.005));
    }
  };
  private onUp = (e: PointerEvent) => {
    if (this.dragging && !this.moved && this.pointerButton === 0) {
      const id = this.pick(e.clientX, e.clientY);
      this.onPick?.(id);
    }
    this.dragging = false;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = Math.max(8, Math.min(260, this.distance * Math.exp(e.deltaY * 0.001)));
  };

  screenRay(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const eye = orbitEye(this.target, this.yaw, this.pitch, this.distance);
    const fwd = norm3(sub3(this.target, eye));
    const right = norm3(cross3(fwd, { x: 0, y: 1, z: 0 }));
    const up = cross3(right, fwd);
    const tan = Math.tan((45 * Math.PI) / 180 / 2);
    const aspect = rect.width / Math.max(1, rect.height);
    const dir = norm3({
      x: fwd.x + right.x * nx * aspect * tan + up.x * ny * tan,
      y: fwd.y + right.y * nx * aspect * tan + up.y * ny * tan,
      z: fwd.z + right.z * nx * aspect * tan + up.z * ny * tan,
    });
    return { origin: eye, dir };
  }

  private pick(cx: number, cy: number): string | null {
    if (!this.project) return null;
    const { origin, dir } = this.screenRay(cx, cy);
    let best = Infinity;
    let bestId: string | null = null;
    for (const s of this.project.surfaces) {
      const [a, b, c, d] = s.corners;
      const t1 = rayTri(origin, dir, a, b, c);
      const t2 = rayTri(origin, dir, a, c, d);
      const t = Math.min(t1, t2);
      if (t > 0 && t < best) {
        best = t;
        bestId = s.id;
      }
    }
    return bestId;
  }

  private resizeDepth() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (!this.depthView || !this.depthTex || this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.depthTex?.destroy();
      this.depthTex = this.device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.depthView = this.depthTex.createView();
    }
  }

  private render() {
    if (!this.device || !this.ctx || !this.depthView) return;
    this.resizeDepth();
    const cv = this.canvas;
    const eye = orbitEye(this.target, this.yaw, this.pitch, this.distance);
    const proj = mat4Perspective((45 * Math.PI) / 180, cv.width / Math.max(1, cv.height), 0.1, 600);
    const view = mat4LookAt(eye, this.target, { x: 0, y: 1, z: 0 });
    const mvp = mat4Multiply(proj, view);
    (this as unknown as { lastMvp: Float32Array }).lastMvp = mvp;
    const u = new Float32Array(20);
    u.set(mvp, 0);
    u[16] = eye.x; u[17] = eye.y; u[18] = eye.z;
    u[19] = this.mode === 'heatmap' ? 1 : 0;
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);

    const encoder = this.device.createCommandEncoder();
    const viewTex = this.ctx.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: viewTex,
        clearValue: { r: 0.91, g: 0.94, b: 0.97, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: { view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    const bg = this.uniformBindGroup();
    pass.setViewport(0, 0, cv.width, cv.height, 0, 1);
    pass.setScissorRect(0, 0, cv.width, cv.height);
    pass.setBindGroup(0, bg);
    if (this.opaqueBuf && this.opaqueCount) {
      pass.setPipeline(this.opaquePipe);
      pass.setVertexBuffer(0, this.opaqueBuf);
      pass.draw(this.opaqueCount);
    }
    if (this.glassBuf && this.glassVertexCount) {
      pass.setPipeline(this.glassPipe);
      pass.setVertexBuffer(0, this.glassBuf);
      pass.draw(this.glassVertexCount);
    }
    if (this.lineBuf && this.lineVertCount) {
      pass.setPipeline(this.linePipe);
      pass.setVertexBuffer(0, this.lineBuf);
      pass.draw(this.lineVertCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** 调试/报告用：离屏渲染一帧并读回 RGBA 像素统计。 */
  async captureDebug(): Promise<{ w: number; h: number; pixels: number; nonClear: number; sample: number[]; dataUrl: string }> {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const tex = this.device.createTexture({
      size: [w, h],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const depth = this.device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const eye = orbitEye(this.target, this.yaw, this.pitch, this.distance);
    const proj = mat4Perspective((45 * Math.PI) / 180, w / Math.max(1, h), 0.1, 600);
    const view = mat4LookAt(eye, this.target, { x: 0, y: 1, z: 0 });
    const mvp = mat4Multiply(proj, view);
    const u = new Float32Array(20);
    u.set(mvp, 0);
    u[16] = eye.x; u[17] = eye.y; u[18] = eye.z; u[19] = this.mode === 'heatmap' ? 1 : 0;
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: tex.createView(), clearValue: { r: 0.91, g: 0.94, b: 0.97, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setViewport(0, 0, w, h, 0, 1);
    pass.setScissorRect(0, 0, w, h);
    pass.setBindGroup(0, this.uniformBindGroup());
    if (this.opaqueBuf && this.opaqueCount) { pass.setPipeline(this.opaquePipe); pass.setVertexBuffer(0, this.opaqueBuf); pass.draw(this.opaqueCount); }
    if (this.glassBuf && this.glassVertexCount) { pass.setPipeline(this.glassPipe); pass.setVertexBuffer(0, this.glassBuf); pass.draw(this.glassVertexCount); }
    if (this.lineBuf && this.lineVertCount) { pass.setPipeline(this.linePipe); pass.setVertexBuffer(0, this.lineBuf); pass.draw(this.lineVertCount); }
    pass.end();

    const bpp = 4;
    const rowBytes = Math.ceil((w * bpp) / 256) * 256;
    const read = this.device.createBuffer({ size: rowBytes * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: tex }, { buffer: read, bytesPerRow: rowBytes, rowsPerImage: h }, [w, h]);
    this.device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(read.getMappedRange().slice(0));
    read.unmap();

    let nonClear = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = y * rowBytes + x * 4;
        if (Math.abs(bytes[i] - 232) > 10 || Math.abs(bytes[i + 1] - 240) > 10 || Math.abs(bytes[i + 2] - 247) > 10) nonClear++;
      }
    }
    // 缩成 dataURL（最近邻抽样）
    const c = document.createElement('canvas');
    c.width = 160; c.height = Math.round((160 * h) / w);
    const cx = c.getContext('2d')!;
    const img = cx.createImageData(c.width, c.height);
    for (let yy = 0; yy < c.height; yy++) {
      for (let xx = 0; xx < c.width; xx++) {
        const sx = Math.floor((xx / c.width) * w);
        const sy = Math.floor((yy / c.height) * h);
        const si = sy * rowBytes + sx * 4;
        const di = (yy * c.width + xx) * 4;
        img.data[di] = bytes[si]; img.data[di + 1] = bytes[si + 1]; img.data[di + 2] = bytes[si + 2]; img.data[di + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    tex.destroy(); depth.destroy(); read.destroy();
    return { w, h, pixels: (w / 2) * (h / 2), nonClear, sample: [bytes[(h >> 1) * rowBytes + (w >> 1) * 4], bytes[(h >> 1) * rowBytes + (w >> 1) * 4 + 1], bytes[(h >> 1) * rowBytes + (w >> 1) * 4 + 2]], dataUrl: c.toDataURL('image/png') };
  }
}

/* ---------- 小型向量/求交工具 ---------- */
function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function norm3(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
function rayTri(o: Vec3, d: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const e1 = sub3(b, a);
  const e2 = sub3(c, a);
  const p = cross3(d, e2);
  const det = e1.x * p.x + e1.y * p.y + e1.z * p.z;
  if (Math.abs(det) < 1e-8) return Infinity;
  const inv = 1 / det;
  const tv = sub3(o, a);
  const u = (tv.x * p.x + tv.y * p.y + tv.z * p.z) * inv;
  if (u < 0 || u > 1) return Infinity;
  const q = cross3(tv, e1);
  const v = (d.x * q.x + d.y * q.y + d.z * q.z) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2.x * q.x + e2.y * q.y + e2.z * q.z) * inv;
  return t > 1e-4 ? t : Infinity;
}

export { heatColor };
