import type { AnalysisResult, GlassAnalysis, GlassMaterial, Project, Vec3 } from '../types';
import { azimuthVector, clamp, deterministicHash01, rotateY } from './math';
import { glassBasis, patternMaskAt } from './pattern';
import { calculateRisk, floorFactor, greenFactorForDistance, materialDeterrence, nearestTreeDistance } from './risk';

const ANGLES = [-70, -45, -22, 0, 22, 45, 70, 82];
const ANGLE_COUNT = ANGLES.length;

interface RawSample {
  totalWeight: number;
  fresnelSum: number;
  maxFresnel: number;
  tree: number;
  sky: number;
  water: number;
  glass: number;
  through: number;
  marker: number;
}

function reflectVector(i: Vec3, n: Vec3): Vec3 {
  const d = i[0] * n[0] + i[1] * n[1] + i[2] * n[2];
  return [i[0] - 2 * d * n[0], i[1] - 2 * d * n[1], i[2] - 2 * d * n[2]];
}

function hitTree(origin: Vec3, dir: Vec3, project: Project): boolean {
  for (const t of project.trees) {
    const c: Vec3 = [t.x, t.height * 0.62, t.z];
    const r = t.crownRadius;
    const oc: Vec3 = [origin[0] - c[0], origin[1] - c[1], origin[2] - c[2]];
    const b = oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2];
    const cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - r * r;
    const disc = b * b - cc;
    if (disc <= 0) continue;
    const root = Math.sqrt(disc);
    let hit = -b - root;
    if (hit < 0.05) hit = -b + root;
    if (hit > 0.05) return true;
  }
  return false;
}

function hitWater(origin: Vec3, dir: Vec3, project: Project): boolean {
  if (dir[1] >= -0.0001) return false;
  for (const w of project.water) {
    const t = (0.025 - origin[1]) / dir[1];
    if (t <= 0.05) continue;
    const x = origin[0] + dir[0] * t;
    const z = origin[2] + dir[2] * t;
    if (Math.abs(x - w.x) <= w.width / 2 && Math.abs(z - w.z) <= w.depth / 2) return true;
  }
  return false;
}

function sampleGlass(project: Project, glassId: string, material: GlassMaterial, sampleCount: number): RawSample {
  const obj = project.objects.find((o) => o.id === glassId);
  const g = obj?.glass;
  const raw: RawSample = { totalWeight: 0, fresnelSum: 0, maxFresnel: 0, tree: 0, sky: 0, water: 0, glass: 0, through: 0, marker: 0 };
  if (!g) return raw;

  const n = g.normal;
  const { tangent } = glassBasis(n);
  const heading = azimuthVector(project.settings.birdDirection);
  const ny = Math.max(1, Math.floor(sampleCount / (4 * ANGLE_COUNT)));
  let sampleIndex = 0;

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < 4; ix++) {
      const u = (ix + 0.5) / 4 - 0.5;
      const v = (iy + 0.5) / ny - 0.5;
      const p: Vec3 = [g.center[0] + tangent[0] * u * g.width, g.center[1] + v * g.height, g.center[2] + tangent[2] * u * g.width];

      for (const angleDeg of ANGLES) {
        const alpha = (angleDeg * Math.PI) / 180;
        const ca = Math.cos(alpha);
        const sa = Math.sin(alpha);
        const approachHorizontal: Vec3 = [-n[0] * ca + tangent[0] * sa, 0, -n[2] * ca + tangent[2] * sa];
        const align = approachHorizontal[0] * heading[0] + approachHorizontal[2] * heading[2];
        const alignment = project.settings.bidirectional ? Math.abs(align) : Math.max(0, align);
        const directionWeight = 0.22 + 0.78 * Math.pow(clamp(alignment, 0, 1), 1.7);
        const distanceJitter = 0.68 + deterministicHash01(sampleIndex + glassId.length * 17) * 0.64;
        const dist = Math.max(2, project.settings.viewDistance * distanceJitter);
        const eye: Vec3 = [p[0] - approachHorizontal[0] * dist, project.settings.birdHeight, p[2] - approachHorizontal[2] * dist];
        const view: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
        const viewLen = Math.hypot(...view);
        if (viewLen < 0.001) continue;
        const vDir: Vec3 = [view[0] / viewLen, view[1] / viewLen, view[2] / viewLen];
        const cosI = clamp(-(vDir[0] * n[0] + vDir[1] * n[1] + vDir[2] * n[2]), 0, 1);
        if (cosI < 0.015) continue;

        const local = { x: u * g.width, y: v * g.height };
        const marked = patternMaskAt(material.pattern, local.x, local.y);
        raw.totalWeight += directionWeight;
        if (marked) {
          raw.marker += directionWeight;
          sampleIndex++;
          continue;
        }

        const ior = material.ior > 1 ? material.ior : 1.52;
        const f0 = ((ior - 1) / (ior + 1)) ** 2;
        const sin2T = (1 / ior) ** 2 * (1 - cosI * cosI);
        const cosT = Math.sqrt(Math.max(0, 1 - sin2T));
        const rs = (cosI - ior * cosT) / (cosI + ior * cosT);
        const rp = (ior * cosI - cosT) / (ior * cosI + cosT);
        const fresnel = clamp((rs * rs + rp * rp) / 2, f0 * 0.25, 1);
        raw.fresnelSum += fresnel * directionWeight;
        raw.maxFresnel = Math.max(raw.maxFresnel, fresnel);

        const reflected = reflectVector(vDir, n);
        const origin: Vec3 = [p[0] + n[0] * 0.04, p[1] + n[1] * 0.04, p[2] + n[2] * 0.04];
        if (hitTree(origin, reflected, project)) raw.tree += fresnel * directionWeight;
        else if (hitWater(origin, reflected, project)) raw.water += fresnel * directionWeight;
        else raw.sky += fresnel * directionWeight;

        const through = (1 - fresnel) * clamp(material.transmittance, 0, 1);
        const seeThroughBoost = g.seeThrough ? Math.max(through, (1 - fresnel) * 0.82) : through;
        raw.through += seeThroughBoost * directionWeight;
        raw.glass += Math.max(0, 1 - fresnel - seeThroughBoost) * directionWeight;
        sampleIndex++;
      }
    }
  }
  return raw;
}

