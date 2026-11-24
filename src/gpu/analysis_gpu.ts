import type { AnalysisResult, FresnelValidation, GlassAnalysis, GlassMaterial, Project } from '../types';
import { getGpuContext } from './device';
import { ANALYSIS_WGSL, FRESNEL_WGSL } from './analysis_wgsl';
import { patternCode } from '../core/pattern';
import { materialDeterrence } from '../core/risk';
import { compareFresnelValues } from '../core/fresnel';

function encodePattern(m: GlassMaterial): [number, number, number, number] {
  const p = m.pattern;
  const sx = p.spacingXMm / 1000;
  const sy = p.spacingYMm / 1000;
  if (p.kind === 'dots') return [patternCode(p.kind), sx, sy, p.dotRadiusMm / 1000];
  if (p.kind === 'stripes') return [p.orientation === 'vertical' ? 3 : 2, sx, sy, p.stripeWidthMm / 1000];
  if (p.kind === 'grid') return [4, sx, sy, p.stripeWidthMm / 1000];
  return [0, sx, sy, p.stripeWidthMm / 1000];
}

export async function runGpuFresnelValidation(): Promise<FresnelValidation | null> {
  const gpu = await getGpuContext();
  if (!gpu) return null;
  const { device } = gpu;
  const angles = [0, 5, 10, 15, 20, 30, 40, 50, 55, 60, 65, 70, 75, 80, 85, 89, 90];
  const cosines = angles.map((a) => Math.cos((a * Math.PI) / 180));
  const input = new Float32Array(cosines);
  const inputBuffer = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inputBuffer, 0, input);
  const outputBuffer = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readBuffer = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  const module = device.createShaderModule({ code: FRESNEL_WGSL });
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter((m) => m.type === 'error');
  if (errors.length) {
    console.error('Fresnel WGSL errors', errors);
    inputBuffer.destroy(); outputBuffer.destroy(); readBuffer.destroy();
    return null;
  }
  const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, input.byteLength);
  device.queue.submit([encoder.finish()]);
  await readBuffer.mapAsync(GPUMapMode.READ);
  const values = new Float32Array(readBuffer.getMappedRange()).slice();
  readBuffer.unmap();
  inputBuffer.destroy(); outputBuffer.destroy(); readBuffer.destroy();
  const compared = compareFresnelValues(values, 1.52);
  return { backend: 'webgpu', ...compared };
}

