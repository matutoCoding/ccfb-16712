/**
 * WGSL 计算着色器。菲涅尔与光线分类必须与 src/core/engine.ts、fresnel.ts 一致。
 * 分类编号：0 天空 1 树 2 水 3 建筑 4 地面。
 */

export const FRESNEL_WGSL = /* wgsl */ `
fn fresnelDielectric(cosIIn: f32, ior: f32) -> f32 {
  let cosI = clamp(cosIIn, 0.0, 1.0);
  let n1 = 1.0;
  let n2 = max(ior, 1.0001);
  // 完美掠射极限 R -> 1
  if (cosI <= 1e-7) { return 1.0; }
  let sinI2 = max(0.0, 1.0 - cosI * cosI);
  let sinT2 = (n1 * n1) / (n2 * n2) * sinI2;
  if (sinT2 > 1.0) { return 1.0; }
  let cosT = sqrt(max(0.0, 1.0 - sinT2));
  let rsA = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  let rpA = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
  let rs = rsA * rsA;
  let rp = rpA * rpA;
  return clamp((rs + rp) * 0.5, 0.0, 1.0);
}
`;

export const ANALYSIS_WGSL = /* wgsl */ `
struct Sample {
  pos: vec3<f32>, ior: f32,
  nrm: vec3<f32>, trans: f32,
  obs: vec3<f32>, seeFlag: f32,
  skipBox: i32, _p0: f32, _p1: f32, _p2: f32,
};
struct SampleResult {
  fresnel: f32,
  see: f32,
  habitat: f32,
  cls: u32,
};
struct Sphere { c: vec3<f32>, r: f32 };
struct BoxG { mn: vec3<f32>, _a: f32, mx: vec3<f32>, _b: f32 };
struct WaterG { cx: f32, y: f32, cz: f32, hw: f32, hd: f32, _a: f32, _b: f32, _c: f32 };
struct Params {
  sampleCount: u32, treeCount: u32, boxCount: u32, waterCount: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> samples: array<Sample>;
@group(0) @binding(2) var<storage, read_write> results: array<SampleResult>;
@group(0) @binding(3) var<storage, read> trees: array<Sphere>;
@group(0) @binding(4) var<storage, read> boxes: array<BoxG>;
@group(0) @binding(5) var<storage, read> waters: array<WaterG>;

const CLS_SKY: u32 = 0u;
const CLS_TREE: u32 = 1u;
const CLS_WATER: u32 = 2u;
const CLS_BUILDING: u32 = 3u;
const CLS_GROUND: u32 = 4u;

${FRESNEL_WGSL}

fn raySphere(o: vec3<f32>, d: vec3<f32>, c: vec3<f32>, r: f32) -> f32 {
  let oe = o - c;
  let b = dot(oe, d);
  let cc = dot(oe, oe) - r * r;
  let disc = b * b - cc;
  if (disc < 0.0) { return 1e30; }
  let sq = sqrt(disc);
  var t = -b - sq;
  if (t < 1e-4) { t = -b + sq; }
  if (t > 1e-4) { return t; }
  return 1e30;
}

fn rayBox(o: vec3<f32>, d: vec3<f32>, mn: vec3<f32>, mx: vec3<f32>) -> f32 {
  var tmin = -1e30;
  var tmax = 1e30;
  // X
  if (abs(d.x) < 1e-8) {
    if (o.x < mn.x || o.x > mx.x) { return 1e30; }
  } else {
    var t1 = (mn.x - o.x) / d.x;
    var t2 = (mx.x - o.x) / d.x;
    if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
    tmin = max(tmin, t1); tmax = min(tmax, t2);
    if (tmin > tmax) { return 1e30; }
  }
  // Y
  if (abs(d.y) < 1e-8) {
    if (o.y < mn.y || o.y > mx.y) { return 1e30; }
  } else {
    var t1 = (mn.y - o.y) / d.y;
    var t2 = (mx.y - o.y) / d.y;
    if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
    tmin = max(tmin, t1); tmax = min(tmax, t2);
    if (tmin > tmax) { return 1e30; }
  }
  // Z
  if (abs(d.z) < 1e-8) {
    if (o.z < mn.z || o.z > mx.z) { return 1e30; }
  } else {
    var t1 = (mn.z - o.z) / d.z;
    var t2 = (mx.z - o.z) / d.z;
    if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
    tmin = max(tmin, t1); tmax = min(tmax, t2);
    if (tmin > tmax) { return 1e30; }
  }
  if (tmin > 1e-4) { return tmin; }
  if (tmax > 1e-4) { return tmax; }
  return 1e30;
}

fn rayWater(o: vec3<f32>, d: vec3<f32>, w: WaterG) -> f32 {
  if (abs(d.y) < 1e-8) { return 1e30; }
  let t = (w.y - o.y) / d.y;
  if (t < 1e-4) { return 1e30; }
  let x = o.x + d.x * t;
  let z = o.z + d.z * t;
  if (abs(x - w.cx) <= w.hw && abs(z - w.cz) <= w.hd) { return t; }
  return 1e30;
}

@compute @workgroup_size(64)
fn analyzeMain(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.sampleCount) { return; }
  let sm = samples[i];

  var vi = sm.obs - sm.pos;
  vi = vi / max(length(vi), 1e-6);
  var n = sm.nrm;
  var cosI = dot(vi, n);
  if (cosI < 0.0) {
    cosI = -cosI;
    n = -n;
  }
  cosI = clamp(cosI, 0.0, 1.0);
  let fr = fresnelDielectric(cosI, sm.ior);

  // r = 2 cosI n - vi
  let rdir = 2.0 * cosI * n - vi;
  let ro = sm.pos + n * 0.08;

  var bestT = 1e30;
  var cls = CLS_SKY;

  for (var k: u32 = 0u; k < params.treeCount; k = k + 1u) {
    let tt = raySphere(ro, rdir, trees[k].c, trees[k].r);
    if (tt < bestT) { bestT = tt; cls = CLS_TREE; }
  }
  for (var k: u32 = 0u; k < params.waterCount; k = k + 1u) {
    let tt = rayWater(ro, rdir, waters[k]);
    if (tt < bestT) { bestT = tt; cls = CLS_WATER; }
  }
  for (var k: u32 = 0u; k < params.boxCount; k = k + 1u) {
    if (i32(k) == sm.skipBox) { continue; }
    let tt = rayBox(ro, rdir, boxes[k].mn, boxes[k].mx);
    if (tt < bestT) { bestT = tt; cls = CLS_BUILDING; }
  }
  if (rdir.y < -1e-8) {
    let tt = -ro.y / rdir.y;
    if (tt > 1e-4 && tt < bestT) { bestT = tt; cls = CLS_GROUND; }
  }

  var habitat = 0.0;
  if (cls == CLS_SKY || cls == CLS_TREE || cls == CLS_WATER) { habitat = 1.0; }

  let transmitted = (1.0 - fr) * sm.trans;
  var see = 0.18 * transmitted;
  if (sm.seeFlag > 0.5) {
    see = max(0.82, 0.55 + 0.4 * transmitted);
  }

  results[i] = SampleResult(fr, see, habitat, cls);
}
`;