function toAnalysis(glassId: string, current: GlassMaterial, replacement: GlassMaterial | undefined, project: Project, raw: RawSample, afterRaw?: RawSample): GlassAnalysis {
  const w = Math.max(raw.totalWeight, 1e-6);
  const avgFresnel = raw.fresnelSum / w;
  const treeShare = raw.tree / w;
  const skyShare = raw.sky / w;
  const waterShare = raw.water / w;
  const glassShare = raw.glass / w;
  const throughShare = raw.through / w;
  const markerShare = raw.marker / w;
  const obj = project.objects.find((o) => o.id === glassId);
  const g = obj!.glass!;
  const nearestTree = nearestTreeDistance(g, project.trees);
  const settings = project.settings;
  const deterrenceBefore = materialDeterrence(current);
  const riskBefore = calculateRisk({
    avgFresnel, treeShare, skyShare, waterShare, throughShare, nearestTreeDistance: nearestTree,
    floor: g.floor, seeThrough: g.seeThrough, settings, deterrence: deterrenceBefore,
  }).score;

  let riskAfter = riskBefore;
  let deterrenceAfter = deterrenceBefore;
  if (replacement) {
    const after = afterRaw ?? raw;
    const aw = Math.max(after.totalWeight, 1e-6);
    deterrenceAfter = materialDeterrence(replacement);
    riskAfter = calculateRisk({
      avgFresnel: after.fresnelSum / aw,
      treeShare: after.tree / aw,
      skyShare: after.sky / aw,
      waterShare: after.water / aw,
      throughShare: after.through / aw,
      nearestTreeDistance: nearestTree,
      floor: g.floor,
      seeThrough: g.seeThrough,
      settings,
      deterrence: deterrenceAfter,
    }).score;
  }

  const habitat = clamp(treeShare * 1.8 + skyShare * 0.75 + waterShare * 0.9, 0, 1);
  const reflectionIntensity = clamp(0.3 * avgFresnel + 0.7 * habitat, 0, 1);
  return {
    glassId, sampleCount: settings.sampleCount, totalWeight: raw.totalWeight, avgFresnel, maxFresnel: raw.maxFresnel,
    treeShare, skyShare, waterShare, glassShare, throughShare, markerShare, reflectionIntensity,
    nearestTreeDistance: nearestTree, greenFactor: greenFactorForDistance(nearestTree, settings.greenRadiusM),
    floorFactor: floorFactor(g.floor), riskBefore, riskAfter, deterrenceBefore, deterrenceAfter,
  };
}

export function evaluateProjectCpu(project: Project, materials: GlassMaterial[], backend: AnalysisResult['backend'] = 'cpu-reference', gpuName = 'CPU 同公式参考模式'): AnalysisResult {
  const materialMap = new Map(materials.map((m) => [m.id, m]));
  const glasses: Record<string, GlassAnalysis> = {};
  for (const obj of project.objects) {
    if (!obj.glass) continue;
    const current = materialMap.get(obj.glass.materialId) ?? materials[0];
    if (!current) continue;
    const replacementId = project.mitigation.assignments[obj.id];
    const replacement = replacementId ? materialMap.get(replacementId) : undefined;
    const raw = sampleGlass(project, obj.id, current, project.settings.sampleCount);
    const afterRaw = replacement && replacement.id !== current.id ? sampleGlass(project, obj.id, replacement, project.settings.sampleCount) : undefined;
    glasses[obj.id] = toAnalysis(obj.id, current, replacement, project, raw, afterRaw);
  }
  return { projectId: project.id, backend, gpuName, computedAt: new Date().toISOString(), sampleCount: project.settings.sampleCount, glasses };
}
