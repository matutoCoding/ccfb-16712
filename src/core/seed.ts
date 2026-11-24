import type { Project, TreeInstance, WaterInstance } from '../types';
import { DEFAULT_SETTINGS } from './materials';
import { createBoxObject, createFacadePanels, createPlaneObject } from './geometry';
import { uid } from './math';

function tree(id: string, x: number, z: number, height: number, crownRadius: number, species = '香樟'): TreeInstance {
  return { id, name: `${species}-${id.slice(-4)}`, species, x, z, height, crownRadius, color: '#2f7d4f' };
}

function water(id: string, name: string, x: number, z: number, width: number, depth: number): WaterInstance {
  return { id, name, x, z, width, depth, color: '#79b7d8' };
}

function finalize(name: string, city: string, location: string, description: string, partial: Pick<Project, 'objects' | 'buildings' | 'trees' | 'water' | 'settings'>): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid('prj'),
    name,
    city,
    location,
    description,
    createdAt: now,
    updatedAt: now,
    mitigation: { assignments: {}, target: 65 },
    ...partial,
  };
}

export function createOfficeProject(): Project {
  const buildingId = 'bld-office-main';
  const mass = createBoxObject({ id: 'office-mass', name: '办公楼主体体块', width: 36, height: 16.8, depth: 20, center: [0, 8.4, 0], color: '#d7dde5' });
  const ground = createPlaneObject('场地地面', 96, 82, [0, -0.03, 14], '#e8edf0');

  const south = createFacadePanels({ buildingId, facade: 'south', axis: 'x', fixed: 10, sign: 1, length: 36, bays: 12, floors: 4, floorHeight: 4.2, materialId: 'mat-reflective-blue', namePrefix: '南幕墙' });
  const north = createFacadePanels({ buildingId, facade: 'north', axis: 'x', fixed: -10, sign: -1, length: 36, bays: 12, floors: 4, floorHeight: 4.2, materialId: 'mat-low-e', namePrefix: '北幕墙' });
  const east = createFacadePanels({ buildingId, facade: 'east', axis: 'z', fixed: 18, sign: 1, length: 20, bays: 6, floors: 4, floorHeight: 4.2, materialId: 'mat-low-e', namePrefix: '东幕墙' });
  const west = createFacadePanels({ buildingId, facade: 'west', axis: 'z', fixed: -18, sign: -1, length: 20, bays: 6, floors: 4, floorHeight: 4.2, materialId: 'mat-clear', namePrefix: '西幕墙' });
  const objects = [ground, mass, ...south, ...north, ...east, ...west];

  for (const obj of objects) {
    const g = obj.glass;
    if (!g) continue;
    if (g.facade === 'south' && g.floor === 1 && (g.col ?? 99) >= 4 && (g.col ?? 0) <= 7) g.seeThrough = true;
    if ((g.facade === 'south' && g.col === 11 && g.floor <= 2) || (g.facade === 'east' && g.col === 0 && g.floor === 1)) {
      g.facade = 'corner';
      g.seeThrough = true;
      obj.name = `东南转角-${g.floor}F`;
    }
  }

  const trees = [
    tree('tree-office-01', -15, 13, 8.5, 3.0), tree('tree-office-02', -10, 14.5, 9.5, 3.4),
    tree('tree-office-03', -5, 12.8, 7.8, 2.7), tree('tree-office-04', 1, 14.2, 10, 3.6),
    tree('tree-office-05', 7, 12.6, 8.8, 3.1), tree('tree-office-06', 13, 14.4, 9.2, 3.3),
    tree('tree-office-07', 17, 18, 7.5, 2.6), tree('tree-office-08', -18, 18, 7.8, 2.8),
    tree('tree-office-09', -23, 4, 8.2, 3.0), tree('tree-office-10', -23, -5, 7.2, 2.5),
    tree('tree-office-11', 23, 5, 8.0, 2.9), tree('tree-office-12', 23, -4, 7.6, 2.7),
    tree('tree-office-13', -8, -15, 7.0, 2.4), tree('tree-office-14', 8, -15, 7.4, 2.6),
  ];
  const waterList = [water('water-office-lake', '南侧临湖水面', 0, 29, 48, 18)];

  return finalize('临湖云启办公楼', '杭州', '未来科技城临湖地块', '南侧湖面与香樟林形成强烈天空、绿化倒影,主迁飞方向由湖面指向办公楼。', {
    objects,
    buildings: [{ id: buildingId, name: '办公楼', position: [0, 0], width: 36, depth: 20, floors: 4, floorHeight: 4.2, rotation: 0, objectIds: objects.map((o) => o.id) }],
    trees,
    water: waterList,
    settings: { ...DEFAULT_SETTINGS, birdHeight: 6.5, birdDirection: 0, bidirectional: true },
  });
}

