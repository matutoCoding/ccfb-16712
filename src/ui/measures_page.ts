import type { ID } from '../types';
import type { AppContext } from './context';
import { h, icon } from './dom';
import { facadeLabel } from '../core/materials';
import { downloadReport, downloadRetrofitCsv } from '../core/report';
import { formatNumber } from '../core/math';

export function renderMeasuresPage(ctx: AppContext): HTMLElement {
  const project = ctx.current!;
  let onlyHigh = true;
  const summaryHost = h('div', { class: 'kpi-row' });
  const compareHost = h('div', { class: 'card' });
  const tableHost = h('div', { class: 'card' });

  function recommendId(glassId: string): ID {
    const obj = project.objects.find((o) => o.id === glassId);
    const special = obj?.glass?.seeThrough || obj?.glass?.facade === 'corridor' || obj?.glass?.facade === 'corner';
    const preferred = special ? ['mat-grid', 'mat-frit-dots', 'mat-frit-stripes'] : ['mat-frit-dots', 'mat-frit-stripes', 'mat-grid'];
    for (const id of preferred) if (ctx.materials.some((m) => m.id === id)) return id;
    return ctx.materials.find((m) => m.birdSafe)?.id ?? ctx.materials[0]?.id;
  }

  function assignedRows() {
    return project.objects.filter((o) => o.glass && project.mitigation.assignments[o.id]);
  }

  function renderSummary() {
    const rows = assignedRows();
    const area = rows.reduce((sum, o) => sum + (o.glass?.areaM2 ?? 0), 0);
    const cost = rows.reduce((sum, o) => sum + (o.glass?.areaM2 ?? 0) * (ctx.materials.find((m) => m.id === project.mitigation.assignments[o.id])?.costPerM2 ?? 0), 0);
    const analyzed = rows.map((o) => ctx.analysis?.glasses[o.id]).filter(Boolean);
    const before = analyzed.length ? analyzed.reduce((s, a) => s + (a?.riskBefore ?? 0), 0) / analyzed.length : 0;
    const after = analyzed.length ? analyzed.reduce((s, a) => s + (a?.riskAfter ?? 0), 0) / analyzed.length : 0;
    summaryHost.replaceChildren(
      kpi('已选改造面板', String(rows.length), '块'),
      kpi('改造面积', formatNumber(area), '㎡'),
      kpi('估算材料造价', formatNumber(cost / 10000, 2), '万元'),
      kpi('改造前面板均分', formatNumber(before), '风险分', '#dc2626'),
      kpi('改造后预测均分', formatNumber(after), `下降 ${formatNumber(Math.max(0, before - after))} 分`, '#16a34a'),
    );

    const top = project.objects.filter((o) => o.glass && ctx.analysis?.glasses[o.id]).sort((a, b) => (ctx.analysis!.glasses[b.id].riskBefore - ctx.analysis!.glasses[a.id].riskBefore)).slice(0, 8);
    compareHost.replaceChildren(
      h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, '前后风险对比'), h('p', { class: 'card-sub' }, '选择替换材料后会重新进入 GPU compute,按新材料的 Fresnel 与图案参数计算 after 风险。'))),
      ...top.map((o) => {
        const a = ctx.analysis!.glasses[o.id];
        return h('div', { class: 'compare-bar', style: 'margin:14px 0' },
          h('div', null, h('div', { class: 'small', style: 'margin-bottom:6px' }, o.name), h('div', { class: 'compare-track' }, h('i', { style: `width:${a.riskBefore}%;background:#dc2626` }))),
          h('div', { class: 'arrow-cell' }, icon('arrow', 18)),
          h('div', null, h('div', { class: 'small text-right', style: 'margin-bottom:6px' }, `${a.riskBefore.toFixed(0)} → ${a.riskAfter.toFixed(0)}`), h('div', { class: 'compare-track' }, h('i', { style: `width:${a.riskAfter}%;background:#16a34a` }))),
        );
      }),
    );
  }

  function renderTable() {
    const result = ctx.analysis;
    let rows = project.objects.filter((o) => o.glass).map((o) => ({ o, g: o.glass!, a: result?.glasses[o.id] }));
    if (onlyHigh && result) rows = rows.filter((r) => (r.a?.riskBefore ?? 0) >= project.settings.highThreshold || project.mitigation.assignments[r.o.id]);
    rows.sort((a, b) => (b.a?.riskBefore ?? 0) - (a.a?.riskBefore ?? 0));

    tableHost.replaceChildren(
      h('div', { class: 'card-head' },
        h('div', null, h('h3', { class: 'card-title' }, '改造清单配置'), h('p', { class: 'card-sub' }, '可为每块玻璃指定防鸟圆点、条纹或密格玻璃;连廊/转角优先密格。')),
        h('div', { class: 'row' },
          h('div', { class: 'segmented' }, h('button', { class: onlyHigh ? 'active' : '', onClick: () => { onlyHigh = true; renderTable(); } }, '高风险+已选'), h('button', { class: !onlyHigh ? 'active' : '', onClick: () => { onlyHigh = false; renderTable(); } }, '全部玻璃')),
        ),
      ),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, '玻璃'), h('th', null, '位置'), h('th', { class: 'num' }, '面积'), h('th', null, '原玻璃'), h('th', null, '替换为'), h('th', { class: 'num' }, '前'), h('th', { class: 'num' }, '后'), h('th'))),
        h('tbody', null, ...rows.map(({ o, g, a }) => {
          const current = ctx.materials.find((m) => m.id === g.materialId);
          const select = h('select', { class: 'input sm' },
            h('option', { value: '' }, '不替换'),
            ...ctx.materials.filter((m) => m.birdSafe).map((m) => h('option', { value: m.id, selected: project.mitigation.assignments[o.id] === m.id }, m.name)),
          ) as HTMLSelectElement;
          select.addEventListener('change', async () => {
            if (select.value) project.mitigation.assignments[o.id] = select.value;
            else delete project.mitigation.assignments[o.id];
            ctx.mutateProject(() => undefined, { immediate: true });
            await ctx.runAnalysis();
            renderSummary(); renderTable();
          });
          return h('tr', null,
            h('td', null, h('strong', null, o.name), g.seeThrough ? h('span', { class: 'badge danger', style: 'margin-left:6px' }, '看穿') : null),
            h('td', null, facadeLabel(g.facade), ` · ${g.floor}F`),
            h('td', { class: 'num' }, formatNumber(g.areaM2)),
            h('td', null, current?.name ?? g.materialId),
            h('td', null, select),
            h('td', { class: 'num' }, h('span', { class: 'risk-pill', style: `background:${scoreColor(a?.riskBefore ?? 0)}` }, (a?.riskBefore ?? 0).toFixed(0))),
            h('td', { class: 'num' }, h('strong', { style: 'color:#15803d' }, (a?.riskAfter ?? a?.riskBefore ?? 0).toFixed(0))),
            h('td', null, project.mitigation.assignments[o.id] ? h('button', { class: 'icon-button danger sm', title: '撤销', onClick: async () => { delete project.mitigation.assignments[o.id]; ctx.mutateProject(() => undefined, { immediate: true }); await ctx.runAnalysis(); renderSummary(); renderTable(); } }, icon('trash', 15)) : null),
          );
        })),
      )),
    );
  }

  async function applyAllHigh() {
    if (!ctx.analysis) await ctx.runAnalysis();
    for (const o of project.objects) {
      if (!o.glass) continue;
      const score = ctx.analysis?.glasses[o.id]?.riskBefore ?? 0;
      if (score >= project.settings.highThreshold) project.mitigation.assignments[o.id] = recommendId(o.id);
    }
    project.mitigation.appliedAt = new Date().toISOString();
    ctx.mutateProject(() => undefined, { immediate: true });
    await ctx.runAnalysis();
    ctx.refresh();
    ctx.toast('已为全部高风险玻璃应用推荐防鸟方案', 'ok');
  }

  renderSummary(); renderTable();

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h2', null, '措施方案'), h('p', null, '一键替换高风险玻璃为点阵、条纹或密格防鸟玻璃,自动计算前后风险、改造面积与材料清单。导出的 HTML 报告包含风险立面图和改造表。')),
      h('div', { class: 'head-actions' },
        h('button', { class: 'btn', onClick: () => downloadRetrofitCsv(project, ctx.materials, ctx.analysis ?? undefined) }, icon('download'), 'CSV 清单'),
        h('button', { class: 'btn', onClick: () => downloadReport(project, ctx.materials, ctx.analysis ?? undefined) }, icon('external'), '导出评估报告'),
        h('button', { class: 'btn danger', onClick: async () => { project.mitigation.assignments = {}; ctx.mutateProject(() => undefined, { immediate: true }); await ctx.runAnalysis(); ctx.refresh(); } }, '清空措施'),
        h('button', { class: 'btn primary', onClick: applyAllHigh }, icon('check'), '一键高风险改造'),
      )),
    !ctx.analysis ? h('div', { class: 'card' }, h('div', { class: 'empty-state' }, h('h3', null, '尚未运行评估'), h('p', null, '可以先应用推荐方案,但前后对比需要运行一次 GPU 分析。'), h('button', { class: 'btn primary', onClick: () => { const pending = ctx.runAnalysis(); ctx.refresh(); void pending.then(() => ctx.refresh()); } }, icon('play'), '运行评估'))) : null,
    summaryHost,
    h('div', { class: 'measures-layout' }, tableHost, compareHost),
  );
}

function kpi(label: string, value: string, foot: string, color?: string) {
  return h('div', { class: 'stat-card' }, h('div', { class: 'label' }, label), h('div', { class: 'value', style: color ? `color:${color}` : '' }, value), h('div', { class: 'foot' }, foot));
}
function scoreColor(score: number) {
  if (score >= 65) return '#dc2626';
  if (score >= 38) return '#f97316';
  if (score >= 26) return '#eab308';
  return '#16a34a';
}
