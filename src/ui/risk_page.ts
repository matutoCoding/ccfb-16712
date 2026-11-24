import type { FacadeKind } from '../types';
import type { AppContext } from './context';
import { h, icon } from './dom';
import { elevationSvg, heatLegendHtml, type RiskMode } from './heatmap';
import { calculateRisk, riskLevel } from '../core/risk';
import { facadeLabel } from '../core/materials';
import { formatNumber } from '../core/math';

type Tab = FacadeKind | 'all-special';

export function renderRiskPage(ctx: AppContext): HTMLElement {
  const project = ctx.current!;
  const result = ctx.analysis?.projectId === project.id ? ctx.analysis : null;
  let tab: Tab = 'south';
  let mode: RiskMode = 'before';
  let selectedId: string | null = null;

  const heatHost = h('div', { class: 'elevation-panel' });
  const detailHost = h('div', { class: 'stack' });
  const tabsHost = h('div', { class: 'tabs' });
  const modeHost = h('div', { class: 'segmented' });

  const rows = project.objects.filter((o) => o.glass).map((o) => ({ o, g: o.glass!, a: result?.glasses[o.id] }));
  const high = rows.filter((r) => (r.a?.riskBefore ?? 0) >= project.settings.highThreshold);
  const medium = rows.filter((r) => { const v = r.a?.riskBefore ?? 0; return v >= project.settings.mediumThreshold && v < project.settings.highThreshold; });
  const avg = rows.length ? rows.reduce((s, r) => s + (r.a?.riskBefore ?? 0), 0) / rows.length : 0;
  const highArea = high.reduce((s, r) => s + r.g.areaM2, 0);

  function renderHeat() {
    heatHost.innerHTML = elevationSvg(project, result ?? undefined, tab, mode, selectedId);
    heatHost.querySelectorAll('[data-glass-id]').forEach((node) => {
      node.addEventListener('click', () => {
        selectedId = (node as HTMLElement).dataset.glassId ?? null;
        renderHeat();
        renderDetail();
      });
    });
  }

  function renderTabs() {
    const tabs: Array<[Tab, string]> = [['south', '南立面'], ['north', '北立面'], ['east', '东立面'], ['west', '西立面'], ['all-special', '转角/连廊']];
    tabsHost.replaceChildren(...tabs.map(([id, label]) => h('button', { class: `tab ${tab === id ? 'active' : ''}`, onClick: () => { tab = id; renderTabs(); renderHeat(); } }, label)));
  }

  function renderModeSwitch() {
    modeHost.replaceChildren(
      h('button', { class: mode === 'before' ? 'active' : '', onClick: () => { mode = 'before'; renderModeSwitch(); renderHeat(); } }, '改造前'),
      h('button', { class: mode === 'after' ? 'active' : '', onClick: () => { mode = 'after'; renderModeSwitch(); renderHeat(); } }, '改造后'),
    );
  }

  function renderDetail() {
    const selected = rows.find((r) => r.o.id === selectedId) ?? [...rows].sort((a, b) => (b.a?.riskBefore ?? 0) - (a.a?.riskBefore ?? 0))[0];
    if (!selected?.a) {
      detailHost.replaceChildren(h('div', { class: 'card empty-state' }, h('h3', null, '暂无风险结果'), h('p', null, '请先运行 GPU 反射与风险统计。')));
      return;
    }
    const a = selected.a;
    const components = calculateRisk({
      avgFresnel: a.avgFresnel, treeShare: a.treeShare, skyShare: a.skyShare, waterShare: a.waterShare, throughShare: a.throughShare,
      nearestTreeDistance: a.nearestTreeDistance, floor: selected.g.floor, seeThrough: selected.g.seeThrough, settings: project.settings, deterrence: a.deterrenceBefore,
    });
    const level = riskLevel(a.riskBefore, project.settings);
    const levelLabel = { high: '高风险', medium: '中风险', low: '低风险' }[level];
    const levelClass = level === 'high' ? 'danger' : level === 'medium' ? 'warn' : 'ok';
    detailHost.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('h3', { class: 'card-title mb-0' }, selected.o.name), h('span', { class: `badge ${levelClass} right` }, levelLabel)),
        h('p', { class: 'muted mt-4' }, `${facadeLabel(selected.g.facade)} · ${selected.g.floor}F · ${formatNumber(selected.g.areaM2)}㎡ · 最近绿化 ${formatNumber(a.nearestTreeDistance)}m`),
        h('div', { class: 'grid-cols-2 mt-4' },
          scoreBox('改造前', a.riskBefore, '#dc2626'), scoreBox('改造后预测', a.riskAfter, '#16a34a'),
        ),
        h('div', { class: 'stack mt-4' },
          factor('反射强度', a.reflectionIntensity, 'var(--primary)'),
          factor('反射分项', components.reflection / project.settings.reflectionWeight, '#0369a1'),
          factor('绿化邻近', a.greenFactor, '#16a34a'),
          factor('低楼层权重', a.floorFactor, '#f97316'),
          factor('看穿/通透', selected.g.seeThrough ? 1 : Math.min(1, a.throughShare), '#dc2626'),
        ),
        h('button', { class: 'btn primary mt-4', style: 'width:100%', onClick: () => ctx.navigate('measures') }, icon('measures', 16), '去措施方案更换防鸟玻璃'),
      ),
      h('div', { class: 'card' }, h('h3', { class: 'card-title' }, '风险最高面板'), h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('tbody', null,
        ...[...rows].sort((a, b) => (b.a?.riskBefore ?? 0) - (a.a?.riskBefore ?? 0)).slice(0, 12).map((r) => h('tr', { style: 'cursor:pointer', onClick: () => { selectedId = r.o.id; renderHeat(); renderDetail(); } },
          h('td', null, r.o.name), h('td', null, facadeLabel(r.g.facade)), h('td', { class: 'num' }, h('span', { class: 'risk-pill', style: `background:${scoreColor(r.a?.riskBefore ?? 0)}` }, (r.a?.riskBefore ?? 0).toFixed(0))),
        )),
      )))),
    );
  }

  const thresholdHigh = h('input', { class: 'input', type: 'number', min: '40', max: '95', value: project.settings.highThreshold }) as HTMLInputElement;
  thresholdHigh.addEventListener('input', () => { project.settings.highThreshold = Number(thresholdHigh.value) || 65; ctx.mutateProject(() => undefined); renderHeat(); renderDetail(); });
  const thresholdMed = h('input', { class: 'input', type: 'number', min: '15', max: '80', value: project.settings.mediumThreshold }) as HTMLInputElement;
  thresholdMed.addEventListener('input', () => { project.settings.mediumThreshold = Number(thresholdMed.value) || 38; ctx.mutateProject(() => undefined); renderHeat(); renderDetail(); });

  if (!result) {
    return h('div', null,
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, '风险评估'), h('p', null, '按反射强度、周边绿化距离、楼层和看穿节点计算 0–100 风险分,并在立面上生成热力图。')), h('button', { class: 'btn primary', disabled: ctx.analysisStatus === 'running', onClick: () => { const pending = ctx.runAnalysis(); ctx.refresh(); void pending.then(() => ctx.refresh()); } }, icon('play'), ctx.analysisStatus === 'running' ? '计算中…' : '运行评估')),
      h('div', { class: 'card' }, ctx.analysisStatus === 'running' ? h('div', { class: 'empty-state' }, h('div', { class: 'progress-line', style: 'max-width:360px;margin:0 auto 18px' }, h('i')), h('h3', null, 'WebGPU 正在逐块统计'), h('p', null, '计算树冠/水体求交、Fresnel 和风险分并回读结果。')) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-icon' }, icon('risk', 26)), h('h3', null, '还没有可显示的风险结果'), h('p', null, '先运行反射与风险统计。两个测试项目已布置绿化、湖面、转角和连廊。'), h('button', { class: 'btn primary', onClick: () => { const pending = ctx.runAnalysis(); ctx.refresh(); void pending.then(() => ctx.refresh()); } }, icon('play'), '立即运行 GPU 评估'))),
    );
  }

  renderTabs(); renderModeSwitch(); renderHeat(); renderDetail();

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, '风险评估'), h('p', null, '立面颜色为改造前风险;白点标记转角、连廊或手动标注的看穿位置。点击任意面板查看分项。')), h('div', { class: 'head-actions' },
      modeHost,
      h('button', { class: 'btn primary', onClick: () => ctx.navigate('measures') }, icon('measures'), '措施方案'),
    )),
    h('div', { class: 'kpi-row' },
      kpi('玻璃总数', String(rows.length), `${formatNumber(rows.reduce((s, r) => s + r.g.areaM2, 0))}㎡`),
      kpi('高风险', String(high.length), `${formatNumber(highArea)}㎡`, 'var(--red)'),
      kpi('中风险', String(medium.length), '建议结合措施', 'var(--orange)'),
      kpi('平均风险', formatNumber(avg), '0–100 分'),
      kpi('计算后端', result.backend === 'webgpu' ? 'GPU' : 'CPU', result.backend === 'webgpu' ? 'WebGPU Compute' : '同公式参考'),
    ),
    h('div', { class: 'risk-layout' },
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', { class: 'card-title' }, '阈值'), h('label', { class: 'field mt-4' }, '高风险线', thresholdHigh), h('label', { class: 'field' }, '中风险线', thresholdMed), h('div', { html: heatLegendHtml(project.settings) })),
        h('div', { class: 'card' }, h('h3', { class: 'card-title' }, '评分因子'), h('p', { class: 'small muted' }, `反射 ${project.settings.reflectionWeight} 分、绿化 ${project.settings.greenWeight} 分、楼层 ${project.settings.floorWeight} 分、看穿 ${project.settings.seeThroughWeight} 分。可在设置页调整默认权重。`)),
      ),
      h('div', { class: 'stack' }, tabsHost, heatHost),
      detailHost,
    ),
  );
}

function kpi(label: string, value: string, foot: string, color?: string) {
  return h('div', { class: 'stat-card' }, h('div', { class: 'label' }, label), h('div', { class: 'value', style: color ? `color:${color}` : '' }, value), h('div', { class: 'foot' }, foot));
}
function scoreBox(label: string, score: number, color: string) {
  return h('div', { class: 'stat-card', style: 'text-align:center' }, h('div', { class: 'label', style: 'justify-content:center' }, label), h('div', { class: 'value', style: `color:${color};font-size:30px` }, score.toFixed(1)));
}
function factor(label: string, value: number, color: string) {
  return h('div', null, h('div', { class: 'row small mb-0' }, h('span', null, label), h('strong', { class: 'right' }, `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`)), h('div', { class: 'metric-bar mt-4' }, h('i', { style: `width:${Math.min(100, Math.max(0, value * 100)).toFixed(1)}%;background:${color}` })));
}
function scoreColor(score: number) {
  if (score >= 65) return '#dc2626';
  if (score >= 38) return '#f97316';
  if (score >= 26) return '#eab308';
  return '#16a34a';
}
