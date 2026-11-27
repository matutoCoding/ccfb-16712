import { useStore } from '../core/store';
import type { AnalysisSnapshot, Project } from '../core/types';

export function useCurrentProject(): Project | undefined {
  const currentId = useStore((s) => s.currentId);
  return useStore((s) => s.projects.find((p) => p.id === currentId));
}

export function useLatestSnapshot(project?: Project): AnalysisSnapshot | undefined {
  if (!project) return undefined;
  return project.snapshots.find((s) => s.id === project.latestSnapshotId) ?? project.snapshots[0];
}
