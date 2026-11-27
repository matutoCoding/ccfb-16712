import type { GlassType, Project, Settings, SurfaceReflectionStat } from '../core/types';
import {
  analyzeCpu,
  buildSamples,
  buildTraceScene,
  type AnalysisResult,
  type SampleRay,
} from '../core/engine';
import { scoreSurface } from '../core/risk';
import { fresnelByCosine } from '../core/fresnel';
import { getDevice } from './wgpuContext';
import { ANALYSIS_WGSL, REDUCE_WGSL, SELFTEST_WGSL } from './computeShaders';

function makeBuffer(device: GPUDevice, data: BufferSource, usage: GPUBufferUsageFlags): GPUBuffer {
  // 本辅助函数随后会 writeBuffer，因此始终带上 COPY_DST
  const buf = device.createBuffer({ size: Math.max(16, data.byteLength), usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buf, 0, data as BufferSource);
  return buf;
}

async function createPipeline(
  device: GPUDevice,
  code: string,
  entryPoint: string,
): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length) {
    throw new Error('WGSL 编译失败: ' + errors.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join('\n'));
  }
  return device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint },
  });
}

/** 把采样射线打包成 64 字节/条，布局与 WGSL Sample 一致。 */
function packSamples(samples: SampleRay[]): ArrayBuffer {
  const buf = new ArrayBuffer(Math.max(64, samples.length * 64));
  const f = new Float32Array(buf);
  const i = new Int32Array(buf);
  samples.forEach((s, k) => {
    const o = k * 16;
    f[o + 0] = s.pos.x; f[o + 1] = s.pos.y; f[o + 2] = s.pos.z; f[o + 3] = s.ior;
    f[o + 4] = s.normal.x; f[o + 5] = s.normal.y; f[o + 6] = s.normal.z; f[o + 7] = s.trans;
    f[o + 8] = s.obs.x; f[o + 9] = s.obs.y; f[o + 10] = s.obs.z; f[o + 11] = s.seeFlag;
    i[o + 12] = s.skipBoxIndex;
  });
  return buf;
}

