# 羽鉴 BirdGlass Studio

浏览器端建筑玻璃防鸟撞评估系统。使用 TypeScript、原生 WebGPU Render/Compute Pipeline 与 IndexedDB,在浏览器内完成建筑场景渲染、Fresnel 反射计算、每块玻璃的鸟视角统计、风险热力图、改造前后对比和 HTML 评估报告导出。

## 启动

需要 Node.js 20.19+ 或 22.12+,推荐使用 Chrome/Edge 最新版并启用 WebGPU。

```bash
pnpm install
pnpm dev
```

默认地址为 `http://127.0.0.1:8765`。

生产构建:

```bash
pnpm build
pnpm preview
```

类型检查:

```bash
pnpm typecheck
```

类型检查:

```bash
pnpm typecheck
```

Fresnel 公式独立校验:

```bash
pnpm check:fresnel
```

## 已包含页面

1. **项目列表**:新建、复制、删除、JSON 导出/导入、自动保存状态。
2. **建筑与环境**:参数化盒体+幕墙生成、简单 OBJ 导入、对象/面标记为玻璃、看穿/转角/连廊标记、树木和水体简模布置、WebGPU 三维浏览与点选。
3. **玻璃库**:反射率 F0、透射率、等效 IOR、镀膜颜色、圆点/条纹/网格图案、间距、半径/线宽、颜色和单价。
4. **反射分析**:鸟飞高度、方向角、双向迁飞、观察距离和采样密度;GPU compute 统计 Fresnel、树影、天空、水面、看穿和图案份额;内置 GPU vs 精确公式校验。
5. **风险评估**:反射强度、绿化距离、楼层和看穿节点加权;南/北/东/西立面及转角连廊专项热力图;阈值可调。
6. **措施方案**:一键给高风险玻璃替换防鸟圆点/条纹/密格玻璃,重新计算 GPU after 风险,统计改造面板数、面积、造价和前后分数,导出 HTML 报告/CSV 清单。
7. **设置与校验**:默认参数、当前项目权重、测试项目重建、全部数据导出、IndexedDB 清理、WebGPU/Fresnel 诊断。

首次打开会自动写入两个测试项目:

- **临湖云启办公楼**:南侧湖面和乔木林,主方向由湖向楼。
- **星环里玻璃连廊商场**:东西两馆和二层透明玻璃连廊,南北乔木,强调看穿通道。

## Fresnel 硬要求

系统没有使用 Schlick 近似。WGSL 与 TypeScript 均实现非偏振介质的精确 Fresnel:

```text
R = (Rs² + Rp²) / 2
Rs = (n1 cosθi - n2 cosθt) / (n1 cosθi + n2 cosθt)
Rp = (n2 cosθi - n1 cosθt) / (n2 cosθi + n1 cosθt)
sin²θt = (n1 / n2)² (1 - cos²θi)
```

玻璃材料的 `reflectance` 作为法向反射率 F0,并反推等效 IOR:

```text
n = (1 + sqrt(F0)) / (1 - sqrt(F0))
```

设置页的「菲涅尔公式硬校验」会在 WebGPU compute shader 中计算 0°–90° 的结果,再与 TypeScript 公式逐点比较。通过标准是最大绝对误差 < 0.01(1 个百分点)且相对误差 < 1%。89° 时 n=1.52 的 R≈0.9047,89.99° 时 R≈0.9990,90° 极限为 1。

如果浏览器不支持 WebGPU,应用会明确显示 `CPU 参考模式`,并运行同一口径的 TypeScript 计算;不会把 CPU 结果显示成 GPU 结果。

## 数据与导入导出

IndexedDB 数据库:`bird-glass-studio-db`。

- `projects`:完整项目文档,包含建筑、玻璃面、树木、水体、设置和措施分配。
- `materials`:全局玻璃库。
- `kv`:应用设置。

项目导出为单个 JSON Bundle,只内嵌该项目引用的材料。导入时会生成新的项目/材料 ID 并重映射玻璃引用和改造分配,避免覆盖本机玻璃库。

评估报告导出为自包含 HTML,内含 SVG 风险立面图、Fresnel 公式、高风险明细和改造清单;CSV 清单带 UTF-8 BOM,Excel 可直接打开。

## OBJ 约定

OBJ 解析支持 `v/o/g/usemtl/f`,多边形面按扇形三角化。名称或材质名包含 `glass`、`glazing`、`window`、`curtain`、`玻璃`、`幕墙`、`窗` 时会自动标为玻璃;也可以导入后在对象列表中手动「标记为玻璃面」。

如果 OBJ 单位是厘米或毫米,在导入选项中选择对应换算。建议导出 OBJ 时把不同玻璃幕墙分组或使用独立 `usemtl Glass`。

## 目录结构

```text
src/
  core/       领域类型、数学、Fresnel、OBJ、种子项目、风险和报告
  gpu/        WebGPU 设备、场景渲染器、分析 compute shader
  ui/         无框架 DOM 页面、组件和 SVG 热力图
scripts/      Node 原生 TS 冒烟与 Fresnel 校验
```

## 验证记录

已运行:

```bash
pnpm check:fresnel
node --loader ./scripts/ts-extension-loader.mjs scripts/smoke-core.ts
node --loader ./scripts/ts-extension-loader.mjs scripts/smoke-report.ts
node --loader ./scripts/ts-extension-loader.mjs scripts/parse-ui.ts
```

这些脚本验证公式、两个测试项目的 CPU 同口径统计、改造降险、报告/SVG 生成和全部 UI 模块可解析。完整浏览器 WebGPU 结果请在支持 WebGPU 的 Chrome/Edge 中点击设置页校验。
