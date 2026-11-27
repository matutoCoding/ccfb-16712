/** 全局数据模型：所有持久化对象均为可结构化克隆的纯数据。 */

export type ID = string;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/* ---------------- 玻璃库 ---------------- */

export type PatternType = 'none' | 'dots' | 'stripes';

export interface GlassPattern {
  type: PatternType;
  /** 图案颜色（釉点/条纹） */
  color: string;
  /** 点直径或条纹宽度 (m) */
  sizeM: number;
  /** 水平间距（点中心距 / 条纹周期） (m) */
  spacingXM: number;
  /** 竖直间距（点阵行距） (m)；条纹时忽略 */
  spacingYM: number;
}

export interface GlassType {
  id: ID;
  name: string;
  vendor?: string;
  /** 法向可见光反射率 0..1（用于反解折射率 n） */
  reflectance: number;
  /** 可见光透射率 0..1 */
  transmittance: number;
  /** 镀膜/基片颜色 #rrggbb */
  coatingColor: string;
  /** 折射率；由反射率反解，也允许高级覆盖 */
  ior: number;
  /** 是否为防鸟撞玻璃（带可见图案） */
  birdSafe: boolean;
  pattern: GlassPattern;
  /** 备注 */
  note?: string;
  builtin?: boolean;
}

/* ---------------- 建筑与环境 ---------------- */

export interface BoxBody {
  id: ID;
  kind: 'box';
  name: string;
  center: Vec3;
  size: Vec3;
  /** 楼层数（用于楼层风险因子） */
  floors: number;
  floorHeightM: number;
  color?: string;
}

export interface ObjBody {
  id: ID;
  kind: 'obj';
  name: string;
  /** 顶点 xyz 扁平数组（已做缩放/平移） */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** OBJ 中被标记为玻璃的三角形起始/数量段（按子网格） */
  glassRanges: { start: number; count: number; glassId: ID }[];
  /** 整体放置变换 */
  translation: Vec3;
  scale: number;
  color?: string;
}

export type BuildingBody = BoxBody | ObjBody;

/** 一块（或一片）玻璃面，风险评估的最小单元。 */
export interface GlassSurface {
  id: ID;
  name: string;
  glassTypeId: ID;
  /** 来源：参数化盒体立面 / OBJ 子网格 / 手动 */
  source:
    | { type: 'box-face'; bodyId: ID; face: BoxFace }
    | { type: 'obj-range'; bodyId: ID; rangeIndex: number }
    | { type: 'quad' };
  /** 四边形四角（世界坐标，逆时针，从外侧看）；OBJ 面用其包围代表平面 */
  corners: [Vec3, Vec3, Vec3, Vec3];
  /** 单位外法线 */
  normal: Vec3;
  areaM2: number;
  /** 该玻璃所在楼层（1 起），用于楼层因子；0 表示跨层/连廊 */
  floor: number;
  /** 玻璃中心高度 m */
  centerHeightM: number;
  /** 转角玻璃（两面相交、鸟可能误以为可穿过） */
  isCorner: boolean;
  /** 连廊 / 可看穿通道（对侧也有玻璃或开洞） */
  isSeeThrough: boolean;
  /** 可看穿方向上的对侧距离 m（用于看穿风险，0 表示未填） */
  seeThroughDepthM?: number;
  /** 手动覆盖最近绿化距离 m；否则由树木自动计算 */
  greenDistanceOverrideM?: number | null;
  /** 改造时选用的玻璃 */
  retrofitGlassTypeId?: ID | null;
}

export type BoxFace = 'north' | 'south' | 'east' | 'west' | 'top';

export interface TreeItem {
  id: ID;
  kind: 'tree';
  name: string;
  position: Vec3;
  /** 树冠半径 m */
  crownRadiusM: number;
  heightM: number;
  /** 树冠颜色 */
  color: string;
}