export const REDUCE_WGSL = /* wgsl */ `
struct SampleResult {
  fresnel: f32,
  see: f32,
  habitat: f32,
  cls: u32,
};
struct Range { start: u32, count: u32, _a: u32, _b: u32 };

@group(0) @binding(0) var<storage, read> results: array<SampleResult>;
@group(0) @binding(1) var<storage, read> ranges: array<Range>;
@group(0) @binding(2) var<storage, read_write> stats: array<vec4<f32>>;

const WG: u32 = 128u;
var<workgroup> wSumF: array<f32, 128>;
var<workgroup> wMaxF: array<f32, 128>;
var<workgroup> wHabInt: array<f32, 128>;
var<workgroup> wHab: array<f32, 128>;
var<workgroup> wTree: array<f32, 128>;
var<workgroup> wSky: array<f32, 128>;
var<workgroup> wWater: array<f32, 128>;
var<workgroup> wSee: array<f32, 128>;

@compute @workgroup_size(128)
fn reduceMain(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let ti = lid.x;
  let rg = ranges[wid.x];
  var sumF = 0.0;
  var maxF = 0.0;
  var habInt = 0.0;
  var hab = 0.0;
  var tree = 0.0;
  var sky = 0.0;
  var water = 0.0;
  var see = 0.0;
  var n: u32 = 0u;

  var j = ti;
  while (j < rg.count) {
    let r = results[rg.start + j];
    sumF = sumF + r.fresnel;
    maxF = max(maxF, r.fresnel);
    habInt = habInt + r.fresnel * r.habitat;
    hab = hab + r.habitat;
    see = see + r.see;
    if (r.cls == 1u) { tree = tree + 1.0; }
    else if (r.cls == 0u) { sky = sky + 1.0; }
    else if (r.cls == 2u) { water = water + 1.0; }
    n = n + 1u;
    j = j + WG;
  }

  wSumF[ti] = sumF; wMaxF[ti] = maxF; wHabInt[ti] = habInt; wHab[ti] = hab;
  wTree[ti] = tree; wSky[ti] = sky; wWater[ti] = water; wSee[ti] = see;
  workgroupBarrier();

  var offset: u32 = WG / 2u;
  while (offset > 0u) {
    if (ti < offset) {
      wSumF[ti] = wSumF[ti] + wSumF[ti + offset];
      wMaxF[ti] = max(wMaxF[ti], wMaxF[ti + offset]);
      wHabInt[ti] = wHabInt[ti] + wHabInt[ti + offset];
      wHab[ti] = wHab[ti] + wHab[ti + offset];
      wTree[ti] = wTree[ti] + wTree[ti + offset];
      wSky[ti] = wSky[ti] + wSky[ti + offset];
      wWater[ti] = wWater[ti] + wWater[ti + offset];
      wSee[ti] = wSee[ti] + wSee[ti + offset];
    }
    workgroupBarrier();
    offset = offset / 2u;
  }

  if (ti == 0u) {
    let cnt = max(f32(rg.count), 1.0);
    let base = wid.x * 4u;
    stats[base + 0u] = vec4<f32>(f32(rg.count), wSumF[0] / cnt, wMaxF[0], wHab[0] / cnt);
    stats[base + 1u] = vec4<f32>(wTree[0] / cnt, wSky[0] / cnt, wWater[0] / cnt, wSee[0] / cnt);
    stats[base + 2u] = vec4<f32>(clamp(wHabInt[0] / cnt, 0.0, 1.0), 0.0, 0.0, 0.0);
    stats[base + 3u] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
}
`;

export const SELFTEST_WGSL = /* wgsl */ `
struct P { count: u32, _a: u32, _b: u32, _c: u32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> cosines: array<f32>;
@group(0) @binding(2) var<storage, read_write> outR: array<f32>;

${FRESNEL_WGSL}

@compute @workgroup_size(64)
fn selfTestMain(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= p.count) { return; }
  // 自检固定 n=1.52，与 UI/测试中的参考一致
  outR[i] = fresnelDielectric(cosines[i], 1.52);
}
`;
