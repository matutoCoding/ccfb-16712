import type { BirdProfile, Project, TreeItem, WaterBody } from './types';
import { uid } from './geom';
import type { BoxBody } from './types';
import { makePanel, makeRibbonWindows } from './surfaces';
import { DEFAULT_WEIGHTS } from './risk';

export const DEFAULT_BIRD: BirdProfile = {
  minHeightM: 2,
  maxHeightM: 30,
  heightSteps: 6,
  headingDeg: 180,
  headingSpreadDeg: 90,
  headingSteps: 5,
  observerDistanceM: 25,
};

function tree(x: number, z: number, crown = 3, h = 7): TreeItem {
  return {
    id: uid('tree'),
    kind: 'tree',
    name: '景观乔木',
    position: { x, y: 0, z },
    crownRadiusM: crown,
    heightM: h,
    color: '#3f7d4e',
  };
}

function water(name: string, x: number, z: number, w: number, d: number): WaterBody {
  return {
    id: uid('water'),
    kind: 'water',
    name,
    center: { x, y: 0, z },
    widthM: w,
    depthM: d,
    color: '#3e7ca8',
  };
}

function officeBuilding(): Project {
  const body: BoxBody = {
    id: uid('body'),
    kind: 'box',
    name: '主楼',
    center: { x: 0, y: 18, z: 10 },
    size: { x: 48, y: 36, z: 18 },
    floors: 10,
    floorHeightM: 3.6,
    color: '#c9d2da',
  };

  const surfaces = [
    ...makeRibbonWindows({
      body,
      faces: ['south'],
      floors: 10,
      floorHeight: 3.6,
      segCount: 8,
      glassTypeId: (f) => (f <= 3 ? 'glass-reflective-blue' : 'glass-low-e'),
    }),
    ...makeRibbonWindows({
      body,
      faces: ['north'],
      floors: 10,
      floorHeight: 3.6,
      segCount: 8,
      glassTypeId: () => 'glass-low-e',
    }),
    ...makeRibbonWindows({
      body,
      faces: ['east', 'west'],
      floors: 10,
      floorHeight: 3.6,
      segCount: 3,
      glassTypeId: (f) => (f <= 2 ? 'glass-reflective-blue' : 'glass-clear-dgu'),
    }),
  ];

  // 一层南侧大堂：透明、可看穿
  for (const s of surfaces) {
    if (s.source.type === 'box-face' && s.source.face === 'south' && s.floor === 1) {
      s.isSeeThrough = true;
      s.seeThroughDepthM = 18;
      s.glassTypeId = 'glass-clear-dgu';
      s.name = s.name.replace('1F', '1F大堂');
    }
  }

  const trees: TreeItem[] = [];
  for (let i = 0; i < 9; i++) {
    trees.push(tree(-22 + i * 5.5, -4.5 - (i % 2) * 1.6, 2.6 + (i % 3) * 0.5, 6.5 + (i % 3)));
  }
  for (let i = 0; i < 7; i++) trees.push(tree(-24 + i * 8, 23 + (i % 2) * 2, 3, 8));
  for (let i = 0; i < 5; i++) trees.push(tree(28 + (i % 2) * 3, -2 + i * 5, 2.8, 7.5));
  for (let i = 0; i < 4; i++) trees.push(tree(-30 - (i % 2) * 3, 2 + i * 5, 3.2, 8.5));

  return {
    id: uid('prj'),
    name: '云栖湖临湖办公楼',
    location: '浙江 · 杭州 · 云栖湖西岸',
    description:
      '10 层框架-核心筒办公楼，南立面为蓝灰热反射镀膜玻璃，正对湖面与滨水乔木带，候鸟迁徙通道附近，秋季鸟撞报告多发。',
    createdAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now() - 3600_000 * 5,
    buildingBodies: [body],
    surfaces,
    environment: [water('云栖湖', 0, -32, 96, 40), ...trees],
    bird: { ...DEFAULT_BIRD, headingDeg: 205, headingSpreadDeg: 70, maxHeightM: 36, heightSteps: 7 },
    weights: { ...DEFAULT_WEIGHTS },
    snapshots: [],
    latestSnapshotId: null,
  };
}

