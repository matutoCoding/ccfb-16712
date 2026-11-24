import type { AnalysisResult, FacadeKind, Project } from '../types';
import { riskColor } from '../core/risk';

export type RiskMode = 'before' | 'after';

export function elevationSvg(project: Project, result: AnalysisResult | undefined, facade: FacadeKind | 'all-special', mode: RiskMode, selectedId?: string | null): string {
  const items = project.objects
    .filter((o) => o.glass)
    .filter((o) => (facade === 'all-special' ? o.glass!.facade === 'corner' || o.glass!.facade === 'corridor' : o.glass!.facade === facade));

  const W = 1000;
  const H = 560;
  const margin = { left: 58, right: 28, top: 34, bottom: 48 };
  if (!items.length) {
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="该立面没有玻璃"><rect width="${W}" height="${H}" rx="18" fill="#f8fafc"/><text x="500" y="270" text-anchor="middle" font-size="22" font-weight="600" fill="#334155">该立面暂无玻璃面板</text><text x="500" y="306" text-anchor="middle" font-size="15" fill="#64748b">可在「建筑与环境」中生成幕墙或把导入对象标记为玻璃</text></svg>`;
  }

  const horiz = (o: (typeof items)[number]) => (Math.abs(o.glass!.normal[2]) >= Math.abs(o.glass!.normal[0]) ? o.glass!.center[0] : o.glass!.center[2]);
  let minH = Infinity;
  let maxH = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const o of items) {
    const g = o.glass!;
    const h = horiz(o);
    const hw = g.width / 2;
    minH = Math.min(minH, h - hw);
    maxH = Math.max(maxH, h + hw);
    minY = Math.min(minY, g.elevation);
    maxY = Math.max(maxY, g.elevation + g.height);
  }
  minH -= 1; maxH += 1; minY = Math.max(0, minY - 0.6); maxY += 0.8;
  const worldW = Math.max(4, maxH - minH);
  const worldH = Math.max(3, maxY - minY);
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;
  const scale = Math.min(plotW / worldW, plotH / worldH);
  const drawW = worldW * scale;
  const drawH = worldH * scale;
  const originX = margin.left + (plotW - drawW) / 2;
  const originY = margin.top + (plotH - drawH) / 2;
  const x = (v: number) => originX + (v - minH) * scale;
  const y = (v: number) => originY + drawH - (v - minY) * scale;

  const floorLines = Array.from(new Set(items.map((o) => o.glass!.floor))).sort((a, b) => a - b);
  const lines = floorLines.map((f) => {
    const floor = project.buildings.flatMap((b) => [b.floorHeight * (f - 1), b.floorHeight * f]);
    const yy = y(floor[1] ?? f * 4);
    return `<line x1="${margin.left}" x2="${W - margin.right}" y1="${yy}" y2="${yy}" stroke="#cbd5e1" stroke-dasharray="5 7"/><text x="${margin.left - 10}" y="${yy + 5}" text-anchor="end" font-size="14" fill="#64748b">${f}F</text>`;
  }).join('');

  const rects = items.map((o) => {
    const g = o.glass!;
    const h = horiz(o);
    const analysis = result?.glasses[o.id];
    const score = analysis ? (mode === 'before' ? analysis.riskBefore : analysis.riskAfter) : 0;
    const fill = result ? riskColor(score, project.settings) : '#94a3b8';
    const rx = x(h - g.width / 2);
    const ry = y(g.elevation + g.height);
    const rw = Math.max(3, g.width * scale - 2);
    const rh = Math.max(8, g.height * scale - 2);
    const selected = selectedId === o.id;
    const special = g.seeThrough || g.facade === 'corner' || g.facade === 'corridor';
    const label = rw > 34 && rh > 24 ? `<text x="${rx + rw / 2}" y="${ry + rh / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${score.toFixed(0)}</text>` : '';
    const mark = special ? `<circle cx="${rx + rw - 7}" cy="${ry + 8}" r="4" fill="#fff" opacity="0.95"/>` : '';
    return `<g class="heat-rect" data-glass-id="${o.id}" style="cursor:pointer"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="3" fill="${fill}" stroke="${selected ? '#0f172a' : '#ffffff'}" stroke-width="${selected ? 3 : 1.5}"><title>${o.name}｜${score.toFixed(1)} 分</title></rect>${label}${mark}</g>`;
  }).join('');

  return `<svg class="elevation-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="风险立面热力图">
    <rect x="0" y="0" width="${W}" height="${H}" rx="18" fill="#f8fafc"/>
    ${lines}
    <line x1="${margin.left}" x2="${W - margin.right}" y1="${originY + drawH}" y2="${originY + drawH}" stroke="#94a3b8" stroke-width="1.5"/>
    ${rects}
    <text x="${W / 2}" y="28" text-anchor="middle" font-size="18" font-weight="700" fill="#0f172a">${facadeTitle(facade)}${mode === 'after' ? '｜改造后预测' : '｜改造前基线'}</text>
    <text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="14" fill="#64748b">横向展开长度 ${worldW.toFixed(1)}m · 高度 ${worldH.toFixed(1)}m · 白点表示看穿/转角/连廊标记</text>
  </svg>`;
}

export function facadeTitle(f: FacadeKind | 'all-special'): string {
  return { south: '南立面', north: '北立面', east: '东立面', west: '西立面', corner: '玻璃转角', corridor: '玻璃连廊', roof: '采光顶', other: '其他玻璃', 'all-special': '转角与连廊专项' }[f];
}

export function heatLegendHtml(settings: Project['settings']): string {
  return `<div class="legend"><span><i style="background:#16a34a"></i>低风险 &lt;${settings.mediumThreshold}</span><span><i style="background:#eab308"></i>关注</span><span><i style="background:#f97316"></i>中高</span><span><i style="background:#dc2626"></i>高风险 ≥${settings.highThreshold}</span></div>`;
}