export async function evaluateProjectGpu(project: Project, allMaterials: GlassMaterial[]): Promise<AnalysisResult | null> {
  const gpu = await getGpuContext();
  if (!gpu) return null;
  const { device, name } = gpu;

  const glasses = project.objects.filter((o) => o.glass);
  if (!glasses.length) {
    return { projectId: project.id, backend: 'webgpu', gpuName: name, computedAt: new Date().toISOString(), sampleCount: project.settings.sampleCount, glasses: {} };
  }

  const materials = allMaterials.length ? allMaterials : [];
  const materialIndex = new Map(materials.map((m, i) => [m.id, i]));
  const fallbackIndex = 0;

  const glassData = new Float32Array(glasses.length * 16);
  glasses.forEach((obj, i) => {
    const g = obj.glass!;
    const replacementId = project.mitigation.assignments[obj.id];
    const current = materialIndex.get(g.materialId) ?? fallbackIndex;
    const replacement = replacementId && materialIndex.has(replacementId) ? materialIndex.get(replacementId)! : -1;
    glassData.set([
      g.center[0], g.center[1], g.center[2], g.areaM2,
      g.normal[0], g.normal[1], g.normal[2], g.width,
      g.height, g.elevation, g.floor, g.seeThrough ? 1 : 0,
      current, replacement, 0, 0,
    ], i * 16);
  });

  const materialData = new Float32Array(Math.max(materials.length, 1) * 16);
  materials.forEach((m, i) => {
    const pattern = encodePattern(m);
    materialData.set([
      m.reflectance, m.transmittance, m.ior > 1 ? m.ior : 1.52, m.costPerM2,
      ...pattern,
      materialDeterrence(m), 0, 0, 0,
      ...hexToRgb(m.coatingColor), 1,
    ], i * 16);
  });

  const treeData = new Float32Array(Math.max(project.trees.length, 1) * 8);
  project.trees.forEach((t, i) => {
    treeData.set([t.x, t.height * 0.62, t.z, t.crownRadius, ...hexToRgb(t.color), 1], i * 8);
  });

  const waterData = new Float32Array(Math.max(project.water.length, 1) * 8);
  project.water.forEach((w, i) => {
    waterData.set([w.x, w.z, w.width, w.depth, ...hexToRgb(w.color), 1], i * 8);
  });

  const s = project.settings;
  const directionRad = (s.birdDirection * Math.PI) / 180;
  const settingsData = new Float32Array([
    s.birdHeight, directionRad, glasses.length, s.sampleCount,
    s.reflectionWeight, s.greenWeight, s.floorWeight, s.seeThroughWeight,
    s.greenRadiusM, s.highThreshold, s.mediumThreshold, project.mitigation.target,
    project.trees.length, project.water.length, s.bidirectional ? 1 : 0, s.viewDistance,
  ]);

  const outputSize = glasses.length * 32 * 4;
  const outputBuffer = device.createBuffer({ size: outputSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readBuffer = device.createBuffer({ size: outputSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  const makeBuffer = (data: Float32Array, usage: GPUBufferUsageFlags) => {
    const buffer = device.createBuffer({ size: Math.max(data.byteLength, 16), usage });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  };

  const uniformBuffer = makeBuffer(settingsData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const glassBuffer = makeBuffer(glassData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const materialBuffer = makeBuffer(materialData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const treeBuffer = makeBuffer(treeData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const waterBuffer = makeBuffer(waterData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);

  try {
    const module = device.createShaderModule({ code: ANALYSIS_WGSL });
    const compilation = await module.getCompilationInfo();
    const errors = compilation.messages.filter((m) => m.type === 'error');
    if (errors.length) {
      console.error('Analysis WGSL compilation errors:', errors.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join('\n'));
      return null;
    }
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: glassBuffer } },
        { binding: 2, resource: { buffer: materialBuffer } },
        { binding: 3, resource: { buffer: treeBuffer } },
        { binding: 4, resource: { buffer: waterBuffer } },
        { binding: 5, resource: { buffer: outputBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(glasses.length / 64));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputSize);
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(readBuffer.getMappedRange()).slice();
    readBuffer.unmap();

    const result: Record<string, GlassAnalysis> = {};
    glasses.forEach((obj, i) => {
      const o = i * 32;
      const totalWeight = raw[o + 3] || 1;
      const avgFresnel = raw[o + 2];
      const treeShare = raw[o + 4] / totalWeight;
      const skyShare = raw[o + 5] / totalWeight;
      const waterShare = raw[o + 6] / totalWeight;
      const glassShare = raw[o + 7] / totalWeight;
      const throughShare = raw[o + 8] / totalWeight;
      const markerShare = raw[o + 9] / totalWeight;
      result[obj.id] = {
        glassId: obj.id,
        sampleCount: s.sampleCount,
        totalWeight: raw[o + 3],
        avgFresnel,
        maxFresnel: raw[o + 1],
        treeShare,
        skyShare,
        waterShare,
        glassShare,
        throughShare,
        markerShare,
        reflectionIntensity: raw[o + 18],
        nearestTreeDistance: raw[o + 12],
        greenFactor: raw[o + 13],
        floorFactor: raw[o + 14],
        riskBefore: raw[o + 16],
        riskAfter: raw[o + 17],
        deterrenceBefore: raw[o + 19],
        deterrenceAfter: raw[o + 20],
      };
    });

    return { projectId: project.id, backend: 'webgpu', gpuName: name, computedAt: new Date().toISOString(), sampleCount: s.sampleCount, glasses: result };
  } catch (error) {
    console.error('WebGPU analysis failed', error);
    return null;
  } finally {
    uniformBuffer.destroy(); glassBuffer.destroy(); materialBuffer.destroy(); treeBuffer.destroy(); waterBuffer.destroy(); outputBuffer.destroy(); readBuffer.destroy();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return [0.55, 0.68, 0.76];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
