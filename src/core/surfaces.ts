import type { BoxBody, BoxFace, GlassSurface, Vec3 } from './types';
import { quadArea, uid } from './geom';

export interface FaceBasis {
  normal: Vec3;
  /** 沿立面水平方向 */
  axisU: Vec3;
  /** 竖直方向 */
  axisV: Vec3;
  /** 立面中心 */
  center: Vec3;
  width: number;
  height: number;
}

/** 盒体某朝向立面的基。北=+Z，东=+X（与 headingToDir 一致）。 */
export function boxFaceBasis(body: BoxBody, face: BoxFace): FaceBasis {
  const { center, size } = body;
  const [w, h, d] = [size.x, size.y, size.z];
  switch (face) {
    case 'north': // +Z
      return {
        normal: { x: 0, y: 0, z: 1 },
        axisU: { x: 1, y: 0, z: 0 },
        axisV: { x: 0, y: 1, z: 0 },
        center: { x: center.x, y: center.y, z: center.z + d / 2 },
        width: w,
        height: h,
      };
    case 'south': // -Z
      return {
        normal: { x: 0, y: 0, z: -1 },
        axisU: { x: -1, y: 0, z: 0 },
        axisV: { x: 0, y: 1, z: 0 },
        center: { x: center.x, y: center.y, z: center.z - d / 2 },
        width: w,
        height: h,
      };
    case 'east': // +X
      return {
        normal: { x: 1, y: 0, z: 0 },
        axisU: { x: 0, y: 0, z: -1 },
        axisV: { x: 0, y: 1, z: 0 },
        center: { x: center.x + w / 2, y: center.y, z: center.z },
        width: d,
        height: h,
      };
    case 'west': // -X
      return {
        normal: { x: -1, y: 0, z: 0 },
        axisU: { x: 0, y: 0, z: 1 },
        axisV: { x: 0, y: 1, z: 0 },
        center: { x: center.x - w / 2, y: center.y, z: center.z },
        width: d,
        height: h,
      };
    case 'top':
      return {
        normal: { x: 0, y: 1, z: 0 },
        axisU: { x: 1, y: 0, z: 0 },
        axisV: { x: 0, y: 0, z: 1 },
        center: { x: center.x, y: center.y + h / 2, z: center.z },
        width: w,
        height: d,
      };
  }
}

function pt(b: FaceBasis, u: number, y: number): Vec3 {
  // u 沿 axisU（米，相对立面中心），y 为绝对标高
  return {
    x: b.center.x + b.axisU.x * u,
    y,
    z: b.center.z + b.axisU.z * u,
  };
}

export interface PanelSpec {
  body: BoxBody;
  face: BoxFace;
  /** 该面水平分块序号/总数 */
  segIndex?: number;
  segCount?: number;
  /** 水平方向相对内缩 m */
  marginM?: number;
  /** 绝对窗台/窗顶标高 m */
  y0: number;
  y1: number;
  floor: number;
  glassTypeId: string;
  name?: string;
  isCorner?: boolean;
  isSeeThrough?: boolean;
  seeThroughDepthM?: number;
  greenDistanceOverrideM?: number | null;
}

/** 在盒体立面上生成一块玻璃（按段划分水平区间）。 */
export function makePanel(spec: PanelSpec): GlassSurface {
  const b = boxFaceBasis(spec.body, spec.face);
  const segCount = Math.max(1, spec.segCount ?? 1);
  const segIndex = spec.segIndex ?? 0;
  const margin = spec.marginM ?? 0.15;
  const segW = b.width / segCount;
  const u0 = -b.width / 2 + segW * segIndex + margin;
  const u1 = -b.width / 2 + segW * (segIndex + 1) - margin;
  const y0 = spec.y0;
  const y1 = spec.y1;

  // 四角：左下、右下、右上、左上（沿 axisU 方向）
  const corners: [Vec3, Vec3, Vec3, Vec3] = [
    pt(b, u0, y0),
    pt(b, u1, y0),
    pt(b, u1, y1),
    pt(b, u0, y1),
  ];

  const faceLabel: Record<BoxFace, string> = {
    north: '北立面',
    south: '南立面',
    east: '东立面',
    west: '西立面',
    top: '屋面',
  };

  const area = quadArea(corners);
  return {
    id: uid('srf'),
    name: spec.name ?? `${spec.body.name}·${faceLabel[spec.face]}${spec.floor ? `·${spec.floor}F` : ''}${segCount > 1 ? `-${segIndex + 1}` : ''}`,
    glassTypeId: spec.glassTypeId,
    source: { type: 'box-face', bodyId: spec.body.id, face: spec.face },
    corners,
    normal: b.normal,
    areaM2: area,
    floor: spec.floor,
    centerHeightM: (y0 + y1) / 2,
    isCorner: !!spec.isCorner,
    isSeeThrough: !!spec.isSeeThrough,
    seeThroughDepthM: spec.seeThroughDepthM,
    greenDistanceOverrideM: spec.greenDistanceOverrideM ?? null,
    retrofitGlassTypeId: null,
  };
}

/** 为一个盒体每层每立面生成带状窗（每面 segCount 块）。 */
export function makeRibbonWindows(opts: {
  body: BoxBody;
  faces?: BoxFace[];
  floors: number;
  floorHeight: number;
  baseY?: number;
  sillM?: number;
  headOffsetM?: number;
  segCount?: number;
  glassTypeId: string | ((floor: number, face: BoxFace, seg: number) => string);
  cornerFloors?: number[];
}): GlassSurface[] {
  const out: GlassSurface[] = [];
  const baseY = opts.baseY ?? opts.body.center.y - opts.body.size.y / 2;
  const sill = opts.sillM ?? 0.9;
  const head = opts.headOffsetM ?? 0.5;
  const faces = opts.faces ?? (['north', 'south', 'east', 'west'] as BoxFace[]);
  for (let f = 1; f <= opts.floors; f++) {
    const y0 = baseY + (f - 1) * opts.floorHeight + sill;
    const y1 = baseY + f * opts.floorHeight - head;
    for (const face of faces) {
      const segCount = opts.segCount ?? 1;
      for (let s = 0; s < segCount; s++) {
        const gid =
          typeof opts.glassTypeId === 'function' ? opts.glassTypeId(f, face, s) : opts.glassTypeId;
        // 立面两端的板块标记为转角玻璃
        const isCorner =
          (opts.cornerFloors?.includes(f) ?? true) && (s === 0 || s === segCount - 1);
        out.push(
          makePanel({
            body: opts.body,
            face,
            segIndex: s,
            segCount,
            y0,
            y1,
            floor: f,
            glassTypeId: gid,
            isCorner: isCorner && segCount > 1,
          }),
        );
      }
    }
  }
  return out;
}
