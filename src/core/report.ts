import type { GlassType, Project, RiskResult, Settings } from './types';
import { buildElevations } from './elevation';
import { heatColor } from './geom';
import { LEVEL_LABEL } from './risk';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 生成所有朝向的风险立面 SVG 字符串（报告内嵌，离线可看）。 */
export function elevationFigures(project: Project, scoreById?: Map<string, number>): { label: string; svg: string }[] {
  const els = buildElevations(project);
  return els.map((e) => {
    const W = 720;
    const H = 260;
    const padL = 46;
    const padB = 34;
    const padT = 16;
    const padR = 16;
    const iw = W - padL - padR;
    const ih = H - padT - padB;
    const sx = iw / Math.max(1, e.widthM);
    const sy = ih / Math.max(1, e.heightM);
    const k = Math.min(sx, sy);
    const drawW = e.widthM * k;
    const drawH = e.heightM * k;
    const ox = padL + (iw - drawW) / 2;
    const oy = padT + (ih - drawH) / 2;
    const X = (x: number) => ox + x * k;
    // 米制 y 自下而上 → SVG 自上而下
    const Y = (y: number, h: number) => oy + drawH - (y + h) * k;

    const rects = e.rects
      .map((r) => {
        const score = scoreById?.get(r.id);
        const [rr, gg, bb] = heatColor((score ?? 0) / 100);
        const fill = score == null ? '#9fc3d8' : `rgb(${rr},${gg},${bb})`;
        return `<rect x="${X(r.x).toFixed(1)}" y="${Y(r.y, r.h).toFixed(1)}" width="${Math.max(1, r.w * k - 1).toFixed(1)}" height="${Math.max(1, r.h * k - 1).toFixed(1)}" rx="1.5" fill="${fill}" stroke="rgba(15,35,55,.6)" stroke-width="0.8"><title>${esc(r.name)} ${score != null ? score.toFixed(0) : ''}</title></rect>`;
      })
      .join('');

    // 楼层标高
    let levels = '';
    for (let y = 0; y <= e.heightM; y += 3.6) {
      const yy = oy + drawH - y * k;
      levels += `<line x1="${ox}" x2="${ox + drawW}" y1="${yy}" y2="${yy}" stroke="#e2e8f0" stroke-width="0.7"/>
        <text x="${ox - 6}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#64748b">${y.toFixed(0)}m</text>`;
    }

    const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;border:1px solid #e2e8f0;border-radius:10px;background:linear-gradient(180deg,#fbfdff,#f1f6fa)">
      ${levels}
      <line x1="${ox}" x2="${ox + drawW}" y1="${oy + drawH}" y2="${oy + drawH}" stroke="#475569" stroke-width="1.4"/>
      ${rects}
      <text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#475569">${esc(e.label)}（宽 ${e.widthM.toFixed(1)}m × 高 ${e.heightM.toFixed(1)}m）</text>
    </svg>`;
    return { label: e.label, svg };
  });
}

export interface ReportData {
  project: Project;
  glass: GlassType[];
  settings: Settings;
  engine: string;
  before: RiskResult[];
  after?: RiskResult[];
  sampleCount?: number;
  fresnelErrorPct?: number | null;
}

export function buildReportHtml(d: ReportData): string {
  const { project, glass, settings } = d;
  const gmap = new Map(glass.map((g) => [g.id, g]));
  const beforeMap = new Map(d.before.map((r) => [r.surfaceId, r.score]));
  const afterMap = d.after ? new Map(d.after.map((r) => [r.surfaceId, r.score])) : undefined;
  const figsBefore = elevationFigures(project, beforeMap);
  const figsAfter = afterMap ? elevationFigures(project, afterMap) : [];

  const high = d.before.filter((r) => r.score >= settings.highThreshold).sort((a, b) => b.score - a.score);
  const retrofitSurfaces = project.surfaces.filter((s) => s.retrofitGlassTypeId);
  const retrofitArea = retrofitSurfaces.reduce((a, s) => a + s.areaM2, 0);

  const avgBefore = d.before.reduce((a, r) => a + r.score, 0) / Math.max(1, d.before.length);
  const avgAfter = d.after ? d.after.reduce((a, r) => a + r.score, 0) / Math.max(1, d.after.length) : null;
  const highAfter = d.after?.filter((r) => r.score >= settings.highThreshold).length;

  // 按改造玻璃汇总
  const planGroups = new Map<string, { count: number; area: number; reduction: number; beforeAvg: number }>();
  for (const s of retrofitSurfaces) {
    const gid = s.retrofitGlassTypeId!;
    const before = d.before.find((r) => r.surfaceId === s.id)?.score ?? 0;
    const after = d.after?.find((r) => r.surfaceId === s.id)?.score;
    const cur = planGroups.get(gid) ?? { count: 0, area: 0, reduction: 0, beforeAvg: 0 };
    cur.count++;
    cur.area += s.areaM2;
    cur.beforeAvg += before;
    if (after != null) cur.reduction += before - after;
    planGroups.set(gid, cur);
  }

  const dateStr = new Date().toLocaleString('zh-CN');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(project.name)} · 鸟类友好玻璃评估报告</title>
<style>
  *{box-sizing:border-box} body{font-family:'PingFang SC','Microsoft YaHei',system-ui,sans-serif;color:#111827;margin:0;background:#f1f5f9}
  .page{max-width:920px;margin:0 auto;background:#fff;padding:52px 60px}
  .cover{border-bottom:4px solid #0f766e;padding-bottom:22px;margin-bottom:26px}
  .kicker{letter-spacing:.28em;color:#0f766e;font-weight:700;font-size:12px}
  h1{font-size:30px;margin:8px 0 6px} h2{font-size:19px;margin:34px 0 12px;padding-left:11px;border-left:5px solid #0f766e}
  h3{font-size:15px;margin:18px 0 8px}
  .meta{color:#64748b;font-size:13px;line-height:1.9}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
  .kpi{border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center}
  .kpi .v{font-size:26px;font-weight:800;color:#0f766e}.kpi .v.red{color:#dc2626}.kpi .k{font-size:12px;color:#64748b;margin-top:3px}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0}
  th,td{border:1px solid #e2e8f0;padding:7px 9px;text-align:left} th{background:#f1f5f9}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .badge{display:inline-block;padding:2px 9px;border-radius:20px;color:#fff;font-size:11.5px;font-weight:700}
  .b-low{background:#2563eb}.b-medium{background:#ca8a04}.b-high{background:#ea580c}.b-critical{background:#dc2626}
  .fig{margin:12px 0 20px}.figs2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .note{background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:13px 16px;font-size:12.8px;color:#115e59;line-height:1.9}
  .formula{font-family:ui-monospace,Consolas,monospace;background:#0b2229;color:#a7f3d0;border-radius:10px;padding:13px 16px;font-size:12.5px;line-height:1.9;white-space:pre-wrap}
  .legend{display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;margin:6px 0}
  .legend .bar{width:180px;height:10px;border-radius:6px;background:linear-gradient(90deg,#2563eb,#0ea5e9,#facc15,#f97316,#dc2626)}
  .foot{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11.5px}
  @media print{body{background:#fff}.page{padding:20px 26px;max-width:none}.noprint{display:none}}
</style></head><body><div class="page">
  <div class="cover">
    <div class="kicker">BIRD-SAFE GLASS · REFLECTION & COLLISION RISK</div>
    <h1>${esc(project.name)}<br/>建筑玻璃防鸟撞评估报告</h1>
    <div class="meta">
      项目地点：${esc(project.location || '—')}<br/>
      评估单位：${esc(settings.organization)}　评估人：${esc(settings.evaluator || '—')}<br/>
      报告生成：${dateStr}　计算引擎：${esc(d.engine)}${d.sampleCount ? `　采样光线：${d.sampleCount.toLocaleString('zh-CN')} 条` : ''}
    </div>
  </div>

  <div class="noprint" style="text-align:right;margin-bottom:8px"><button onclick="window.print()" style="background:#0f766e;color:#fff;border:0;padding:9px 18px;border-radius:9px;font-size:14px;cursor:pointer">🖨 打印 / 另存为 PDF</button></div>

  <h2>一、项目概况</h2>
  <p style="font-size:13.5px;line-height:1.9">${esc(project.description || '无')}</p>
  <div class="kpis">
    <div class="kpi"><div class="v">${project.surfaces.length}</div><div class="k">受评玻璃面</div></div>
    <div class="kpi"><div class="v red">${high.length}</div><div class="k">高/极高风险块</div></div>
    <div class="kpi"><div class="v">${avgBefore.toFixed(1)}</div><div class="k">平均风险分</div></div>
    <div class="kpi"><div class="v">${retrofitArea.toFixed(0)}㎡</div><div class="k">拟定改造面积</div></div>
  </div>
  <p class="meta">鸟况参数：飞行高度 ${project.bird.minHeightM}–${project.bird.maxHeightM} m（${project.bird.heightSteps} 层），主导方位 ${project.bird.headingDeg}°，扫掠 ±${project.bird.headingSpreadDeg / 2}°（${project.bird.headingSteps} 向），观察距离 ${project.bird.observerDistanceM} m。</p>

  <h2>二、风险立面热力图（改造前）</h2>
  <div class="legend"><span>低</span><span class="bar"></span><span>高</span><span>阈值：中 ${settings.mediumThreshold} / 高 ${settings.highThreshold} / 极高 ${settings.criticalThreshold}</span></div>
  ${figsBefore.map((f) => `<div class="fig">${f.svg}</div>`).join('')}

  <h2>三、高风险玻璃清单（Top ${Math.min(40, high.length)}）</h2>
  <table><thead><tr><th>玻璃</th><th>朝向/位置</th><th class="num">楼层</th><th class="num">面积㎡</th><th>等级</th><th class="num">风险分</th><th class="num">最近绿化 m</th></tr></thead><tbody>
  ${high.slice(0, 40).map((r) => {
    const s = project.surfaces.find((x) => x.id === r.surfaceId)!;
    return `<tr><td>${esc(s.name)}</td><td>${facadeName(s.normal)}</td><td class="num">${s.floor || '跨层'}</td><td class="num">${s.areaM2.toFixed(1)}</td>
      <td><span class="badge b-${r.level}">${LEVEL_LABEL[r.level]}</span></td><td class="num"><b>${r.score.toFixed(0)}</b></td><td class="num">${r.nearestGreenDistanceM}</td></tr>`;
  }).join('') || '<tr><td colspan="7">无超过高风险阈值的玻璃。</td></tr>'}
  </tbody></table>

  <h2>四、改造措施与前后对比</h2>
  ${d.after && avgAfter != null ? `
  <div class="kpis">
    <div class="kpi"><div class="v">${avgBefore.toFixed(1)} → ${avgAfter.toFixed(1)}</div><div class="k">平均风险分</div></div>
    <div class="kpi"><div class="v" style="color:#16a34a">−${(avgBefore - avgAfter).toFixed(1)}</div><div class="k">平均分下降</div></div>
    <div class="kpi"><div class="v red">${high.length} → ${highAfter ?? '-'}</div><div class="k">高风险块数量</div></div>
    <div class="kpi"><div class="v">${retrofitSurfaces.length}</div><div class="k">更换玻璃块数</div></div>
  </div>
  <div class="figs2">
    <div><h3 style="text-align:center">改造前</h3>${figsBefore[0]?.svg ?? ''}</div>
    <div><h3 style="text-align:center">改造后</h3>${figsAfter[0]?.svg ?? ''}</div>
  </div>` : '<p class="meta">尚未执行改造后复算，以下为拟定改造清单。</p>'}

  <h3>改造清单（按玻璃型号汇总）</h3>
  <table><thead><tr><th>替换为</th><th class="num">块数</th><th class="num">面积㎡</th><th>图案参数</th>${d.after ? '<th class="num">累计风险分下降</th>' : ''}</tr></thead><tbody>
  ${[...planGroups.entries()].map(([gid, v]) => {
    const g = gmap.get(gid);
    return `<tr><td>${g?.birdSafe ? '🦅 ' : ''}${esc(g?.name ?? gid)}</td><td class="num">${v.count}</td><td class="num">${v.area.toFixed(1)}</td>
      <td>${patternText(g)}</td>${d.after ? `<td class="num" style="color:#16a34a;font-weight:700">−${v.reduction.toFixed(0)}</td>` : ''}</tr>`;
  }).join('') || '<tr><td colspan="5">尚未指定改造玻璃。</td></tr>'}
  </tbody></table>

  <h3>逐块改造明细</h3>
  <table><thead><tr><th>玻璃</th><th>替换型号</th><th class="num">面积㎡</th><th class="num">改造前</th>${d.after ? '<th class="num">改造后</th><th class="num">下降</th>' : ''}</tr></thead><tbody>
  ${retrofitSurfaces.map((s) => {
    const b = d.before.find((r) => r.surfaceId === s.id)?.score;
    const a = d.after?.find((r) => r.surfaceId === s.id)?.score;
    return `<tr><td>${esc(s.name)}</td><td>${esc(gmap.get(s.retrofitGlassTypeId!)?.name ?? '')}</td><td class="num">${s.areaM2.toFixed(1)}</td><td class="num">${b?.toFixed(0) ?? '-'}</td>${d.after ? `<td class="num">${a?.toFixed(0) ?? '-'}</td><td class="num" style="color:#16a34a;font-weight:700">${b != null && a != null ? '−' + (b - a).toFixed(0) : '-'}</td>` : ''}</tr>`;
  }).join('') || '<tr><td colspan="6">暂无改造项。</td></tr>'}
  </tbody></table>

  <h2>五、计算方法与菲涅尔正确性</h2>
  <div class="note">
    反射率采用<b>严格电介质菲涅尔方程</b>（非 Schlick 近似），由玻璃库法向反射率 R₀ 反解折射率 n=(1+√R₀)/(1−√R₀)。
    对每一鸟视线入射角 θ：<br/>
  </div>
  <div class="formula">sin θt = (n1/n2) sin θi,  n1=1
Rs = ((n1 cosθi − n2 cosθt)/(n1 cosθi + n2 cosθt))²
Rp = ((n2 cosθi − n1 cosθt)/(n2 cosθi + n1 cosθt))²
R  = (Rs + Rp) / 2
θi = 0° 时 R = ((n−1)/(n+1))²；θi → 90°（掠射）时 R → 1。</div>
  <p class="meta">GPU WGSL 计算着色器与 CPU 参考实现使用逐行对应的同一公式。${d.fresnelErrorPct != null ? `本次环境 GPU 对 361 个角度的自检最大相对误差为 <b>${d.fresnelErrorPct.toFixed(5)}%</b>（容差 ${settings.fresnelTolerancePct}%）。` : '可在「设置与自检」中运行 GPU 菲涅尔误差校验。'} 风险分由反射强度、绿化距离、楼层曲线、看穿度、转角因子加权，并受防鸟图案威慑折减。本报告为设计阶段生态风险评估参考，不替代现场鸟撞调查与当地规范。</p>

  <div class="foot">羽鉴 BirdGlass · 浏览器端 TypeScript + WebGPU 评估系统 · 数据与报告均在本地生成</div>
</div></body></html>`;
}

function facadeName(n: { x: number; y: number; z: number }): string {
  if (Math.abs(n.y) > 0.7) return '屋面';
  if (Math.abs(n.z) >= Math.abs(n.x)) return n.z > 0 ? '北立面' : '南立面';
  return n.x > 0 ? '东立面' : '西立面';
}
function patternText(g?: GlassType): string {
  if (!g || g.pattern.type === 'none') return '无图案';
  const p = g.pattern;
  if (p.type === 'dots') return `圆点 Ø${(p.sizeM * 1000).toFixed(0)}mm @ ${(p.spacingXM * 1000).toFixed(0)}×${(p.spacingYM * 1000).toFixed(0)}mm`;
  return `竖条 ${(p.sizeM * 1000).toFixed(0)}mm / 周期 ${(p.spacingXM * 1000).toFixed(0)}mm`;
}

export function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
