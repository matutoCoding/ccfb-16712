import type { AnalysisResult, GlassMaterial, Project } from '../types';
import { downloadBlob, formatDateTime, formatNumber } from './math';
import { facadeLabel } from './materials';
import { elevationSvg } from '../ui/heatmap';

function escapeHtml(value: unknown): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

export function buildReportHtml(project: Project, materials: GlassMaterial[], result: AnalysisResult | undefined): string {
  const materialMap = new Map(materials.map((m) => [m.id, m]));
  const glassObjects = project.objects.filter((o) => o.glass);
  const rows = glassObjects
    .map((o) => ({ obj: o, g: o.glass!, a: result?.glasses[o.id] }))
    .sort((x, y) => (y.a?.riskBefore ?? 0) - (x.a?.riskBefore ?? 0));
  const high = rows.filter((r) => (r.a?.riskBefore ?? 0) >= project.settings.highThreshold);
  const assigned = rows.filter((r) => project.mitigation.assignments[r.obj.id]);
  const area = assigned.reduce((sum, r) => sum + r.g.areaM2, 0);
  const beforeAvg = rows.length ? rows.reduce((s, r) => s + (r.a?.riskBefore ?? 0), 0) / rows.length : 0;
  const afterAvg = rows.length ? rows.reduce((s, r) => s + (r.a?.riskAfter ?? r.a?.riskBefore ?? 0), 0) / rows.length : 0;
  const facades = ['south', 'north', 'east', 'west'] as const;
  const hasSpecial = glassObjects.some((o) => o.glass!.facade === 'corner' || o.glass!.facade === 'corridor');
  const maps = [
    ...facades.map((f) => elevationSvg(project, result, f, 'before')),
    ...(hasSpecial ? [elevationSvg(project, result, 'all-special', 'before')] : []),
  ];
  const afterMaps = assigned.length
    ? [
        ...facades.map((f) => elevationSvg(project, result, f, 'after')),
        ...(hasSpecial ? [elevationSvg(project, result, 'all-special', 'after')] : []),
      ]
    : [];

  const riskRows = rows.slice(0, 30).map((r) => `<tr>
    <td>${escapeHtml(r.obj.name)}</td><td>${facadeLabel(r.g.facade)}</td><td>${r.g.floor}F</td>
    <td>${formatNumber(r.g.areaM2)}㎡</td><td>${formatNumber(r.a?.avgFresnel ?? 0, 3)}</td>
    <td>${formatNumber((r.a?.treeShare ?? 0) * 100)}%</td><td>${formatNumber(r.a?.nearestTreeDistance ?? 0)}m</td>
    <td class="num high">${formatNumber(r.a?.riskBefore ?? 0)}</td><td class="num">${formatNumber(r.a?.riskAfter ?? 0)}</td>
  </tr>`).join('');

  const retrofitRows = assigned.map((r) => {
    const nextId = project.mitigation.assignments[r.obj.id];
    const next = materialMap.get(nextId);
    const before = materialMap.get(r.g.materialId);
    return `<tr><td>${escapeHtml(r.obj.name)}</td><td>${facadeLabel(r.g.facade)}</td><td>${formatNumber(r.g.areaM2)}㎡</td><td>${escapeHtml(before?.name ?? r.g.materialId)}</td><td>${escapeHtml(next?.name ?? nextId)}</td><td class="num">${formatNumber(r.a?.riskBefore ?? 0)}</td><td class="num good">${formatNumber(r.a?.riskAfter ?? 0)}</td><td class="num">${formatNumber((r.g.areaM2) * (next?.costPerM2 ?? 0) / 10000, 2)} 万</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(project.name)}｜防鸟撞评估报告</title>
  <style>
    *{box-sizing:border-box} body{font-family:"Microsoft YaHei",system-ui,sans-serif;color:#0f172a;margin:0;background:#f1f5f9;line-height:1.65}
    .page{max-width:1080px;margin:0 auto;padding:48px 40px;background:#fff} h1{font-size:32px;margin:0 0 8px} h2{font-size:22px;margin:40px 0 16px;padding-left:12px;border-left:5px solid #0f766e}
    .meta{color:#64748b;font-size:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}.stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px}.stat b{display:block;font-size:28px;margin-top:4px}.stat span{color:#64748b;font-size:14px}
    table{width:100%;border-collapse:collapse;font-size:14px;margin:12px 0 24px} th,td{border-bottom:1px solid #e2e8f0;padding:9px 8px;text-align:left;vertical-align:top} th{background:#f8fafc;color:#334155;font-weight:700}.num{text-align:right;font-variant-numeric:tabular-nums}.high{color:#dc2626;font-weight:800}.good{color:#15803d;font-weight:800}
    .map{border:1px solid #e2e8f0;border-radius:18px;padding:12px;margin:18px 0;background:#f8fafc}.map svg{width:100%;height:auto}.note{background:#f0fdfa;border:1px solid #99f6e4;border-radius:14px;padding:16px 18px;color:#115e59}.formula{font-family:Consolas,monospace;background:#0f172a;color:#ccfbf1;padding:16px;border-radius:12px;overflow:auto}
    @media print{body{background:#fff}.page{max-width:none;padding:18px}.map{break-inside:avoid}h2{break-after:avoid}}
  </style></head><body><main class="page">
  <h1>${escapeHtml(project.name)}<br>建筑玻璃防鸟撞评估报告</h1>
  <div class="meta">${escapeHtml(project.city)} ${escapeHtml(project.location)} · 生成时间 ${formatDateTime()} · 计算后端 ${result?.backend === 'webgpu' ? 'WebGPU GPU Compute' : 'CPU 同公式参考'} · 样本/玻璃 ${result?.sampleCount ?? project.settings.sampleCount}</div>
  <p>${escapeHtml(project.description)}</p>
  <section class="grid">
    <div class="stat"><span>玻璃面板</span><b>${glassObjects.length}</b></div>
    <div class="stat"><span>高风险面板</span><b style="color:#dc2626">${high.length}</b></div>
    <div class="stat"><span>平均风险</span><b>${formatNumber(beforeAvg)}</b></div>
    <div class="stat"><span>改造面积</span><b>${formatNumber(area)}㎡</b></div>
  </section>
  <div class="note">鸟飞高度 ${project.settings.birdHeight}m,方向 ${project.settings.birdDirection}°,双向采样 ${project.settings.bidirectional ? '开启' : '关闭'}。改造后平均预测分由 ${formatNumber(beforeAvg)} 降至 ${formatNumber(afterAvg)}。本报告用于方案阶段评估,施工图前仍应结合现场迁飞通道和当地导则复核。</div>

  <h2>菲涅尔反射正确性</h2>
  <p>GPU 与报告均使用非偏振介质精确公式:空气 n₁=1,玻璃等效折射率 n₂ 由法向反射率确定。掠射角 θ→90° 时 R<sub>s</sub>,R<sub>p</sub>→1,因此平均反射率趋近 1。设置页可运行 GPU 与公式逐角对比,硬指标为最大误差小于 1%。</p>
  <div class="formula">R(θ)=½[((n₁cosθᵢ−n₂cosθₜ)/(n₁cosθᵢ+n₂cosθₜ))² + ((n₂cosθᵢ−n₁cosθₜ)/(n₂cosθᵢ+n₁cosθₜ))²]</div>

  <h2>风险立面图（改造前）</h2>
  ${maps.map((svg) => `<div class="map">${svg}</div>`).join('')}
  ${afterMaps.length ? `<h2>风险立面图（改造后预测）</h2>${afterMaps.map((svg) => `<div class="map">${svg}</div>`).join('')}` : ''}

  <h2>高风险玻璃明细（前 30 块）</h2>
  <table><thead><tr><th>面板</th><th>立面</th><th>楼层</th><th>面积</th><th>平均F</th><th>树反照</th><th>绿化距离</th><th>改造前</th><th>改造后</th></tr></thead><tbody>${riskRows || '<tr><td colspan="9">暂无玻璃数据</td></tr>'}</tbody></table>

  <h2>改造清单</h2>
  <table><thead><tr><th>面板</th><th>位置</th><th>面积</th><th>原玻璃</th><th>推荐/已选措施</th><th>前</th><th>后</th><th>估算造价</th></tr></thead><tbody>${retrofitRows || '<tr><td colspan="8">尚未在措施方案中分配防鸟玻璃。</td></tr>'}</tbody></table>
  <p class="meta">造价仅使用玻璃库中录入的材料单价做方案估算,不含施工、脚手架和税费。</p>
  </main></body></html>`;
}

export function downloadReport(project: Project, materials: GlassMaterial[], result: AnalysisResult | undefined) {
  const html = buildReportHtml(project, materials, result);
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  downloadBlob(html, `${safeName}-防鸟撞评估报告.html`, 'text/html;charset=utf-8');
}

export function downloadRetrofitCsv(project: Project, materials: GlassMaterial[], result: AnalysisResult | undefined) {
  const map = new Map(materials.map((m) => [m.id, m]));
  const rows = [['面板ID', '名称', '立面', '楼层', '面积m2', '原玻璃', '改造玻璃', '改造前风险', '改造后风险', '单价元/m2', '估算元']];
  for (const o of project.objects) {
    if (!o.glass || !project.mitigation.assignments[o.id]) continue;
    const g = o.glass;
    const nextId = project.mitigation.assignments[o.id];
    const next = map.get(nextId);
    rows.push([
      o.id, o.name, facadeLabel(g.facade), String(g.floor), g.areaM2.toFixed(2),
      map.get(g.materialId)?.name ?? g.materialId, next?.name ?? nextId,
      (result?.glasses[o.id]?.riskBefore ?? 0).toFixed(1), (result?.glasses[o.id]?.riskAfter ?? 0).toFixed(1),
      String(next?.costPerM2 ?? 0), Math.round(g.areaM2 * (next?.costPerM2 ?? 0)).toString(),
    ]);
  }
  const csv = '﻿' + rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlob(csv, `${project.name}-改造清单.csv`, 'text/csv;charset=utf-8');
}
