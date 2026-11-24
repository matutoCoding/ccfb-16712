import type { AssessmentSettings, GlassAnalysis, GlassMaterial, GlassMeta, TreeInstance } from '../types';
import { clamp } from './math';
import { patternDeterrence } from './materials';

export function nearestTreeDistance(glass: GlassMeta, trees: TreeInstance[]): number {
  if (!trees.length) return 60;
  let best = Infinity;
  for (const t of trees) {
    const dx = glass.center[0] - t.x;
    const dz = glass.center[2] - t.z;
    const horizontal = Math.hypot(dx, dz);
    const envelope = Math.max(0.6, horizontal - t.crownRadius * 0.75);
    best = Math.min(best, envelope);
  }
  return Number.isFinite(best) ? best : 60;
}

export function greenFactorForDistance(distance: number, radiusM = 30): number {
  return Math.exp(-Math.max(0, distance - 2) / Math.max(4, radiusM * 0.5));
}

export function floorFactor(floor: number): number {
  return 1 / (1 + 0.42 * Math.max(0, floor - 1));
}

export interface RiskInput {
  avgFresnel: number;
  treeShare: number;
  skyShare: number;
  waterShare: number;
  throughShare: number;
  nearestTreeDistance: number;
  floor: number;
  seeThrough: boolean;
  settings: AssessmentSettings;
  deterrence: number;
}

export function calculateRisk(input: RiskInput): { score: number; reflection: number; green: number; floor: number; seeThrough: number } {
  const s = input.settings;
  const habitatShare = clamp(input.treeShare * 1.8 + input.skyShare * 0.75 + input.waterShare * 0.9, 0, 1);
  const reflectionIntensity = clamp(0.3 * input.avgFresnel + 0.7 * habitatShare, 0, 1);
  const reflection = s.reflectionWeight * reflectionIntensity;
  const green = s.greenWeight * greenFactorForDistance(input.nearestTreeDistance, s.greenRadiusM);
  const floorScore = s.floorWeight * floorFactor(input.floor);
  const seeFactor = input.seeThrough ? 1 : clamp(input.throughShare * 0.45, 0, 0.35);
  const seeThrough = s.seeThroughWeight * seeFactor;
  const raw = reflection + green + floorScore + seeThrough;
  const score = clamp(raw * (1 - clamp(input.deterrence, 0, 0.95)), 0, 100);
  return { score, reflection, green, floor: floorScore, seeThrough };
}

export function riskLevel(score: number, settings: AssessmentSettings): 'high' | 'medium' | 'low' {
  if (score >= settings.highThreshold) return 'high';
  if (score >= settings.mediumThreshold) return 'medium';
  return 'low';
}

export function riskColor(score: number, settings?: AssessmentSettings): string {
  const high = settings?.highThreshold ?? 65;
  const medium = settings?.mediumThreshold ?? 38;
  if (score >= high) return '#dc2626';
  if (score >= medium) return '#f97316';
  if (score >= medium - 12) return '#eab308';
  return '#16a34a';
}

export function materialDeterrence(material?: GlassMaterial): number {
  return material ? patternDeterrence(material.pattern) : 0;
}

export function summarizeAnalyses(items: GlassAnalysis[]) {
  const totalArea = 0;
  const weightedRisk = items.reduce((sum, a) => sum + a.riskBefore, 0);
  const high = items.filter((a) => a.riskBefore >= 65).length;
  const medium = items.filter((a) => a.riskBefore >= 38 && a.riskBefore < 65).length;
  return { count: items.length, high, medium, low: items.length - high - medium, averageRisk: items.length ? weightedRisk / items.length : 0, totalArea };
}
