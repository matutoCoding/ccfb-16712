/** 自动化验证/评测钩子：window.__BIRD_GLASS__ 暴露核心数学与 GPU 自检。 */
import { fresnelReflectanceDeg, fresnelByCosine, maxRelativeErrorVsReference, brewsterAngleDeg } from './core/fresnel';
import { gpuFresnelSelfTest } from './gpu/gpuEngine';
import { useStore } from './core/store';
import { executeBaseline, executeRetrofit } from './core/actions';
import { analyzeCpu } from './core/engine';

export function installTestHook() {
  (window as unknown as { __BIRD_GLASS__?: unknown }).__BIRD_GLASS__ = {
    version: '1.0.0',
    fresnelDeg: fresnelReflectanceDeg,
    fresnelCos: (c: number, ior = 1.52) => fresnelByCosine(c, ior).r,
    fresnelDetail: fresnelByCosine,
    maxFormulaError: (ior = 1.52) => maxRelativeErrorVsReference(ior),
    brewster: brewsterAngleDeg,
    gpuSelfTest: gpuFresnelSelfTest,
    store: useStore,
    runBaseline: executeBaseline,
    runRetrofit: executeRetrofit,
    analyzeCpu: (projectId: string) => {
      const s = useStore.getState();
      const p = s.projects.find((x) => x.id === projectId) ?? s.projects[0];
      return analyzeCpu(p, s.glass, s.settings);
    },
    ready: () => useStore.getState().ready,
  };
}

declare global {
  interface Window {
    __BIRD_GLASS__?: {
      fresnelDeg: typeof fresnelReflectanceDeg;
      gpuSelfTest: typeof gpuFresnelSelfTest;
      [k: string]: unknown;
    };
  }
}
