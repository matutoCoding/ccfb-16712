import type { GlassMaterial, PatternKind } from '../types';
import type { AppContext } from './context';
import { h, icon } from './dom';
import { iorFromNormalReflectance } from '../core/fresnel';
import { patternKindLabel } from '../core/materials';
import { uid } from '../core/math';

function patternBackground(m: GlassMaterial): string {
  const p = m.pattern;
  const c = p.color || '#f8fafc';
  if (p.kind === 'dots') {
    const r = Math.max(2, p.dotRadiusMm / 3);
    return `radial-gradient(circle, ${c} ${r}px, rgba(255,255,255,0) ${r + 1.2}px) 0 0 / ${Math.max(10, p.spacingXMm / 2.4)}px ${Math.max(10, p.spacingYMm / 2.4)}px`;
  }
  if (p.kind === 'stripes') {
    const w = Math.max(3, p.stripeWidthMm / 2);
    const gap = Math.max(12, p.spacingYMm / 2);
    return p.orientation === 'horizontal'
      ? `repeating-linear-gradient(0deg, ${c} 0 ${w}px, transparent ${w}px ${gap}px)`
      : `repeating-linear-gradient(90deg, ${c} 0 ${w}px, transparent ${w}px ${gap}px)`;
  }
  if (p.kind === 'grid') {
    const w = Math.max(2, p.stripeWidthMm / 2.4);
    const sx = Math.max(12, p.spacingXMm / 2.2);
    const sy = Math.max(12, p.spacingYMm / 2.2);
    return `linear-gradient(${c} ${w}px, transparent ${w}px) 0 0 / ${sx}px ${sy}px, linear-gradient(90deg, ${c} ${w}px, transparent ${w}px) 0 0 / ${sx}px ${sy}px`;
  }
  return 'none';
}

function NumberField(label: string, value: number, step: number, min: number, max: number, onInput: (v: number) => void, hint?: string) {
  const input = h('input', { class: 'input', type: 'number', value, step, min, max }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onInput(v);
  });
  return h('label', { class: 'field' }, label, input, hint ? h('span', { class: 'hint' }, hint) : null);
}

let selectedId: string | null = null;

