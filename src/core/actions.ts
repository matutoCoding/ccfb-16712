import type { AnalysisSnapshot } from './types';
import { useStore } from './store';
import { analyzeGpu } from '../gpu/gpuEngine';
import { analyzeCpu, type AnalysisResult } from './engine';
import { uid } from './geom';

/** 优先 WebGPU，失败自动回退 CPU 参考引擎。 */
export async function runAnalysisSmart(
  projectId: string,
  opts: { useRetrofit?: boolean } = {},
): Promise<AnalysisResult> {
  const { projects, glass, settings } = useStore.getState();
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error('项目不存在');
  try {
    return await analyzeGpu(project, glass, settings, opts);
  } catch (err) {
    console.warn('GPU 分析失败，回退 CPU：', err);
    const r = analyzeCpu(project, glass, settings, { ...opts, engine: 'cpu-reference' });
    useStore.getState().pushToast(`WebGPU 计算不可用，已用 CPU 参考引擎（${(err as Error).message.slice(0, 60)}）`, 'info');
    return r;
  }
}

export async function executeBaseline(projectId: string): Promise<AnalysisSnapshot> {
  const result = await runAnalysisSmart(projectId);
  const { updateProject } = useStore.getState();
  const snapshot: AnalysisSnapshot = {
    id: uid('snap'),
    createdAt: Date.now(),
    birdProfile: useStore.getState().projects.find((p) => p.id === projectId)!.bird,
    weights: useStore.getState().projects.find((p) => p.id === projectId)!.weights,
    reflectionStats: result.stats,
    risks: result.risks,
    engine: result.engine,
  };
  updateProject(
    projectId,
    (p) => {
      p.snapshots.unshift(snapshot);
      if (p.snapshots.length > 20) p.snapshots.length = 20;
      p.latestSnapshotId = snapshot.id;
    },
    true,
  );
  return snapshot;
}

export async function executeRetrofit(projectId: string) {
  return runAnalysisSmart(projectId, { useRetrofit: true });
}
