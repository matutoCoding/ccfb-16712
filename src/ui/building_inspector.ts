import type { FacadeKind } from '../types';
import type { AppContext } from './context';
import { h, icon } from './dom';
import { attachGlassMeta } from '../core/obj';
import { facadeLabel } from '../core/materials';
import { formatNumber } from '../core/math';

export function renderInspector(ctx: AppContext, selectedId: string | null, onChanged: () => void): HTMLElement {
  const project = ctx.current!;
  const obj = project.objects.find((o) => o.id === selectedId) ?? null;
  if (!obj) {
    return h('div', { class: 'card' },
      h('div', { class: 'empty-state' }, h('div', { class: 'empty-icon' }, icon('building', 24)), h('h3', null, '未选择对象'), h('p', null, '在三维视图点击构件,或从对象列表选择。导入的玻璃组会自动识别,也可以手动把任意面标记为玻璃。')),
    );
  }

  const save = () => { ctx.mutateProject(() => undefined, { immediate: true }); onChanged(); };
  const g = obj.glass;

  if (!g) {
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, obj.name), h('p', { class: 'card-sub' }, `${obj.source === 'obj' ? 'OBJ 导入对象' : '内置几何'} · ${(obj.positions.length / 3).toFixed(0)} 顶点`))),
      h('p', { class: 'muted' }, '该对象当前作为非玻璃体块渲染。若它是幕墙、窗面或连廊玻璃,请标记后参与 GPU 反射统计。'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onClick: () => { attachGlassMeta(obj, ctx.materials[0]?.id ?? 'mat-clear', 1); save(); ctx.toast('已标记为玻璃面,可在右侧设置楼层和看穿属性', 'ok'); } }, icon('glass', 16), '标记为玻璃面'),
        h('button', { class: 'btn danger', onClick: () => { project.objects = project.objects.filter((o) => o.id !== obj.id); ctx.setSelectedObject(null); ctx.mutateProject(() => undefined, { immediate: true }); onChanged(); } }, icon('trash', 16), '删除对象'),
      ),
    );
  }

  const materialOptions = ctx.materials.map((m) => h('option', { value: m.id, selected: g.materialId === m.id }, m.name));
  const facadeOptions: FacadeKind[] = ['south', 'north', 'east', 'west', 'corner', 'corridor', 'roof', 'other'];

  return h('div', { class: 'card stack' },
    h('div', { class: 'card-head' },
      h('div', { style: 'min-width:0' }, h('h3', { class: 'card-title' }, obj.name), h('p', { class: 'card-sub' }, `面积 ${formatNumber(g.areaM2)}㎡ · 宽 ${formatNumber(g.width)}m × 高 ${formatNumber(g.height)}m`)),
      h('span', { class: g.seeThrough ? 'badge danger' : 'badge primary' }, g.seeThrough ? '看穿高风险' : facadeLabel(g.facade)),
    ),
    h('div', { class: 'field-grid' },
      h('label', { class: 'field' }, '玻璃材料', h('select', { class: 'input', onChange: (e: Event) => { g.materialId = (e.target as HTMLSelectElement).value; save(); } }, materialOptions)),
      h('label', { class: 'field' }, '位置分类', h('select', { class: 'input', value: g.facade, onChange: (e: Event) => { g.facade = (e.target as HTMLSelectElement).value as FacadeKind; save(); } }, facadeOptions.map((f) => h('option', { value: f, selected: g.facade === f }, facadeLabel(f))))),
      h('label', { class: 'field' }, '楼层', h('input', { class: 'input', type: 'number', min: '1', value: g.floor, onInput: (e: Event) => { g.floor = Math.max(1, Number((e.target as HTMLInputElement).value) || 1); ctx.mutateProject(() => undefined); } , onChange: save })),
      h('label', { class: 'field' }, '所属建筑 ID', h('input', { class: 'input', value: g.buildingId, onChange: (e: Event) => { g.buildingId = (e.target as HTMLInputElement).value || 'imported'; save(); } })),
    ),
    h('label', { class: 'check-field' }, h('input', { type: 'checkbox', checked: g.seeThrough, onChange: (e: Event) => { g.seeThrough = (e.target as HTMLInputElement).checked; save(); } }), '可看穿位置:玻璃转角、连廊、入口对穿或两侧透明'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onClick: () => { obj.glass = undefined; obj.kind = 'mass'; save(); } }, '取消玻璃标记'),
      h('button', { class: 'btn danger right', onClick: () => { project.objects = project.objects.filter((o) => o.id !== obj.id); delete project.mitigation.assignments[obj.id]; ctx.setSelectedObject(null); ctx.mutateProject(() => undefined, { immediate: true }); onChanged(); } }, icon('trash', 16), '删除'),
    ),
  );
}