export async function analyzeGpu(
  project: Project,
  glassTypes: GlassType[],
  settings: Settings,
  opts: { useRetrofit?: boolean } = {},
): Promise<AnalysisResult> {
  const t0 = performance.now();
  const device = await getDevice();
  if (!device) throw new Error('WebGPU 设备不可用');

  const glassMap = new Map(glassTypes.map((g) => [g.id, g]));
  const glassOf = (s: Project['surfaces'][number]) =>
    glassMap.get(opts.useRetrofit && s.retrofitGlassTypeId ? s.retrofitGlassTypeId : s.glassTypeId);

  const scene = buildTraceScene(project);
  const samples = buildSamples(project, glassOf);
  const surfaceCount = project.surfaces.length;
  if (surfaceCount === 0) {
    return analyzeCpu(project, glassTypes, settings, opts);
  }

  /* ---------- 场景缓冲 ---------- */
  const treeData = new Float32Array(Math.max(4, scene.trees.length * 4));
  scene.trees.forEach((t, k) => {
    treeData[k * 4 + 0] = t.c.x;
    treeData[k * 4 + 1] = t.c.y;
    treeData[k * 4 + 2] = t.c.z;
    treeData[k * 4 + 3] = t.r;
  });
  const boxData = new Float32Array(Math.max(8, scene.boxes.length * 8));
  scene.boxes.forEach((b, k) => {
    const o = k * 8;
    boxData[o + 0] = b.min.x; boxData[o + 1] = b.min.y; boxData[o + 2] = b.min.z; boxData[o + 3] = 0;
    boxData[o + 4] = b.max.x; boxData[o + 5] = b.max.y; boxData[o + 6] = b.max.z; boxData[o + 7] = 0;
  });
  const waterData = new Float32Array(Math.max(8, scene.waters.length * 8));
  scene.waters.forEach((w, k) => {
    const o = k * 8;
    waterData[o + 0] = w.cx; waterData[o + 1] = w.y; waterData[o + 2] = w.cz; waterData[o + 3] = w.hw;
    waterData[o + 4] = w.hd;
  });

  const sampleBuf = makeBuffer(device, packSamples(samples), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const resultBuf = device.createBuffer({
    size: Math.max(16, samples.length * 16),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const treeBuf = makeBuffer(device, treeData, GPUBufferUsage.STORAGE);
  const boxBuf = makeBuffer(device, boxData, GPUBufferUsage.STORAGE);
  const waterBuf = makeBuffer(device, waterData, GPUBufferUsage.STORAGE);

  const params = new Uint32Array([samples.length, scene.trees.length, scene.boxes.length, scene.waters.length]);
  const paramBuf = makeBuffer(device, params, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

  /* ---------- Pass 1：逐样本 ---------- */
  const pipe1 = await createPipeline(device, ANALYSIS_WGSL, 'analyzeMain');
  const bg1 = device.createBindGroup({
    layout: pipe1.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuf } },
      { binding: 1, resource: { buffer: sampleBuf } },
      { binding: 2, resource: { buffer: resultBuf } },
      { binding: 3, resource: { buffer: treeBuf } },
      { binding: 4, resource: { buffer: boxBuf } },
      { binding: 5, resource: { buffer: waterBuf } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass1 = encoder.beginComputePass();
  pass1.setPipeline(pipe1);
  pass1.setBindGroup(0, bg1);
  pass1.dispatchWorkgroups(Math.max(1, Math.ceil(samples.length / 64)));
  pass1.end();

  /* ---------- Pass 2：逐面归约 ---------- */
  // 连续样本区间
  const ranges = new Uint32Array(surfaceCount * 4);
  let cursor = 0;
  project.surfaces.forEach((s, i) => {
    let count = 0;
    while (cursor + count < samples.length && samples[cursor + count].surfaceIndex === i) count++;
    ranges[i * 4 + 0] = cursor;
    ranges[i * 4 + 1] = count;
    cursor += count;
  });
  const rangeBuf = makeBuffer(device, ranges, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const statsBuf = device.createBuffer({
    size: surfaceCount * 64,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const pipe2 = await createPipeline(device, REDUCE_WGSL, 'reduceMain');
  const bg2 = device.createBindGroup({
    layout: pipe2.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: resultBuf } },
      { binding: 1, resource: { buffer: rangeBuf } },
      { binding: 2, resource: { buffer: statsBuf } },
    ],
  });
  const pass2 = encoder.beginComputePass();
  pass2.setPipeline(pipe2);
  pass2.setBindGroup(0, bg2);
  pass2.dispatchWorkgroups(surfaceCount);
  pass2.end();

  const readBuf = device.createBuffer({
    size: surfaceCount * 64,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  encoder.copyBufferToBuffer(statsBuf, 0, readBuf, 0, surfaceCount * 64);
  device.queue.submit([encoder.finish()]);

  await readBuf.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();

  const stats: SurfaceReflectionStat[] = project.surfaces.map((s, i) => {
    const o = i * 16;
    return {
      surfaceId: s.id,
      sampleCount: data[o + 0],
      avgFresnel: data[o + 1],
      maxFresnel: data[o + 2],
      habitatReflection: data[o + 3],
      treeReflection: data[o + 4],
      skyReflection: data[o + 5],
      waterReflection: data[o + 6],
      seeThrough: data[o + 7],
      reflectionIntensity: Math.min(1, data[o + 8]),
    };
  });

  const risks = stats.map((stat) => {
    const s = project.surfaces.find((x) => x.id === stat.surfaceId)!;
    return scoreSurface({ surface: s, stat, glass: glassOf(s), project, settings });
  });

  // 释放
  [sampleBuf, resultBuf, treeBuf, boxBuf, waterBuf, paramBuf, rangeBuf, statsBuf, readBuf].forEach((b) => b.destroy?.());

  return {
    engine: 'webgpu',
    stats,
    risks,
    sampleCount: samples.length,
    durationMs: performance.now() - t0,
  };
}

/* ---------------- 菲涅尔 GPU 自检 ---------------- */

export interface FresnelSelfTestResult {
  gpuAvailable: boolean;
  maxRelErrorPct: number;
  maxAbsError: number;
  worstAngleDeg: number;
  samples: number;
  passed: boolean;
  tolerancePct: number;
  adapter?: string;
}

export async function gpuFresnelSelfTest(tolerancePct = 1): Promise<FresnelSelfTestResult> {
  const N = 361;
  const device = await getDevice();
  if (!device) {
    return {
      gpuAvailable: false,
      maxRelErrorPct: NaN,
      maxAbsError: NaN,
      worstAngleDeg: NaN,
      samples: N,
      passed: false,
      tolerancePct,
    };
  }

  // 0°..89.999°
  const cos = new Float32Array(N);
  const angles: number[] = [];
  for (let k = 0; k < N; k++) {
    const deg = (89.999 * k) / (N - 1);
    angles.push(deg);
    cos[k] = Math.cos((deg * Math.PI) / 180);
  }
  const cosBuf = makeBuffer(device, cos, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const outBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const paramBuf = makeBuffer(device, new Uint32Array([N, 0, 0, 0]), GPUBufferUsage.UNIFORM);

  const pipe = await createPipeline(device, SELFTEST_WGSL, 'selfTestMain');
  const bg = device.createBindGroup({
    layout: pipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuf } },
      { binding: 1, resource: { buffer: cosBuf } },
      { binding: 2, resource: { buffer: outBuf } },
    ],
  });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipe);
  pass.setBindGroup(0, bg);
  pass.dispatchWorkgroups(Math.ceil(N / 64));
  pass.end();
  const read = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  enc.copyBufferToBuffer(outBuf, 0, read, 0, N * 4);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const gpu = new Float32Array(read.getMappedRange().slice(0));
  read.unmap();

  let maxRel = 0;
  let maxAbs = 0;
  let worst = 0;
  for (let k = 0; k < N; k++) {
    const ref = fresnelByCosine(cos[k], 1.52).r;
    const got = gpu[k];
    const abs = Math.abs(got - ref);
    const rel = abs / Math.max(ref, 1e-6);
    if (rel > maxRel) {
      maxRel = rel;
      worst = angles[k];
    }
    maxAbs = Math.max(maxAbs, abs);
  }
  [cosBuf, outBuf, paramBuf, read].forEach((b) => b.destroy?.());

  let adapter = '';
  try {
    const info = await (await navigator.gpu.requestAdapter())?.info;
    adapter = info ? `${info.vendor} ${info.architecture ?? ''} ${info.description ?? ''}`.trim() : '';
  } catch {
    /* ignore */
  }

  return {
    gpuAvailable: true,
    maxRelErrorPct: maxRel * 100,
    maxAbsError: maxAbs,
    worstAngleDeg: worst,
    samples: N,
    passed: maxRel * 100 < tolerancePct,
    tolerancePct,
    adapter,
  };
}
