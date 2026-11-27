# 羽鉴 BirdGlass · 浏览器建筑玻璃防鸟撞评估系统

TypeScript + WebGPU 的纯前端应用：三维渲染、逐鸟视线的菲涅尔反射计算与统计归约都在 GPU 计算管线上完成；项目、玻璃库、设置保存在浏览器 IndexedDB，可导出单个项目文件分享，也可导出带风险立面图的 HTML 评估报告（浏览器内打印为 PDF）。

## 启动

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 类型检查 + 生产构建到 dist/
npm test           # vitest：菲涅尔公式与分析引擎测试
```

推荐使用最新版 Chrome / Edge（WebGPU）。无 WebGPU 时自动降级为 Canvas2D 渲染 + CPU 参考计算引擎，功能与数值口径保持一致。

## 页面

| 路由 | 页面 | 能力 |
| --- | --- | --- |
| `#/` | 项目列表 | 新建 / 复制 / 删除、防抖自动保存到 IndexedDB、`.birdglass.json` 导出与导入 |
| `#/building` | 建筑与环境 | 参数化盒体立面、OBJ 导入并按 `o/g` 分组把指定子网格标为玻璃、布置乔木与矩形水体、单击玻璃标注转角 / 连廊可看穿 / 楼层 / 绿化距离覆盖 |
| `#/glass` | 玻璃库 | 反射率、透射率、镀膜色、由 R₀ 反解折射率 n；防鸟撞点阵 / 竖条纹，点径、条宽与 x/y 间距可调，实时样块与菲涅尔曲线 |
| `#/reflection` | 反射分析 | 按鸟的飞行高度层、主导方位与扫掠角生成「采样点 × 高度 × 方向」视线，GPU 计算每块玻璃的天空 / 树 / 水 / 建筑地面反射占比、平均与最大菲涅尔 R、可看穿度 |
| `#/risk` | 风险评估 | 反射强度 + 绿化距离 + 楼层曲线 + 看穿 / 连廊 + 转角加权，0–100 分四级；WebGPU 立面热力图、正交 SVG 立面热力图、权重可调、风险排名 |
| `#/measures` | 措施方案 | 批量 / 逐块替换防鸟玻璃，GPU 复算改造后风险，前后立面对比、改造面积与风险下降统计，生成 / 打印 / 下载报告 |
| `#/settings` | 设置与自检 | 风险阈值、报告机构、自动保存；**GPU vs 解析菲涅尔公式全角度误差自检**；数据备份 / 重置 |

首次启动会写入两个测试项目：**云栖湖临湖办公楼**（10 层、220 块玻璃、临湖与滨水乔木）与**星环广场玻璃连廊商场**（双体量 + 二层全玻璃连廊，连廊与入口可看穿）。

## 菲涅尔正确性（硬指标）

- 唯一数学实现：[`src/core/fresnel.ts`](src/core/fresnel.ts)，采用严格电介质菲涅尔方程（非 Schlick 近似），n₁=1：
  - `Rs = ((n1 cosθi − n2 cosθt)/(n1 cosθi + n2 cosθt))²`
  - `Rp = ((n2 cosθi − n1 cosθt)/(n2 cosθi + n1 cosθt))²`
  - `R = (Rs + Rp)/2`，斯涅尔定律求 θt。
- WGSL 端 [`src/gpu/computeShaders.ts`](src/gpu/computeShaders.ts) 的 `fresnelDielectric()` 与 CPU 逐行对应；三维玻璃着色器也调用同一公式混合天空 / 环境颜色，因此反射随入射角变化，掠射角 `θ→90°` 时 `R→1`。
- `npm test`：CPU 实现与独立教科书三角形式在 1801 个角度上的最大相对误差约 **1e-13%**；并验证法向 R(n=1.5)=4%、布儒斯特角 Rp=0、单调不减、掠射≈1。
- 设置页「GPU vs 公式误差自检」在 GPU 上对 361 个入射角求值并读回比较。RTX 3060 / Chromium 实测最大相对误差约 **3.6e-5%**（f32 精度级），远小于 1% 容差。
- GPU 统计与 CPU 参考引擎对同一项目的逐面结果差异约 **1e-7**。

浏览器自动化钩子：`window.__BIRD_GLASS__` 暴露 `fresnelDeg(deg, ior)`、`fresnelCos(cos, ior)`、`gpuSelfTest(tolPct)`、`runBaseline(projectId)`、`runRetrofit(projectId)`、`store` 等，便于外部校验。

## 架构要点

```
src/core/      纯领域层：类型、菲涅尔、几何、OBJ 解析、采样/光线求交/CPU 参考引擎、
               风险评分、种子项目、IndexedDB、zustand store、报告 HTML、立面布局
src/gpu/       WebGPU 设备、WGSL 计算着色器（逐样本分析 + workgroup 归约 + 菲涅尔自检）、
               WebGPU 三维渲染器、Canvas2D 降级渲染器、GPU 分析封装
src/components/ Viewport 与通用 UI / 图表
src/pages/     七个页面
tests/         vitest：菲涅尔硬指标 + 引擎物理趋势
```

GPU 计算分两个 pass：`analyzeMain`（每条鸟视线：菲涅尔 + 反射光线对树冠球 / 水面 / 建筑 AABB / 地面求交 + 看穿度）与 `reduceMain`（每块玻璃一个 workgroup 归约出平均 R、最大 R、各类反射占比、栖息地反射强度与看穿度），随后在同一评分模型中得到风险分。
