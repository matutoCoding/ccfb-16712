import { createOfficeProject } from '../src/core/seed.ts';
import { createDefaultMaterials } from '../src/core/materials.ts';
import { evaluateProjectCpu } from '../src/core/analysis_cpu.ts';
import { buildReportHtml } from '../src/core/report.ts';
import { elevationSvg } from '../src/ui/heatmap.ts';

const project = createOfficeProject();
const materials = createDefaultMaterials();
const result = evaluateProjectCpu(project, materials);
for (const id of Object.keys(result.glasses).slice(0, 12)) project.mitigation.assignments[id] = 'mat-frit-dots';
const html = buildReportHtml(project, materials, result);
if (!html.includes('防鸟撞评估报告') || !html.includes('<svg')) throw new Error('report missing content');
for (const facade of ['south', 'north', 'east', 'west', 'all-special'] as const) {
  const svg = elevationSvg(project, result, facade, 'after');
  if (!svg.includes('<svg')) throw new Error(`missing svg ${facade}`);
}
console.log(`report smoke PASS, html length=${html.length}`);
