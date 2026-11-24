import type { AppContext } from './context';
import type { TreeInstance, WaterInstance } from '../types';
import { h, icon } from './dom';
import { createSceneViewer } from './building_scene';
import { renderInspector } from './building_inspector';
import { createBoxObject, createFacadePanels } from '../core/geometry';
import { parseObj } from '../core/obj';
import { readFileAsText, uid } from '../core/math';
import { facadeLabel } from '../core/materials';

function field(label: string, input: HTMLElement, hint?: string) {
  return h('label', { class: 'field' }, label, input, hint ? h('span', { class: 'hint' }, hint) : null);
}
function numInput(value: number, step = 1) {
  return h('input', { class: 'input', type: 'number', value, step }) as HTMLInputElement;
}

export function renderBuildingPage(ctx: AppContext): HTMLElement & { dispose?: () => void } {
  const project = ctx.current!;
  let selectedId: string | null = ctx.selectedObjectId;
  const viewer = createSceneViewer((id) => selectObject(id));

  const listHost = h('div', { class: 'tree-list' });
  const inspectorHost = h('div', null);

  function syncViewer() {
    viewer.sync(project, ctx.materials, selectedId);
  }

  function selectObject(id: string | null) {
    selectedId = id;
    ctx.setSelectedObject(id);
    syncViewer();
    renderPanels();
  }

  function renderPanels() {
    inspectorHost.replaceChildren(renderInspector(ctx, selectedId, () => { syncViewer(); renderPanels(); }));
    listHost.replaceChildren(...project.objects.map((o) => h('div', {
      class: `list-row ${o.id === selectedId ? 'active' : ''}`,
      tabindex: '0',
      onClick: () => selectObject(o.id),
    },
      h('span', { class: `badge ${o.glass ? 'primary' : ''}` }, o.glass ? '玻' : '体'),
      h('div', { class: 'grow' }, h('strong', null, o.name), h('span', null, o.glass ? `${facadeLabel(o.glass.facade)} · ${o.glass.floor}F · ${o.glass.areaM2.toFixed(1)}㎡${o.glass.seeThrough ? ' · 看穿' : ''}` : `${o.kind} · ${o.source === 'obj' ? 'OBJ' : '内置'}`)),
    )));
  }

  const nameInput = h('input', { class: 'input', value: project.name }) as HTMLInputElement;
  nameInput.addEventListener('input', () => { project.name = nameInput.value; ctx.mutateProject(() => undefined); });
  const cityInput = h('input', { class: 'input', value: project.city, placeholder: '例如:杭州' }) as HTMLInputElement;
  cityInput.addEventListener('input', () => { project.city = cityInput.value; ctx.mutateProject(() => undefined); });
  const locationInput = h('input', { class: 'input', value: project.location, placeholder: '地块、道路或湖岸位置' }) as HTMLInputElement;
  locationInput.addEventListener('input', () => { project.location = locationInput.value; ctx.mutateProject(() => undefined); });

  const gen = { name: h('input', { class: 'input', value: '新建塔楼' }) as HTMLInputElement, cx: numInput(0), cz: numInput(0), w: numInput(24), d: numInput(16), floors: numInput(3), fh: numInput(4.2, 0.1) };
  const generateButton = h('button', { class: 'btn primary', onClick: () => {
    const buildingId = uid('bld');
    const width = Number(gen.w.value) || 24;
    const depth = Number(gen.d.value) || 16;
    const floors = Math.max(1, Number(gen.floors.value) || 1);
    const floorHeight = Number(gen.fh.value) || 4;
    const cx = Number(gen.cx.value) || 0;
    const cz = Number(gen.cz.value) || 0;
    const height = floors * floorHeight;
    const mass = createBoxObject({ name: `${gen.name.value || '建筑'}-体块`, width, height, depth, center: [cx, height / 2, cz], color: '#d7dde5' });
    const baysX = Math.max(2, Math.round(width / 3));
    const baysZ = Math.max(2, Math.round(depth / 3));
    const panels = [
      ...createFacadePanels({ buildingId, facade: 'south', axis: 'x', fixed: cz + depth / 2, sign: 1, length: width, bays: baysX, floors, floorHeight, centerAlong: cx, materialId: 'mat-low-e', namePrefix: `${gen.name.value}-南` }),
      ...createFacadePanels({ buildingId, facade: 'north', axis: 'x', fixed: cz - depth / 2, sign: -1, length: width, bays: baysX, floors, floorHeight, centerAlong: cx, materialId: 'mat-low-e', namePrefix: `${gen.name.value}-北` }),
      ...createFacadePanels({ buildingId, facade: 'east', axis: 'z', fixed: cx + width / 2, sign: 1, length: depth, bays: baysZ, floors, floorHeight, centerAlong: cz, materialId: 'mat-clear', namePrefix: `${gen.name.value}-东` }),
      ...createFacadePanels({ buildingId, facade: 'west', axis: 'z', fixed: cx - width / 2, sign: -1, length: depth, bays: baysZ, floors, floorHeight, centerAlong: cz, materialId: 'mat-clear', namePrefix: `${gen.name.value}-西` }),
    ];
    project.objects.push(mass, ...panels);
    project.buildings.push({ id: buildingId, name: gen.name.value || '新建筑', position: [cx, cz], width, depth, floors, floorHeight, rotation: 0, objectIds: [mass.id, ...panels.map((p) => p.id)] });
    ctx.mutateProject(() => undefined, { immediate: true });
    selectedId = panels[0]?.id ?? null;
    syncViewer(); renderPanels();
    ctx.toast(`已生成 ${panels.length} 块参数化幕墙玻璃`, 'ok');
  } }, icon('plus'), '生成盒体与幕墙');

  const unitSelect = h('select', { class: 'input' }, h('option', { value: '1' }, '米 m'), h('option', { value: '0.01' }, '厘米 cm'), h('option', { value: '0.001' }, '毫米 mm')) as HTMLSelectElement;
  const centerCheck = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const groundCheck = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const glassCheck = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const objFile = h('input', { type: 'file', accept: '.obj,text/plain', style: 'display:none' }) as HTMLInputElement;
  objFile.addEventListener('change', async () => {
    const file = objFile.files?.[0];
    if (!file) return;
    try {
      const objects = parseObj(await readFileAsText(file), { scale: Number(unitSelect.value), centerXZ: centerCheck.checked, groundToZero: groundCheck.checked, defaultGlass: glassCheck.checked });
      project.objects.push(...objects);
      ctx.mutateProject(() => undefined, { immediate: true });
      syncViewer(); renderPanels();
      ctx.toast(`OBJ 导入成功:${objects.length} 个对象,${objects.filter((o) => o.glass).length} 个自动识别为玻璃`, 'ok');
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : 'OBJ 导入失败', 'error');
    } finally { objFile.value = ''; }
  });

  const treeX = numInput(-10), treeZ = numInput(12), treeH = numInput(8), treeR = numInput(2.8, 0.1);
  const waterX = numInput(0), waterZ = numInput(24), waterW = numInput(30), waterD = numInput(10);

  const treeCard = h('div', { class: 'card' },
    h('h3', { class: 'card-title' }, '周边树木'), h('p', { class: 'card-sub' }, '用球形树冠代理参与 GPU 反射求交。'),
    h('div', { class: 'field-grid' }, field('X 坐标 m', treeX), field('Z 坐标 m', treeZ), field('树高 m', treeH), field('冠幅半径 m', treeR)),
    h('button', { class: 'btn primary', onClick: () => {
      const t: TreeInstance = { id: uid('tree'), name: `树-${project.trees.length + 1}`, species: '香樟', x: Number(treeX.value) || 0, z: Number(treeZ.value) || 0, height: Number(treeH.value) || 7, crownRadius: Number(treeR.value) || 2.5, color: '#2f7d4f' };
      project.trees.push(t); ctx.mutateProject(() => undefined, { immediate: true }); syncViewer(); ctx.toast('已添加树木');
    } }, icon('leaf', 16), '摆放树木'),
  );

  const waterCard = h('div', { class: 'card' },
    h('h3', { class: 'card-title' }, '水体'), h('p', { class: 'card-sub' }, '湖面、水池会反射天空并作为独立环境类别统计。'),
    h('div', { class: 'field-grid' }, field('X', waterX), field('Z', waterZ), field('宽度', waterW), field('深度', waterD)),
    h('button', { class: 'btn primary', onClick: () => {
      const w: WaterInstance = { id: uid('water'), name: `水体-${project.water.length + 1}`, x: Number(waterX.value) || 0, z: Number(waterZ.value) || 0, width: Number(waterW.value) || 12, depth: Number(waterD.value) || 6, color: '#79b7d8' };
      project.water.push(w); ctx.mutateProject(() => undefined, { immediate: true }); syncViewer(); ctx.toast('已添加水体');
    } }, icon('water', 16), '摆放水体'),
  );

  const element = h('div', null,
    h('div', { class: 'page-head' },
      h('div', null, h('h2', null, '建筑与环境'), h('p', null, '导入简单 OBJ 体块并单独标记玻璃面,或用参数化幕墙快速搭建。周边树木、水体使用简模摆放,转角、连廊和对穿入口可标记为看穿位置。')),
      h('div', { class: 'head-actions' }, h('button', { class: 'btn', onClick: () => objFile.click() }, icon('upload'), '导入 OBJ'), h('button', { class: 'btn primary', onClick: () => ctx.navigate('reflection') }, icon('reflection'), '去反射分析')),
      objFile,
    ),
    h('div', { class: 'layout-4-8' },
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', { class: 'card-title' }, '项目信息'), h('div', { class: 'field-grid mt-4' }, field('项目名称', nameInput), field('城市', cityInput), h('div', { style: 'grid-column:1/-1' }, field('位置', locationInput)))),
        h('div', { class: 'card' }, h('h3', { class: 'card-title' }, '参数化建筑'), h('div', { class: 'field-grid mt-4' }, field('名称', gen.name), field('楼层数', gen.floors), field('面宽 m', gen.w), field('进深 m', gen.d), field('层高 m', gen.fh), field('中心 X', gen.cx), field('中心 Z', gen.cz)), generateButton),
        h('div', { class: 'card' }, h('h3', { class: 'card-title' }, 'OBJ 导入选项'), h('div', { class: 'field-grid mt-4' }, field('单位换算', unitSelect), field('自动玻璃', glassCheck, '名称或 usemtl 含 glass/window/玻璃 时识别')), h('div', { class: 'row' }, h('label', { class: 'check-field' }, centerCheck, 'XZ 居中'), h('label', { class: 'check-field' }, groundCheck, '底部落到 y=0'))),
        treeCard, waterCard,
      ),
      h('div', { class: 'stack' }, viewer.element, h('div', { class: 'grid-cols-2' }, h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, '对象列表'), h('span', { class: 'badge' }, `${project.objects.length}`)), listHost), inspectorHost)),
    ),
  ) as HTMLElement & { dispose?: () => void };

  queueMicrotask(() => { syncViewer(); renderPanels(); });
  element.dispose = () => viewer.dispose();
  return element;
}
