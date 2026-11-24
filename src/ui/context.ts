import type { AnalysisResult, AppSettings, GlassMaterial, ID, Project } from '../types';

export type RouteName = 'projects' | 'building' | 'glass' | 'reflection' | 'risk' | 'measures' | 'settings';

export interface MutateOptions {
  immediate?: boolean;
  silent?: boolean;
}

export interface AppContext {
  projects: Project[];
  materials: GlassMaterial[];
  appSettings: AppSettings;
  currentId: ID | null;
  current: Project | null;
  route: RouteName;
  analysis: AnalysisResult | null;
  analysisStatus: 'idle' | 'running' | 'ready' | 'error';
  analysisError: string | null;
  selectedObjectId: ID | null;
  navigate(route: RouteName, projectId?: ID): void;
  openProject(id: ID): void;
  setSelectedObject(id: ID | null): void;
  refresh(): void;
  mutateProject(mutator: (project: Project) => void, options?: MutateOptions): void;
  saveNow(): Promise<void>;
  runAnalysis(): Promise<AnalysisResult | null>;
  upsertMaterial(material: GlassMaterial): Promise<void>;
  deleteMaterial(id: ID): Promise<void>;
  toast(message: string, tone?: 'default' | 'ok' | 'error'): void;
}
