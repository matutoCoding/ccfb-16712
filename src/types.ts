export type ID = string;
export type Vec3 = [number, number, number];

export type PatternKind = 'none' | 'dots' | 'stripes' | 'grid';
export type FacadeKind = 'south' | 'north' | 'east' | 'west' | 'corner' | 'corridor' | 'roof' | 'other';
export type ObjectKind = 'mass' | 'glass' | 'ground' | 'marker';

export interface PatternSpec {
  kind: PatternKind;
  spacingXMm: number;
  spacingYMm: number;
  dotRadiusMm: number;
  stripeWidthMm: number;
  orientation: 'horizontal' | 'vertical';
  color: string;
}

export interface GlassMaterial {
  id: ID;
  name: string;
  manufacturer: string;
  reflectance: number;
  transmittance: number;
  ior: number;
  coatingColor: string;
  pattern: PatternSpec;
  birdSafe: boolean;
  costPerM2: number;
  note: string;
  builtin?: boolean;
}

export interface GlassMeta {
  materialId: ID;
  buildingId: ID;
  floor: number;
  facade: FacadeKind;
  seeThrough: boolean;
  areaM2: number;
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  elevation: number;
  row?: number;
  col?: number;
}

export interface SceneObject {
  id: ID;
  name: string;
  kind: ObjectKind;
  positions: number[];
  normals: number[];
  indices: number[];
  color: string;
  visible: boolean;
  source: 'builtin' | 'obj';
  glass?: GlassMeta;
}

export interface Building {
  id: ID;
  name: string;
  position: [number, number];
  width: number;
  depth: number;
  floors: number;
  floorHeight: number;
  rotation: number;
  objectIds: ID[];
}

export interface TreeInstance {
  id: ID;
  name: string;
  species: string;
  x: number;
  z: number;
  height: number;
  crownRadius: number;
  color: string;
}

export interface WaterInstance {
  id: ID;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
}

export interface AssessmentSettings {
  birdHeight: number;
  birdDirection: number;
  bidirectional: boolean;
  viewDistance: number;
  sampleCount: 64 | 128 | 256;
  greenRadiusM: number;
  reflectionWeight: number;
  greenWeight: number;
  floorWeight: number;
  seeThroughWeight: number;
  highThreshold: number;
  mediumThreshold: number;
}

export interface MitigationState {
  assignments: Record<ID, ID>;
  appliedAt?: string;
  target: number;
}

export interface Project {
  schemaVersion: 1;
  id: ID;
  name: string;
  location: string;
  city: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  settings: AssessmentSettings;
  buildings: Building[];
  objects: SceneObject[];
  trees: TreeInstance[];
  water: WaterInstance[];
  mitigation: MitigationState;
}

export interface GlassAnalysis {
  glassId: ID;
  sampleCount: number;
  totalWeight: number;
  avgFresnel: number;
  maxFresnel: number;
  treeShare: number;
  skyShare: number;
  waterShare: number;
  glassShare: number;
  throughShare: number;
  markerShare: number;
  reflectionIntensity: number;
  nearestTreeDistance: number;
  greenFactor: number;
  floorFactor: number;
  riskBefore: number;
  riskAfter: number;
  deterrenceBefore: number;
  deterrenceAfter: number;
}

export interface AnalysisResult {
  projectId: ID;
  backend: 'webgpu' | 'cpu-reference';
  gpuName: string;
  computedAt: string;
  sampleCount: number;
  glasses: Record<ID, GlassAnalysis>;
  fresnelValidation?: FresnelValidation;
}

export interface FresnelCheckPoint {
  angleDeg: number;
  expected: number;
  actual: number;
  absoluteError: number;
  relativeError: number;
}

export interface FresnelValidation {
  backend: 'webgpu' | 'cpu-reference';
  maxAbsoluteError: number;
  maxRelativeError: number;
  passed: boolean;
  points: FresnelCheckPoint[];
}

export interface AppSettings {
  id: 'app';
  defaultBirdHeight: number;
  defaultBirdDirection: number;
  defaultSampleCount: 64 | 128 | 256;
  reduceMotion: boolean;
}

export interface ExportBundle {
  app: 'bird-glass-studio';
  schemaVersion: 1;
  exportedAt: string;
  project: Project;
  materials: GlassMaterial[];
}