export function renderGlassPage(ctx: AppContext): HTMLElement {
  if (!selectedId || !ctx.materials.some((m) => m.id === selectedId)) selectedId = ctx.materials[0]?.id ?? null;

  const editorHost = h('div', { class: 'stack' });
  const gridHost = h('div', { class: 'material-grid' });

  const persist = async (m: GlassMaterial) => {
    await ctx.upsertMaterial(m);
  };

  const renderEditor = () => {
    const m = ctx.materials.find((item) => item.id === selectedId) ?? ctx.materials[0];
    if (!m) {
      editorHost.replaceChildren(h('div', { class: 'empty-state' }, '玻璃库为空,请新建材料'));
      return;
    }

    const nameInput = h('input', { class: 'input', value: m.name }) as HTMLInputElement;
    nameInput.addEventListener('input', () => { m.name = nameInput.value; void persist(m); });
    const makerInput = h('input', { class: 'input', value: m.manufacturer }) as HTMLInputElement;
    makerInput.addEventListener('input', () => { m.manufacturer = makerInput.value; void persist(m); });
    const colorInput = h('input', { class: 'input', type: 'color', value: m.coatingColor, style: 'height:38px;padding:4px' }) as HTMLInputElement;
    colorInput.addEventListener('input', () => { m.coatingColor = colorInput.value; void persist(m); });
    const patternColor = h('input', { class: 'input', type: 'color', value: m.pattern.color, style: 'height:38px;padding:4px' }) as HTMLInputElement;
    patternColor.addEventListener('input', () => { m.pattern.color = patternColor.value; void persist(m); });
    const kindSelect = h('select', { class: 'input' },
      ...(['none', 'dots', 'stripes', 'grid'] as PatternKind[]).map((k) => h('option', { value: k, selected: m.pattern.kind === k }, patternKindLabel(k))),
    ) as HTMLSelectElement;
    kindSelect.addEventListener('change', () => { m.pattern.kind = kindSelect.value as PatternKind; m.birdSafe = m.pattern.kind !== 'none'; void persist(m); ctx.refresh(); });

    editorHost.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', null, h('h3', { class: 'card-title' }, '玻璃参数'), h('p', { class: 'card-sub' }, '反射率按法向 F0 录入,分析时用精确 Fresnel 公式随入射角变化。')),
          h('span', { class: m.birdSafe ? 'badge ok' : 'badge' }, m.birdSafe ? '防鸟图案' : '普通玻璃'),
        ),
        h('div', { class: 'field-grid' },
          h('label', { class: 'field' }, '材料名称', nameInput),
          h('label', { class: 'field' }, '厂商/系列', makerInput),
          NumberField('法向反射率 F0', m.reflectance, 0.001, 0, 0.98, (v) => { m.reflectance = v; m.ior = iorFromNormalReflectance(v); void persist(m); }, '清玻约 0.043,高反射镀膜可到 0.2~0.35'),
          NumberField('可见光透射率', m.transmittance, 0.01, 0, 0.98, (v) => { m.transmittance = v; void persist(m); }),
          NumberField('等效折射率 IOR', m.ior, 0.01, 1.01, 6, (v) => { m.ior = v; void persist(m); }, '修改反射率会自动反推;也可手动覆盖'),
          NumberField('方案单价 元/㎡', m.costPerM2, 10, 0, 100000, (v) => { m.costPerM2 = v; void persist(m); }),
          h('label', { class: 'field' }, '镀膜颜色', colorInput),
          h('label', { class: 'field' }, '图案颜色', patternColor),
        ),
        h('div', { class: 'field-grid' },
          h('label', { class: 'field' }, '图案类型', kindSelect),
          NumberField('横向间距 mm', m.pattern.spacingXMm, 1, 5, 1000, (v) => { m.pattern.spacingXMm = v; void persist(m); }),
          NumberField('纵向间距 mm', m.pattern.spacingYMm, 1, 5, 1000, (v) => { m.pattern.spacingYMm = v; void persist(m); ctx.refresh(); }, '防鸟设计常用 50mm 网格规则'),
          NumberField('圆点半径 mm', m.pattern.dotRadiusMm, 0.5, 1, 100, (v) => { m.pattern.dotRadiusMm = v; void persist(m); }),
          NumberField('条纹/网格线宽 mm', m.pattern.stripeWidthMm, 0.5, 1, 100, (v) => { m.pattern.stripeWidthMm = v; void persist(m); }),
          h('label', { class: 'field' }, '条纹方向', h('select', { class: 'input', value: m.pattern.orientation, onChange: (e: Event) => { m.pattern.orientation = (e.target as HTMLSelectElement).value as 'horizontal' | 'vertical'; void persist(m); ctx.refresh(); } }, h('option', { value: 'horizontal' }, '横向条纹'), h('option', { value: 'vertical' }, '竖向条纹'))),
        ),
        h('label', { class: 'check-field' }, h('input', { type: 'checkbox', checked: m.birdSafe, onChange: (e: Event) => { m.birdSafe = (e.target as HTMLInputElement).checked; void persist(m); } }), '将该材料标记为防鸟玻璃'),
        h('label', { class: 'field mt-4' }, '备注', h('textarea', { class: 'input', onInput: (e: Event) => { m.note = (e.target as HTMLTextAreaElement).value; void persist(m); } }, m.note)),
        h('div', { class: 'row mt-4' },
          h('button', { class: 'btn', onClick: () => {
            const copy: GlassMaterial = structuredClone(m);
            copy.id = uid('mat');
            copy.name = `${m.name} 自定义`;
            copy.builtin = false;
            ctx.materials.push(copy);
            selectedId = copy.id;
            void ctx.upsertMaterial(copy).then(() => ctx.refresh());
          } }, icon('copy', 16), '复制为自定义'),
          m.builtin ? h('span', { class: 'hint muted' }, '内置材料可复制后修改') : h('button', { class: 'btn danger right', onClick: async () => { await ctx.deleteMaterial(m.id); selectedId = ctx.materials[0]?.id ?? null; ctx.refresh(); } }, icon('trash', 16), '删除材料'),
        ),
      ),
    );
  };

  const renderGrid = () => {
    gridGridRefresh();
  };
  const gridGridRefresh = () => {
    gridHost.replaceChildren(...ctx.materials.map((m) => {
      const swatch = h('div', { class: 'swatch', style: `--coat:${m.coatingColor}` }, h('div', { class: 'pattern-preview', style: `background:${patternBackground(m)}` }));
      return h('article', { class: 'material-card', tabindex: '0', onClick: () => { selectedId = m.id; renderEditor(); document.querySelectorAll('.material-card').forEach((c) => (c as HTMLElement).style.outline = ''); } },
        swatch,
        h('div', { class: 'material-body' },
          h('div', { class: 'row' }, h('h3', { class: 'mb-0' }, m.name), h('span', { class: m.birdSafe ? 'badge ok right' : 'badge' }, patternKindLabel(m.pattern.kind))),
          h('dl', { class: 'kv' },
            h('dt', null, '反射率'), h('dd', null, `${(m.reflectance * 100).toFixed(1)}%`),
            h('dt', null, '透射率'), h('dd', null, `${(m.transmittance * 100).toFixed(1)}%`),
            h('dt', null, '间距'), h('dd', null, m.pattern.kind === 'none' ? '—' : `${m.pattern.spacingXMm}×${m.pattern.spacingYMm}mm`),
            h('dt', null, '单价'), h('dd', null, `¥${m.costPerM2}/㎡`),
          ),
          h('button', { class: 'btn sm', onClick: (e: MouseEvent) => { e.stopPropagation(); selectedId = m.id; renderEditor(); } }, '编辑参数'),
        ),
      );
    }));
  };

  renderEditor();
  renderGrid();

  return h('div', null,
    h('div', { class: 'page-head' },
      h('div', null, h('h2', null, '玻璃库'), h('p', null, '维护反射率、透射率、镀膜颜色和防鸟点阵/条纹。所有参数会进入 GPU uniform/storage buffer,图案间距使用真实米制尺寸计算。')),
      h('div', { class: 'head-actions' }, h('button', { class: 'btn primary', onClick: () => {
        const m: GlassMaterial = {
          id: uid('mat'), name: '新材料', manufacturer: '自定义', reflectance: 0.08, transmittance: 0.65, ior: iorFromNormalReflectance(0.08),
          coatingColor: '#8fb9cf', pattern: { kind: 'dots', spacingXMm: 50, spacingYMm: 50, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f8fafc' },
          birdSafe: true, costPerM2: 480, note: '',
        };
        ctx.materials.push(m); selectedId = m.id; void ctx.upsertMaterial(m).then(() => ctx.refresh());
      } }, icon('plus'), '新建玻璃')),
    ),
    h('div', { class: 'layout-4-8' }, editorHost, h('div', { class: 'stack' }, h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, '材料预览'), h('p', { class: 'card-sub' }, '预览只示意图案密度,真实反射以 Fresnel GPU 计算为准。')))), gridHost)),
  );
}
