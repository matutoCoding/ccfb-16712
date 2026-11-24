export interface GpuContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  name: string;
}

let gpuPromise: Promise<GpuContext | null> | null = null;

export function getGpuContext(): Promise<GpuContext | null> {
  if (gpuPromise) return gpuPromise;
  gpuPromise = (async () => {
    if (!navigator.gpu) return null;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const info = (adapter as unknown as { info?: { description?: string; vendor?: string; architecture?: string } }).info;
      const name = info?.description || `${info?.vendor ?? 'WebGPU'} ${info?.architecture ?? ''}`.trim() || 'WebGPU Adapter';
      device.lost.then((reason: { message?: string }) => console.warn('WebGPU device lost', reason.message));
      return { adapter, device, name };
    } catch (error) {
      console.warn('WebGPU initialization failed, using CPU reference', error);
      return null;
    }
  })();
  return gpuPromise;
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
