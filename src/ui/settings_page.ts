import type { AppContext } from './context';
import { h, icon } from './dom';
import { createFresnelPanel } from './fresnel_panel';
import { dbPutAppSettings, reseedTestProjects } from '../core/db';
import { downloadBlob } from '../core/math';

export function renderSettingsPage(ctx: AppContext): HTMLElement {
  const app = ctx.appSettings;
  const project = ctx.current;

  const height = h('input', { class: 'input', type: 'number', step: '0.5', value: app.defaultBirdHeight }) as HTMLInputElement;
  height.addEventListener('input', () => { app.defaultBirdHeight = Number(height.value) || 6; void dbPutAppSettings(app); });
  const direction = h('input', { class: 'input', type: 'number', min: 0, max: 359, value: app.defaultBirdDirection }) as HTMLInputElement;
  direction.addEventListener('input', () => { app.defaultBirdDirection = Number(direction.value) || 0; void dbPutAppSettings(app); });
  const samples = h('select', { class: 'input' }, h('option', { value: '64', selected: app.defaultSampleCount === 64 }, '64'), h('option', { value: '128', selected: app.defaultSampleCount === 128 }, '128'), h('option', { value: '256', selected: app.defaultSampleCount === 256 }, '256')) as HTMLSelectElement;
  samples.addEventListener('change', () => { app.defaultSampleCount = Number(samples.value) as 64 | 128 | 256; void dbPutAppSettings(app); });

  const defaultCard = h('div', { class: 'card' },
    h('h3', { class: 'card-title' }, '新项目默认值'),
    h('div', { class: 'field-grid mt-4' },
      h('label', { class: 'field' }, '默认鸟飞高度 m', height),
      h('label', { class: 'field' }, '默认方向角', direction),
      h('label', { class: 'field' }, '采样密度', samples),
    ),
    h('p', { class: 'hint' }, '这些设置保存在 IndexedDB 的 kv store,不会覆盖当前项目已保存的评估参数。'),
  );

  const weightCard = project ? renderWeights(ctx) : h('div', { class: 'card empty-state' }, h('h3', null, '未打开项目'), h('p', null, '从项目列表打开一个项目后,可调整当前风险权重。'), h('button', { class: 'btn primary', onClick: () => ctx.navigate('projects') }, '去项目列表'));

  const dataCard = h('div', { class: 'card stack' },
    h('h3', { class: 'card-title' }, '数据与测试项目'),
    h('p', { class: 'muted small' }, '所有项目、玻璃库和设置均保存在浏览器 IndexedDB。导出的项目 JSON 可发给同事导入。'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onClick: async () => {
        const list = await reseedTestProjects();
        ctx.projects.splice(0, ctx.projects.length, ...list);
        ctx.toast('已重建临湖办公楼和玻璃连廊商场', 'ok');
        ctx.navigate('projects');
      } }, icon('refresh', 16), '重建两个测试项目'),
      h('button', { class: 'btn', onClick: () => {
        downloadBlob(JSON.stringify({ app: 'bird-glass-studio', exportedAt: new Date().toISOString(), projects: ctx.projects, materials: ctx.materials }, null, 2), '羽鉴-全部数据.json', 'application/json');
      } }, icon('download', 16), '导出全部数据'),
      h('button', { class: 'btn danger', id: 'clear-db' }, icon('trash', 16), '清空 IndexedDB 并刷新'),
    ),
  );
  const clearBtn = dataCard.querySelector('#clear-db') as HTMLButtonElement;
  clearBtn.addEventListener('click', async () => {
    if (clearBtn.dataset.confirm !== '1') {
      clearBtn.dataset.confirm = '1';
      clearBtn.textContent = '再点一次确认清空';
      setTimeout(() => { clearBtn.dataset.confirm = '0'; clearBtn.replaceChildren(icon('trash', 16), document.createTextNode('清空 IndexedDB 并刷新')); }, 3000);
      return;
    }
    indexedDB.deleteDatabase('bird-glass-studio-db');
    setTimeout(() => location.reload(), 300);
  });

  const aboutCard = h('div', { class: 'card' },
    h('h3', { class: 'card-title' }, '计算与实现说明'),
    h('div', { class: 'stack mt-4 small muted' },
      h('p', null, '渲染:原生 WebGPU render pipeline,玻璃 fragment shader 实现精确 Fresnel、程序化天空、太阳高光和树冠代理反射。'),
      h('p', null, '统计:WebGPU compute shader 为每块玻璃循环鸟眼方向与面板样本,输出 Fresnel 均值/极值、树影/天空/水体/看穿/图案份额和风险分。'),
      h('p', null, '兜底:浏览器不支持 WebGPU 时显示明确状态,并使用同一公式的 TypeScript CPU 参考实现,不会标注成 GPU 结果。'),
      h('p', null, '存储:projects、materials、kv 三个 IndexedDB object store;项目编辑防抖自动保存。'),
    ),
  );

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, '设置与校验'), h('p', null, '管理默认评估参数、风险权重、测试数据,并验证硬要求:GPU Fresnel 与精确公式误差小于 1%。'))),
    h('div', { class: 'grid-cols-2' }, defaultCard, weightCard),
    h('div', { class: 'mt-5' }, createFresnelPanel()),
    h('div', { class: 'grid-cols-2 mt-5' }, dataCard, aboutCard),
  );
}

function renderWeights(ctx: AppContext): HTMLElement {
  const p = ctx.current!;
  const s = p.settings;
  const make = (key: 'reflectionWeight' | 'greenWeight' | 'floorWeight' | 'seeThroughWeight', label: string) => {
    const input = h('input', { type: 'range', min: '0', max: '60', value: s[key], style: 'width:100%;accent-color:var(--primary)' }) as HTMLInputElement;
    const value = h('strong', null, String(s[key]));
    input.addEventListener('input', () => { s[key] = Number(input.value); value.textContent = input.value; ctx.mutateProject(() => undefined, { immediate: true }); });
    return h('label', { class: 'field' }, h('span', { class: 'row' }, label, value), input);
  };
  return h('div', { class: 'card' }, h('h3', { class: 'card-title' }, '当前项目风险权重'), h('div', { class: 'field-grid mt-4' }, make('reflectionWeight', '反射强度'), make('greenWeight', '绿化邻近'), make('floorWeight', '低楼层'), make('seeThroughWeight', '看穿/连廊')), h('p', { class: 'hint' }, '权重不必强制总和 100;风险分最终截断到 0–100。'));
}
