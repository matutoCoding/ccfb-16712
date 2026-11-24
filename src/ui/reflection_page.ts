import type { AppContext } from './context';
import { h, icon } from './dom';
import { facadeLabel } from '../core/materials';
import { formatNumber } from '../core/math';
import { createFresnelPanel } from './fresnel_panel';

function percent(v: number) { return `${(v * 100).toFixed(1)}%`; }

function Compass(direction: number) {
  const svg = `
    <svg width="148" height="148" viewBox="0 0 148 148" style="border-radius:50%;background:radial-gradient(circle,#f0fdfa,#e2e8f0);border:1px solid #cbd5e1">
      <circle cx="74" cy="74" r="54" fill="none" stroke="#cbd5e1" stroke-dasharray="3 6"></circle>
      <text x="74" y="20" text-anchor="middle" font-size="15" fill="#334155" font-weight="700">N</text>
      <text x="74" y="137" text-anchor="middle" font-size="14" fill="#64748b">S</text>
      <text x="12" y="79" text-anchor="middle" font-size="14" fill="#64748b">W</text>
      <text x="136" y="79" text-anchor="middle" font-size="14" fill="#64748b">E</text>
      <g transform="rotate(${direction} 74 74)">
        <path d="M74 24 L84 78 L74 70 L64 78 Z" fill="#0f766e"></path>
        <line x1="74" y1="70" x2="74" y2="118" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"></line>
      </g>
    </svg>`;
  return h('div', { style: 'width:148px;height:148px;flex:none;position:relative', html: svg });
}

