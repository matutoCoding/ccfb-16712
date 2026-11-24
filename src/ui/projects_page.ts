import type { AppContext } from './context';
import { h, icon } from './dom';
import { createBlankProject } from '../core/seed';
import { dbDeleteProject, dbPutProject, dbPutMaterial } from '../core/db';
import { duplicateProject, exportProjectJson, parseImportBundle } from '../core/project_io';
import { readFileAsText, formatDateTime } from '../core/math';

export function renderProjectsPage(ctx: AppContext): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const bundle = parseImportBundle(await readFileAsText(file));
      await dbPutProject(bundle.project);
      for (const m of bundle.materials) {
        ctx.materials.push(m);
        await dbPutMaterial(m);
      }
      ctx.projects.push(bundle.project);
      ctx.toast(`已导入「${bundle.project.name}」`, 'ok');
      ctx.openProject(bundle.project.id);
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : '导入失败', 'error');
    } finally {
      fileInput.value = '';
    }
  });

  const createNewButton = () => h('button', { class: 'btn primary', onClick: async () => {
    const project = createBlankProject();
    ctx.projects.unshift(project);
    await dbPutProject(project);
    ctx.openProject(project.id);
    ctx.toast('已创建空白项目,先去建筑与环境布置吧', 'ok');
  } }, icon('plus'), '新建项目');

  const createImportButton = () => h('button', { class: 'btn', onClick: () => fileInput.click() }, icon('upload'), '导入项目包');

  const hero = h('section', { class: 'project-hero' },
    h('div', { class: 'badge primary', style: 'background:rgba(204,251,241,.16);color:#99f6e4' }, icon('bird', 16), 'WebGPU 反射 · GPU 统计 · IndexedDB'),
    h('h2', null, '让每一块玻璃的天空、树影和看穿通道都可计算'),
    h('p', null, '从 OBJ 体块或参数化幕墙开始,按鸟飞高度与方向追踪 Fresnel 反射、绿化倒影、转角和连廊,生成立面热力图、改造方案与评估报告。'),
    h('div', { class: 'hero-actions' }, createNewButton(), createImportButton(),
      h('button', { class: 'btn', onClick: () => ctx.navigate('settings') }, icon('reflection'), '菲涅尔校验')),
  );

  const cards = ctx.projects.map((p) => {
    const glassCount = p.objects.filter((o) => o.glass).length;
    const area = p.objects.reduce((sum, o) => sum + (o.glass?.areaM2 ?? 0), 0);
    const high = ctx.analysis?.projectId === p.id ? Object.values(ctx.analysis.glasses).filter((a) => a.riskBefore >= p.settings.highThreshold).length : null;
    const coverClass = p.name.includes('商场') ? 'project-cover mall' : 'project-cover';
    const card = h('article', { class: 'project-card', tabindex: '0', role: 'button', 'aria-label': `打开${p.name}`,
      onClick: () => ctx.openProject(p.id),
      onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') ctx.openProject(p.id); } },
      h('div', { class: coverClass }, h('div', { class: 'building-shape' }), h('div', { class: 'lake' })),
      h('div', null,
        h('h3', null, p.name),
        h('div', { class: 'meta' }, h('span', null, p.city || '未填写城市'), h('span', null, `${glassCount} 块玻璃`), h('span', null, `${area.toFixed(0)}㎡`)),
        h('div', { class: 'meta', style: 'margin-top:6px' }, h('span', null, `更新于 ${formatDateTime(p.updatedAt).slice(5, 16)}`), high !== null ? h('span', { class: 'badge danger' }, `${high} 高风险`) : h('span', { class: 'badge' }, '未运行分析')),
      ),
      h('div', { class: 'actions', onClick: (e: Event) => e.stopPropagation() },
        h('button', { class: 'btn sm primary', onClick: () => ctx.openProject(p.id) }, '打开'),
        h('button', { class: 'icon-button', title: '复制项目', 'aria-label': '复制项目', onClick: async () => {
          const copy = duplicateProject(p);
          ctx.projects.unshift(copy);
          await dbPutProject(copy);
          ctx.refresh();
          ctx.toast('项目已复制,内部玻璃与措施一并保留', 'ok');
        } }, icon('copy', 16)),
        h('button', { class: 'icon-button', title: '导出项目 JSON', 'aria-label': '导出项目', onClick: () => exportProjectJson(p, ctx.materials) }, icon('download', 16)),
        h('button', { class: 'icon-button danger', title: '删除项目', 'aria-label': '删除项目', onClick: async (e: MouseEvent) => {
          const btn = e.currentTarget as HTMLButtonElement;
          if (btn.dataset.confirm !== '1') {
            btn.dataset.confirm = '1';
            btn.style.background = 'var(--red-soft)';
            btn.title = '再点一次确认删除';
            setTimeout(() => { btn.dataset.confirm = '0'; btn.style.background = ''; btn.title = '删除项目'; }, 2600);
            return;
          }
          await dbDeleteProject(p.id);
          ctx.projects = ctx.projects.filter((item) => item.id !== p.id);
          if (ctx.currentId === p.id) ctx.navigate('projects');
          ctx.refresh();
          ctx.toast('项目已删除');
        } }, icon('trash', 16)),
      ),
    );
    return card;
  });

  const grid = h('section', { class: 'project-grid' }, ...cards);
  if (!ctx.projects.length) {
    grid.append(h('div', { class: 'empty-state', style: 'grid-column:1/-1' }, h('div', { class: 'empty-icon' }, icon('projects', 26)), h('h3', null, '还没有评估项目'), h('p', null, '新建空白项目,或导入同事导出的 .json 项目包。'), createNewButton()));
  }

  return h('div', null, fileInput, hero,
    h('div', { class: 'page-head' },
      h('div', null, h('h2', { style: 'font-size:22px' }, '项目列表'), h('p', null, '两个内置测试项目可直接体验:临湖办公楼与带玻璃连廊的商场。项目数据保存在本机 IndexedDB。')),
      h('div', { class: 'head-actions' }, createImportButton(), createNewButton()),
    ),
    grid,
  );
}