export function createMallProject(): Project {
  const ground = createPlaneObject('商业场地', 104, 76, [0, -0.03, 4], '#e9edf0');
  const westMass = createBoxObject({ id: 'mall-west-mass', name: '商场西馆体块', width: 22, height: 10.4, depth: 18, center: [-17, 5.2, 0], color: '#d6dde5' });
  const eastMass = createBoxObject({ id: 'mall-east-mass', name: '商场东馆体块', width: 22, height: 11.6, depth: 18, center: [17, 5.8, 0], color: '#d6dde5' });
  const slab = createBoxObject({ id: 'corridor-slab', name: '连廊楼板与顶棚', width: 15.2, height: 3.5, depth: 4.4, center: [0, 7.15, 0], color: '#c8d1db' });

  const makeBlock = (bid: string, cx: number, floors: number, fh: number, matId: string) => [
    ...createFacadePanels({ buildingId: bid, facade: 'south', axis: 'x', fixed: 9, sign: 1, length: 22, bays: 7, floors, floorHeight: fh, centerAlong: cx, materialId: matId, namePrefix: `${bid}-南` }),
    ...createFacadePanels({ buildingId: bid, facade: 'north', axis: 'x', fixed: -9, sign: -1, length: 22, bays: 7, floors, floorHeight: fh, centerAlong: cx, materialId: 'mat-low-e', namePrefix: `${bid}-北` }),
    ...createFacadePanels({ buildingId: bid, facade: 'east', axis: 'z', fixed: cx + 11, sign: 1, length: 18, bays: 5, floors, floorHeight: fh, materialId: 'mat-clear', namePrefix: `${bid}-东` }),
    ...createFacadePanels({ buildingId: bid, facade: 'west', axis: 'z', fixed: cx - 11, sign: -1, length: 18, bays: 5, floors, floorHeight: fh, materialId: 'mat-low-e', namePrefix: `${bid}-西` }),
  ];

  const westGlass = makeBlock('bld-mall-west', -17, 2, 5.2, 'mat-low-e');
  const eastGlass = makeBlock('bld-mall-east', 17, 2, 5.8, 'mat-reflective-blue');
  const corridorSouth = createFacadePanels({ buildingId: 'bld-corridor', facade: 'corridor', axis: 'x', fixed: 2.25, sign: 1, length: 14.4, bays: 6, floors: 1, floorHeight: 3.0, baseY: 5.75, materialId: 'mat-low-iron', namePrefix: '连廊南侧' });
  const corridorNorth = createFacadePanels({ buildingId: 'bld-corridor', facade: 'corridor', axis: 'x', fixed: -2.25, sign: -1, length: 14.4, bays: 6, floors: 1, floorHeight: 3.0, baseY: 5.75, materialId: 'mat-low-iron', namePrefix: '连廊北侧' });

  const objects: Project['objects'] = [ground, westMass, eastMass, slab, ...westGlass, ...eastGlass, ...corridorSouth, ...corridorNorth];
  for (const obj of objects) {
    const g = obj.glass;
    if (!g) continue;
    if (g.facade === 'corridor') g.seeThrough = true;
    if (g.floor === 1 && ((g.facade === 'south' && (g.col === 2 || g.col === 4)) || g.facade === 'corner')) g.seeThrough = true;
    if ((g.buildingId === 'bld-mall-east' && g.facade === 'west' && g.floor === 2) || (g.buildingId === 'bld-mall-west' && g.facade === 'east' && g.floor === 2)) {
      g.facade = 'corner';
      g.seeThrough = true;
      obj.name = `连廊接口转角-${g.floor}F`;
    }
  }

  const trees = [
    tree('tree-mall-01', -5.5, -6.5, 7.8, 2.7, '乌桕'), tree('tree-mall-02', 0, -7.2, 8.4, 3.0, '乌桕'), tree('tree-mall-03', 5.5, -6.4, 7.6, 2.6, '乌桕'),
    tree('tree-mall-04', -5.5, 7.2, 8.0, 2.8, '香樟'), tree('tree-mall-05', 0.2, 7.8, 8.8, 3.1, '香樟'), tree('tree-mall-06', 5.8, 7.0, 7.5, 2.6, '香樟'),
    tree('tree-mall-07', -31, 12, 7.2, 2.5), tree('tree-mall-08', 31, 12, 7.6, 2.7), tree('tree-mall-09', -31, -12, 7.0, 2.4), tree('tree-mall-10', 31, -12, 7.4, 2.6),
  ];
  const waterList = [water('water-mall-pool', '南入口镜面水池', 0, 22, 20, 6)];

  return finalize('星环里玻璃连廊商场', '成都', '城南商业综合体', '东西两馆由二层透明玻璃连廊连接,南北两侧乔木和天空可被直接看穿或反射,是典型通道型鸟撞风险。', {
    objects,
    buildings: [
      { id: 'bld-mall-west', name: '西馆', position: [-17, 0], width: 22, depth: 18, floors: 2, floorHeight: 5.2, rotation: 0, objectIds: [] },
      { id: 'bld-mall-east', name: '东馆', position: [17, 0], width: 22, depth: 18, floors: 2, floorHeight: 5.8, rotation: 0, objectIds: [] },
      { id: 'bld-corridor', name: '二层玻璃连廊', position: [0, 0], width: 14.4, depth: 4.5, floors: 1, floorHeight: 3, rotation: 0, objectIds: [] },
    ],
    trees,
    water: waterList,
    settings: { ...DEFAULT_SETTINGS, birdHeight: 7.1, birdDirection: 180, bidirectional: true, sampleCount: 128 },
  });
}

export function createBlankProject(name = '未命名评估项目'): Project {
  return finalize(name, '', '', '从参数化体块或 OBJ 导入开始。', {
    objects: [createPlaneObject('场地地面', 80, 60, [0, -0.03, 0], '#e8edf0')],
    buildings: [],
    trees: [],
    water: [],
    settings: { ...DEFAULT_SETTINGS },
  });
}