export interface WaterBody {
  id: ID;
  kind: 'water';
  name: string;
  /** 矩形水面中心与长宽 m */
  center: Vec3;
  widthM: number;
  depthM: number;
  color: string;
}

export type EnvironmentItem = TreeItem | WaterBody;

/* ---------------- 分析参数与结果 ---------------- */

export interface BirdProfile {
  /** 鸟飞行高度采样范围 m */
  minHeightM: number;
  maxHeightM: number;
  heightSteps: number;
  /** 主导飞行方向（方位角，度，0=北 +Z? 约定：0 北，90 东），采样以此为中心 */
  headingDeg: number;
  headingSpreadDeg: number;
  headingSteps: number;
  /** 观察距离 m（鸟距玻璃多远取样环境反射） */
  observerDistanceM: number;
}

export interface ReflectionCell {
  surfaceId: ID;
  /** 采样点（玻璃上） */
  point: Vec3;
  heightM: number;
  headingDeg: number;
  /** 入射角余弦 */
  cosTheta: number;
  fresnelR: number;
  /** 反射所见分类占比 0..1（sky/tree/water/building/ground） */
  seeSky: number;
  seeTree: number;
  seeWater: number;
  seeBuilding: number;
  /** 是否视线穿过玻璃（透射方向无遮挡） */
  seeThrough: number;
  /** 反射颜色（线性 RGB 0..1） */
  reflectColor: [number, number, number];
}

export interface SurfaceReflectionStat {
  surfaceId: ID;
  sampleCount: number;
  avgFresnel: number;
  maxFresnel: number;
  /** 平均反射中自然栖息地（树+天空+水）占比 */
  habitatReflection: number;
  treeReflection: number;
  skyReflection: number;
  waterReflection: number;
  /** 平均可看穿度 */
  seeThrough: number;
  /** 反射眩光/镜像强度 0..1 = avgFresnel * habitat */
  reflectionIntensity: number;
}

export interface RiskWeights {
  reflection: number;
  greenProximity: number;
  floorHeight: number;
  seeThrough: number;
  corner: number;
}

export interface RiskResult {
  surfaceId: ID;
  /** 0..100 */
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  reflectionScore: number;
  greenScore: number;
  floorScore: number;
  seeThroughScore: number;
  cornerScore: number;
  nearestGreenDistanceM: number;
  /** 防鸟图案带来的风险削减比例 0..1 */
  mitigationPct: number;
  /** 参与计算的玻璃法向反射率 */
  glassReflectance: number;
}

export interface AnalysisSnapshot {
  id: ID;
  createdAt: number;
  birdProfile: BirdProfile;
  weights: RiskWeights;
  reflectionStats: SurfaceReflectionStat[];
  risks: RiskResult[];
  /** 改造后风险（若已选 retrofit） */
  retrofitRisks?: RiskResult[];
  engine: 'webgpu' | 'cpu-reference';
  fresnelGpuMaxRelErrorPct?: number;
}

/* ---------------- 项目 ---------------- */

export interface Project {
  id: ID;
  name: string;
  location: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  buildingBodies: BuildingBody[];
  surfaces: GlassSurface[];
  environment: EnvironmentItem[];
  bird: BirdProfile;
  weights: RiskWeights;
  snapshots: AnalysisSnapshot[];
  latestSnapshotId?: ID | null;
}

export interface Settings {
  id: 'app-settings';
  /** 风险阈值 */
  mediumThreshold: number;
  highThreshold: number;
  criticalThreshold: number;
  /** GPU 菲涅尔自检误差上限（百分比） */
  fresnelTolerancePct: number;
  /** 自动保存 */
  autoSave: boolean;
  /** 主题 */
  theme: 'dark' | 'light';
  /** 报告机构名 */
  organization: string;
  evaluator: string;
}

export interface ExportBundle {
  format: 'bird-glass-assessment';
  version: 1;
  exportedAt: string;
  projects: Project[];
  glassTypes: GlassType[];
  settings?: Settings;
}