export function renderReflectionPage(ctx: AppContext): HTMLElement {
  const project = ctx.current!;
  const s = project.settings;
  const result = ctx.analysis?.projectId === project.id ? ctx.analysis : null;
  const glassObjects = project.objects.filter((o) => o.glass);
  const rows = glassObjects
    .map((o) => ({ o, g: o.glass!, a: result?.glasses[o.id] }))
    .sort((x, y) => (y.a?.reflectionIntensity ?? 0) - (x.a?.reflectionIntensity ?? 0));

  const heightInput = h('input', { class: 'input', type: 'number', min: '0.5', step: '0.5', value: s.birdHeight }) as HTMLInputElement;
  heightInput.addEventListener('input', () => { s.birdHeight = Number(heightInput.value) || 1.5; ctx.mutateProject(() => undefined); });
  const distanceInput = h('input', { class: 'input', type: 'number', min: '3', step: '1', value: s.viewDistance }) as HTMLInputElement;
  distanceInput.addEventListener('input', () => { s.viewDistance = Number(distanceInput.value) || 12; ctx.mutateProject(() => undefined); });
  const directionNumber = h('input', { class: 'input', type: 'number', min: '0', max: '359', value: s.birdDirection }) as HTMLInputElement;
  const directionRange = h('input', { type: 'range', min: '0', max: '359', value: s.birdDirection, style: 'width:100%;accent-color:var(--primary)' }) as HTMLInputElement;
  const compassHost = h('div', null, Compass(s.birdDirection));
  const updateDirection = (v: number) => {
    s.birdDirection = ((v % 360) + 360) % 360;
    directionNumber.value = String(Math.round(s.birdDirection));
    directionRange.value = String(Math.round(s.birdDirection));
    compassHost.replaceChildren(Compass(s.birdDirection));
    ctx.mutateProject(() => undefined);
  };
  directionNumber.addEventListener('input', () => updateDirection(Number(directionNumber.value)));
  directionRange.addEventListener('input', () => updateDirection(Number(directionRange.value)));

  const sampleSelect = h('select', { class: 'input' }, h('option', { value: '64', selected: s.sampleCount === 64 }, '64 样本/玻璃（快）'), h('option', { value: '128', selected: s.sampleCount === 128 }, '128 样本/玻璃（推荐）'), h('option', { value: '256', selected: s.sampleCount === 256 }, '256 样本/玻璃（细）')) as HTMLSelectElement;
  sampleSelect.addEventListener('change', () => { s.sampleCount = Number(sampleSelect.value) as 64 | 128 | 256; ctx.mutateProject(() => undefined, { immediate: true }); });
  const bidir = h('input', { type: 'checkbox', checked: s.bidirectional }) as HTMLInputElement;
  bidir.addEventListener('change', () => { s.bidirectional = bidir.checked; ctx.mutateProject(() => undefined, { immediate: true }); });

  const runButton = h('button', { class: 'btn primary', disabled: ctx.analysisStatus === 'running', onClick: () => { const pending = ctx.runAnalysis(); ctx.refresh(); void pending.then(() => ctx.refresh()); } }, ctx.analysisStatus === 'running' ? icon('refresh') : icon('play'), ctx.analysisStatus === 'running' ? 'GPU 计算中…' : result ? '重新运行 GPU 反射统计' : '运行 GPU 反射统计') as HTMLButtonElement;

  const avg = rows.length && result ? rows.reduce((sum, r) => sum + (r.a?.avgFresnel ?? 0), 0) / rows.length : 0;
  const tree = rows.length && result ? rows.reduce((sum, r) => sum + (r.a?.treeShare ?? 0), 0) / rows.length : 0;
  const sky = rows.length && result ? rows.reduce((sum, r) => sum + (r.a?.skyShare ?? 0), 0) / rows.length : 0;
  const through = rows.length && result ? rows.reduce((sum, r) => sum + (r.a?.throughShare ?? 0), 0) / rows.length : 0;

  const kpis = h('div', { class: 'kpi-row' },
    kpi('计算后端', result?.backend === 'webgpu' ? 'WebGPU' : result ? 'CPU 参考' : '待运行', result?.gpuName ?? '等待计算'),
    kpi('玻璃样本', String(glassObjects.length), `${s.sampleCount} 光线样本/块`),
    kpi('平均 Fresnel', result ? percent(avg) : '—', '方向加权入射角'),
    kpi('树影反射', result ? percent(tree) : '—', `天空 ${percent(sky)}`),
    kpi('看穿比例', result ? percent(through) : '—', '透射与连廊通道'),
  );

  const table = h('div', { class: 'table-wrap', style: 'max-height:520px' }, h('table', { class: 'data' },
    h('thead', null, h('tr', null,
      h('th', null, '玻璃'), h('th', null, '分类'), h('th', null, 'F 均值'), h('th', null, '反射强度'), h('th', { class: 'num' }, '树'), h('th', { class: 'num' }, '天空'), h('th', { class: 'num' }, '水'), h('th', { class: 'num' }, '看穿'), h('th', { class: 'num' }, '本体'), h('th', { class: 'num' }, '图案'),
    )),
    h('tbody', null, ...rows.map(({ o, g, a }) => h('tr', { style: 'cursor:pointer', onClick: () => ctx.navigate('risk') },
      h('td', null, h('strong', null, o.name), g.seeThrough ? h('span', { class: 'badge danger', style: 'margin-left:6px' }, '看穿') : null),
      h('td', null, facadeLabel(g.facade)),
      h('td', null, formatNumber(a?.avgFresnel ?? Number.NaN, 3)),
      h('td', { style: 'min-width:130px' }, h('div', { class: 'metric-bar' }, h('i', { style: `width:${((a?.reflectionIntensity ?? 0) * 100).toFixed(1)}%` }))),
      h('td', { class: 'num' }, percent(a?.treeShare ?? 0)),
      h('td', { class: 'num' }, percent(a?.skyShare ?? 0)),
      h('td', { class: 'num' }, percent(a?.waterShare ?? 0)),
      h('td', { class: 'num' }, percent(a?.throughShare ?? 0)),
      h('td', { class: 'num' }, percent(a?.glassShare ?? 0)),
      h('td', { class: 'num' }, percent(a?.markerShare ?? 0)),
    ))),
  ));

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, '反射分析'), h('p', null, '按鸟的飞行高度、方向和双向通道采样每块玻璃。Compute shader 对天空、球形树冠代理和水体求交,并用精确 Fresnel 混合反射、透射与玻璃本体可见度。')), h('div', { class: 'head-actions' }, runButton, h('button', { class: 'btn', onClick: () => ctx.navigate('risk') }, icon('risk'), '查看风险热力图'))),
    kpis,
    h('div', { class: 'layout-4-8' },
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('div', { class: 'row', style: 'align-items:flex-start' }, compassHost, h('div', { style: 'flex:1;min-width:180px' },
          h('label', { class: 'field' }, '飞行方向角', directionNumber, h('span', { class: 'hint' }, '0° 北飞,90° 东飞,180° 南飞')),
          h('label', { class: 'field' }, '方向滑杆', directionRange),
        )), h('div', { class: 'field-grid' }, h('label', { class: 'field' }, '飞行高度 m', heightInput), h('label', { class: 'field' }, '观察距离 m', distanceInput), h('label', { class: 'field' }, '采样密度', sampleSelect), h('label', { class: 'check-field' }, bidir, '同时考虑反向迁飞'))),
        h('div', { class: 'card' }, h('h3', { class: 'card-title' }, '计算口径'), h('p', { class: 'small muted' }, '每个样本先由鸟眼到玻璃点求入射角 θ,再计算 Fresnel R。反射射线命中树冠记为树影反射,命中水面或朝上记入天空/水面环境;低 R 时按透射率形成看穿概率。')),
        createFresnelPanel(),
      ),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, '每块玻璃的鸟视角统计'), h('p', { class: 'card-sub' }, result ? `计算时间 ${new Date(result.computedAt).toLocaleString('zh-CN')} · ${result.gpuName}` : '点击运行后,统计结果会显示在这里。')), h('span', { class: result?.backend === 'webgpu' ? 'badge ok' : 'badge warn' }, result?.backend === 'webgpu' ? 'GPU Compute' : 'CPU 参考')), table),
    ),
  );
}

function kpi(label: string, value: string, foot: string) {
  return h('div', { class: 'stat-card' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'foot' }, foot));
}
