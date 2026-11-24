import type { AnalysisResult, GlassMaterial, Project } from '../types';
import { evaluateProjectCpu } from './analysis_cpu';
import { evaluateProjectGpu } from '../gpu/analysis_gpu';

export async function evaluateProject(project: Project, materials: GlassMaterial[]): Promise<AnalysisResult> {
  try {
    const gpuResult = await evaluateProjectGpu(project, materials);
    if (gpuResult && Object.keys(gpuResult.glasses).length) return gpuResult;
    if (gpuResult && !project.objects.some((o) => o.glass)) return gpuResult;
  } catch (error) {
    console.warn('GPU evaluation failed, falling back to CPU reference', error);
  }
  return evaluateProjectCpu(project, materials);
}
