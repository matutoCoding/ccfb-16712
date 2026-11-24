import type { FresnelValidation } from '../types';
import { h, icon } from './dom';
import { runGpuFresnelValidation } from '../gpu/analysis_gpu';
import { compareFresnelValues, fresnelUnpolarized } from '../core/fresnel';
import { formatNumber } from '../core/math';

export function createFresnelPanel(): HTMLElement {
  const resultHost = h('div', null, h('p', { class: 'muted' }, '尚未运行校验。点击按钮后会在 WebGPU compute shader 中计算 0°–90° 的反射率,并与 TypeScript 精确公式逐点比较。'));
  const button = h('button', { class: 'btn primary' }, icon('play', 16), '运行 GPU vs 公式校验') as HTMLButtonElement;

  const run = async () => {
    button.disabled = true;
    button.textContent = 'GPU 校验运行中…';
    let validation: FresnelValidation | null = null;
    try {
      validation = await runGpuFresnelValidation();
    } catch (error) {
      console.warn('GPU Fresnel validation failed', error);
      validation = null;
    }
    if (!validation) {
      const values = [0, 5, 10, 15, 20, 30, 40, 50, 55, 60, 65, 70, 75, 80, 85, 89, 90].map((a) => fresnelUnpolarized(Math.cos((a * Math.PI) / 180), 1, 1.52));
      validation = { backend: 'cpu-reference', ...compareFresnelValues(values, 1.52) };
    }
    button.disabled = false;
    button.replaceChildren(icon('refresh', 16), document.createTextNode('重新运行校验'));
    renderResult(validation);
  };

  button.addEventListener('click', () => void run());
  void run();

  function renderResult(v: FresnelValidation) {
    const badge = v.passed
      ? h('span', { class: 'badge ok' }, icon('check', 14), `通过:最大误差 ${(v.maxAbsoluteError * 100).toFixed(5)} 个百分点`)
      : h('span', { class: 'badge danger' }, `未通过:${(v.maxAbsoluteError * 100).toFixed(3)}`);
    const backend = h('span', { class: v.backend === 'webgpu' ? 'badge primary' : 'badge warn' }, v.backend === 'webgpu' ? 'WebGPU Compute 实测' : 'WebGPU 不可用,CPU 自检');
    const rows = v.points.map((p) => h('tr', null,
      h('td', null, `${p.angleDeg}°`),
      h('td', { class: 'num' }, p.expected.toFixed(8)),
      h('td', { class: 'num' }, Number.isFinite(p.actual) ? p.actual.toFixed(8) : '—'),
      h('td', { class: `num ${p.absoluteError < 0.01 ? 'good' : 'bad'}` }, `${(p.absoluteError * 100).toFixed(6)}%`),
      h('td', { class: `num ${p.relativeError < 0.01 ? 'good' : 'bad'}` }, `${(p.relativeError * 100).toFixed(5)}%`),
    ));
    resultHost.replaceChildren(
      h('div', { class: 'row mb-0' }, backend, badge, h('span', { class: 'muted small right' }, '阈值:绝对误差 < 1 个百分点且相对误差 < 1%')),
      h('div', { class: 'table-wrap mt-4 validation-table', style: 'max-height:320px' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, '入射角'), h('th', { class: 'num' }, '精确公式 R'), h('th', { class: 'num' }, v.backend === 'webgpu' ? 'WGSL GPU R' : 'CPU R'), h('th', { class: 'num' }, '绝对误差'), h('th', { class: 'num' }, '相对误差'))),
        h('tbody', null, ...rows),
      )),
      h('p', { class: 'hint mt-4' }, `89° 时公式反射率约 ${formatNumber(fresnelUnpolarized(Math.cos((89 * Math.PI) / 180)), 4)},90° 掠射极限为 1。`),
    );
  }

  return h('div', { class: 'card stack' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, '菲涅尔公式硬校验'), h('p', { class: 'card-sub' }, '精确非偏振 Fresnel,不是 Schlick 近似;WGSL 与 TypeScript 使用同一组 Rs/Rp 公式。'))),
    h('div', null, button),
    resultHost,
  );
}
