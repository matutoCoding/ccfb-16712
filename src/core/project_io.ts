import type { ExportBundle, GlassMaterial, Project } from '../types';
import { downloadBlob, uid } from './math';
import { DEFAULT_SETTINGS } from './materials';
import { iorFromNormalReflectance } from './fresnel';

export function exportProjectJson(project: Project, materials: GlassMaterial[]) {
  const usedIds = new Set(project.objects.map((o) => o.glass?.materialId).filter(Boolean) as string[]);
  Object.values(project.mitigation.assignments).forEach((id) => usedIds.add(id));
  const usedMaterials = materials.filter((m) => usedIds.has(m.id));
  const bundle: ExportBundle = {
    app: 'bird-glass-studio',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project,
    materials: usedMaterials,
  };
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  downloadBlob(JSON.stringify(bundle, null, 2), `${safeName}-防鸟撞评估项目.json`, 'application/json;charset=utf-8');
}

export function duplicateProject(project: Project): Project {
  const now = new Date().toISOString();
  const copy: Project = structuredClone(project);
  copy.id = uid('prj');
  copy.name = `${project.name} 副本`;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.mitigation = structuredClone(project.mitigation ?? { assignments: {}, target: project.settings.highThreshold });
  return copy;
}

export interface ImportedBundle {
  project: Project;
  materials: GlassMaterial[];
}

export function parseImportBundle(text: string): ImportedBundle {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('文件不是有效的 JSON 项目包');
  const data = parsed as Partial<ExportBundle> | Project;
  const bundle = ('project' in data && data.project ? data : { project: data as Project, materials: [] }) as ExportBundle;
  if (!bundle.project || !Array.isArray(bundle.project.objects) || !bundle.project.settings) {
    throw new Error('文件不是有效的羽鉴项目导出包');
  }

  const project: Project = structuredClone(bundle.project);
  project.id = uid('prj');
  project.name = `${project.name || '导入项目'} 导入副本`;
  project.createdAt = new Date().toISOString();
  project.updatedAt = new Date().toISOString();
  project.objects ??= [];
  project.buildings ??= [];
  project.trees ??= [];
  project.water ??= [];
  project.settings = { ...DEFAULT_SETTINGS, ...(project.settings ?? {}) };
  project.mitigation ??= { assignments: {}, target: project.settings.highThreshold ?? 65 };

  const materials = (bundle.materials ?? []).map((entry) => {
    const m = structuredClone(entry);
    m.pattern ??= { kind: 'none', spacingXMm: 100, spacingYMm: 100, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f8fafc' };
    m.ior = m.ior > 1 ? m.ior : iorFromNormalReflectance(m.reflectance || 0.08);
    return m;
  });
  const idMap = new Map<string, string>();
  materials.forEach((m) => {
    const nextId = uid('mat-import');
    idMap.set(m.id, nextId);
    m.id = nextId;
  });

  const fallbackMaterial = materials[0];
  for (const obj of project.objects) {
    if (obj.glass) {
      const oldId = obj.glass.materialId;
      obj.glass.materialId = idMap.get(oldId) ?? fallbackMaterial?.id ?? 'mat-clear';
    }
  }
  const nextAssignments: Record<string, string> = {};
  for (const [glassId, materialId] of Object.entries(project.mitigation.assignments ?? {})) {
    const nextId = idMap.get(materialId);
    if (nextId) nextAssignments[glassId] = nextId;
  }
  project.mitigation.assignments = nextAssignments;
  return { project, materials };
}
