import { createOfficeProject, createMallProject } from '../src/core/seed.ts';
import { createDefaultMaterials } from '../src/core/materials.ts';
import { evaluateProjectCpu } from '../src/core/analysis_cpu.ts';
import { fresnelUnpolarized } from '../src/core/fresnel.ts';

const materials = createDefaultMaterials();
for (const project of [createOfficeProject(), createMallProject()]) {
  const result = evaluateProjectCpu(project, materials);
  const values = Object.values(result.glasses);
  if (!values.length) throw new Error(`${project.name} has no glass analysis`);
  for (const a of values) {
    for (const [key, value] of Object.entries(a)) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${project.name} ${a.glassId} ${key} not finite`);
    }
    if (a.riskBefore < 0 || a.riskBefore > 100) throw new Error('risk out of range');
  }
  const high = values.filter((a) => a.riskBefore >= project.settings.highThreshold).length;
  const top = [...values].sort((a, b) => b.riskBefore - a.riskBefore).slice(0, 5).map((a) => `${a.riskBefore.toFixed(1)}(F${a.avgFresnel.toFixed(2)},tree${(a.treeShare * 100).toFixed(0)},d${a.nearestTreeDistance.toFixed(1)},see${a.throughShare.toFixed(2)})`).join(' ');
  console.log(`${project.name}: ${values.length} glasses, avg=${(values.reduce((s, a) => s + a.riskBefore, 0) / values.length).toFixed(1)}, high=${high}, top=${top}`);
  for (const a of values) if (a.riskBefore >= project.settings.highThreshold) project.mitigation.assignments[a.glassId] = 'mat-frit-dots';
  const mitigated = evaluateProjectCpu(project, materials);
  const after = Object.values(mitigated.glasses).filter((a) => project.mitigation.assignments[a.glassId]);
  const avgBefore = after.reduce((s, a) => s + a.riskBefore, 0) / Math.max(1, after.length);
  const avgAfter = after.reduce((s, a) => s + a.riskAfter, 0) / Math.max(1, after.length);
  if (avgAfter >= avgBefore - 10) throw new Error(`${project.name} mitigation effect too small`);
  console.log(`  mitigation ${after.length} panels: ${avgBefore.toFixed(1)} -> ${avgAfter.toFixed(1)}`);
}

const f0 = fresnelUnpolarized(1, 1, 1.52);
const f90 = fresnelUnpolarized(0, 1, 1.52);
if (Math.abs(f0 - 0.04258) > 0.001) throw new Error(`bad normal Fresnel ${f0}`);
if (Math.abs(f90 - 1) > 1e-9) throw new Error(`bad grazing Fresnel ${f90}`);
console.log('core smoke PASS');