function mallBuilding(): Project {
  const blockA: BoxBody = {
    id: uid('body'),
    kind: 'box',
    name: '商场 A 馆',
    center: { x: -20, y: 6, z: 0 },
    size: { x: 26, y: 12, z: 18 },
    floors: 2,
    floorHeightM: 6,
    color: '#d8cfc4',
  };
  const blockB: BoxBody = {
    id: uid('body'),
    kind: 'box',
    name: '商场 B 馆',
    center: { x: 20, y: 6, z: 0 },
    size: { x: 26, y: 12, z: 18 },
    floors: 2,
    floorHeightM: 6,
    color: '#cfd6da',
  };
  const corridor: BoxBody = {
    id: uid('body'),
    kind: 'box',
    name: '二层玻璃连廊',
    center: { x: 0, y: 7.4, z: 0 },
    size: { x: 18, y: 3.4, z: 4.6 },
    floors: 0,
    floorHeightM: 3.4,
    color: '#9fb4c4',
  };

  const surfaces = [
    ...makeRibbonWindows({
      body: blockA,
      faces: ['south', 'north'],
      floors: 2,
      floorHeight: 6,
      sillM: 0.5,
      headOffsetM: 0.6,
      segCount: 4,
      glassTypeId: (f) => (f === 1 ? 'glass-clear-dgu' : 'glass-reflective-blue'),
    }),
    ...makeRibbonWindows({
      body: blockB,
      faces: ['south', 'north'],
      floors: 2,
      floorHeight: 6,
      sillM: 0.5,
      headOffsetM: 0.6,
      segCount: 4,
      glassTypeId: (f) => (f === 1 ? 'glass-clear-dgu' : 'glass-reflective-blue'),
    }),
  ];

  // 主入口一层整面透明、可看穿
  for (const s of surfaces) {
    if (s.floor === 1 && s.source.type === 'box-face' && s.source.face === 'south') {
      s.isSeeThrough = true;
      s.seeThroughDepthM = 18;
    }
  }

  // 玻璃连廊两侧长向玻璃（每侧 6 块），全部可看穿，端部转角标高风险
  for (const face of ['south', 'north'] as const) {
    for (let i = 0; i < 6; i++) {
      surfaces.push(
        makePanel({
          body: corridor,
          face,
          segIndex: i,
          segCount: 6,
          marginM: 0.08,
          y0: 5.9,
          y1: 8.9,
          floor: 0,
          glassTypeId: 'glass-clear-dgu',
          name: `玻璃连廊·${face === 'south' ? '南侧' : '北侧'}${i + 1}`,
          isSeeThrough: true,
          seeThroughDepthM: 4.6,
          isCorner: i === 0 || i === 5,
        }),
      );
    }
  }

  const trees: TreeItem[] = [];
  [-28, -16, 16, 28].forEach((x) => trees.push(tree(x, 13.5, 3.2, 7.5)));
  [-30, -12, 12, 30].forEach((x) => trees.push(tree(x, -13, 2.8, 7)));
  for (let i = 0; i < 4; i++) trees.push(tree(-36, -6 + i * 5, 3, 8));
  for (let i = 0; i < 4; i++) trees.push(tree(36, -6 + i * 5, 3, 8));

  return {
    id: uid('prj'),
    name: '星环广场玻璃连廊商场',
    location: '四川 · 成都 · 星环商圈',
    description:
      '两栋 2 层商业体由一座全玻璃封闭连廊在二层连接，连廊两侧玻璃可完全看穿，商场主入口为通高透明幕墙；转角与连廊是典型的“飞行通道错觉”高发位置。',
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 7200_000,
    buildingBodies: [blockA, blockB, corridor],
    surfaces,
    environment: [water('入口镜面水景', 0, 17, 9, 4.5), ...trees],
    bird: { ...DEFAULT_BIRD, minHeightM: 1.5, maxHeightM: 16, heightSteps: 5, headingDeg: 90, headingSpreadDeg: 120, headingSteps: 7 },
    weights: { ...DEFAULT_WEIGHTS, seeThrough: 0.28, reflection: 0.3 },
    snapshots: [],
    latestSnapshotId: null,
  };
}

export function buildSeedProjects(): Project[] {
  return [officeBuilding(), mallBuilding()];
}

/** 新建空白项目：带一个 2 层示意盒体与带状窗，避免空场景。 */
export function createBlankProject(name: string): Project {
  const body: BoxBody = {
    id: uid('body'),
    kind: 'box',
    name: '建筑主体',
    center: { x: 0, y: 6, z: 0 },
    size: { x: 24, y: 12, z: 12 },
    floors: 3,
    floorHeightM: 3.6,
    color: '#cdd5dc',
  };
  const surfaces = makeRibbonWindows({
    body,
    floors: 3,
    floorHeight: 3.6,
    segCount: 4,
    glassTypeId: 'glass-low-e',
  });
  return {
    id: uid('prj'),
    name,
    location: '',
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    buildingBodies: [body],
    surfaces,
    environment: [
      {
        id: uid('water'),
        kind: 'water',
        name: '景观水池',
        center: { x: 0, y: 0, z: -16 },
        widthM: 12,
        depthM: 5,
        color: '#3e7ca8',
      },
    ],
    bird: { ...DEFAULT_BIRD },
    weights: { ...DEFAULT_WEIGHTS },
    snapshots: [],
    latestSnapshotId: null,
  };
}
