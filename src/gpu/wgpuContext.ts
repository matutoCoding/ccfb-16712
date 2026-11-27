/** WebGPU 设备单例与能力探测。 */

let devicePromise: Promise<GPUDevice | null> | null = null;
let adapterInfo: GPUAdapterInfo | null = null;

export function isWebGpuProbablyAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export async function getDevice(): Promise<GPUDevice | null> {
  if (devicePromise) return devicePromise;
  devicePromise = (async () => {
    if (!isWebGpuProbablyAvailable()) return null;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      try {
        adapterInfo = await (adapter as GPUAdapter & { info?: Promise<GPUAdapterInfo> }).info
          ? await (adapter as unknown as { info: Promise<GPUAdapterInfo> }).info
          : null;
      } catch {
        adapterInfo = null;
      }
      const device = await adapter.requestDevice();
      device.addEventListener?.('uncapturederror', (e) => {
        const err = (e as GPUUncapturedErrorEvent).error;
        // 保留在控制台，便于排查 WGSL/管线错误
        console.warn('[WebGPU uncaptured error]', err?.message ?? err);
      });
      return device;
    } catch (err) {
      console.warn('WebGPU 初始化失败，将使用 CPU 参考引擎', err);
      return null;
    }
  })();
  return devicePromise;
}

export function getAdapterInfo(): GPUAdapterInfo | null {
  return adapterInfo;
}
