export const ANALYSIS_WGSL = /* wgsl */ `
struct GlassIn {
  center: vec3f,
  area: f32,
  normal: vec3f,
  width: f32,
  params: vec4f,
  ids: vec4f,
};

struct MaterialIn {
  props: vec4f,
  pattern: vec4f,
  patternExtra: vec4f,
  color: vec4f,
};

struct TreeIn {
  sphere: vec4f,
  color: vec4f,
};

struct WaterIn {
  rect: vec4f,
  color: vec4f,
};

struct Settings {
  a: vec4f,
  weights: vec4f,
  risk: vec4f,
  extra: vec4f,
};

struct GlassOut {
  fresnel: vec4f,
  sumA: vec4f,
  sumB: vec4f,
  geo: vec4f,
  riskOut: vec4f,
  riskExtra: vec4f,
  counts: vec4f,
  reserved: vec4f,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var<storage, read> glasses: array<GlassIn>;
@group(0) @binding(2) var<storage, read> materials: array<MaterialIn>;
@group(0) @binding(3) var<storage, read> trees: array<TreeIn>;
@group(0) @binding(4) var<storage, read> waters: array<WaterIn>;
@group(0) @binding(5) var<storage, read_write> outputs: array<GlassOut>;

struct Raw {
  total: f32,
  fsum: f32,
  fmax: f32,
  tree: f32,
  sky: f32,
  water: f32,
  glass: f32,
  through: f32,
  marker: f32,
};

fn hash11(n: f32) -> f32 {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453123);
}

fn angle_at(i: u32) -> f32 {
  if (i == 0u) { return -70.0; }
  if (i == 1u) { return -45.0; }
  if (i == 2u) { return -22.0; }
  if (i == 3u) { return 0.0; }
  if (i == 4u) { return 22.0; }
  if (i == 5u) { return 45.0; }
  if (i == 6u) { return 70.0; }
  return 82.0;
}

fn fresnel_exact(cos_i: f32, n1: f32, n2: f32) -> f32 {
  let c = clamp(abs(cos_i), 0.0, 1.0);
  let ratio = n1 / n2;
  let sin2_t = ratio * ratio * (1.0 - c * c);
  if (sin2_t >= 1.0) { return 1.0; }
  let cos_t = sqrt(max(0.0, 1.0 - sin2_t));
  let rs = (n1 * c - n2 * cos_t) / (n1 * c + n2 * cos_t);
  let rp = (n2 * c - n1 * cos_t) / (n2 * c + n1 * cos_t);
  return clamp((rs * rs + rp * rp) * 0.5, 0.0, 1.0);
}

fn pattern_mask(mat: MaterialIn, lx: f32, ly: f32) -> bool {
  let kind = mat.pattern.x;
  if (kind < 0.5) { return false; }
  let sx = max(mat.pattern.y, 0.005);
  let sy = max(mat.pattern.z, 0.005);
  let marker_size = mat.pattern.w;
  let dx = lx - round(lx / sx) * sx;
  let dy = ly - round(ly / sy) * sy;
  if (kind < 1.5) {
    return dx * dx + dy * dy <= marker_size * marker_size;
  }
  if (kind < 2.5) {
    return abs(dy) <= marker_size * 0.5;
  }
  if (kind < 3.5) {
    return abs(dx) <= marker_size * 0.5;
  }
  return abs(dx) <= marker_size * 0.5 || abs(dy) <= marker_size * 0.5;
}

fn hit_tree(origin: vec3f, direction: vec3f) -> bool {
  let count = u32(settings.extra.x);
  for (var i = 0u; i < count; i = i + 1u) {
    let sphere = trees[i].sphere;
    let oc = origin - sphere.xyz;
    let b = dot(oc, direction);
    let cc = dot(oc, oc) - sphere.w * sphere.w;
    let discriminant = b * b - cc;
    if (discriminant <= 0.0) { continue; }
    var t = -b - sqrt(discriminant);
    if (t < 0.05) { t = -b + sqrt(discriminant); }
    if (t > 0.05) { return true; }
  }
  return false;
}

fn hit_water(origin: vec3f, direction: vec3f) -> bool {
  if (direction.y >= -0.0001) { return false; }
  let count = u32(settings.extra.y);
  for (var i = 0u; i < count; i = i + 1u) {
    let rect = waters[i].rect;
    let t = (0.025 - origin.y) / direction.y;
    if (t <= 0.05) { continue; }
    let x = origin.x + direction.x * t;
    let z = origin.z + direction.z * t;
    if (abs(x - rect.x) <= rect.z * 0.5 && abs(z - rect.y) <= rect.w * 0.5) { return true; }
  }
  return false;
}

fn sample_glass(g: GlassIn, mat: MaterialIn, glass_index: u32, replacement: f32) -> Raw {
  var raw: Raw;
  raw.total = 0.0; raw.fsum = 0.0; raw.fmax = 0.0;
  raw.tree = 0.0; raw.sky = 0.0; raw.water = 0.0;
  raw.glass = 0.0; raw.through = 0.0; raw.marker = 0.0;

  let n = normalize(g.normal);
  var tangent = cross(vec3f(0.0, 1.0, 0.0), n);
  if (length(tangent) < 0.01) { tangent = vec3f(1.0, 0.0, 0.0); } else { tangent = normalize(tangent); }

  let direction_rad = settings.a.y;
  let heading = vec3f(sin(direction_rad), 0.0, -cos(direction_rad));
  let bidirectional = settings.extra.z > 0.5;
  let bird_height = settings.a.x;
  let view_distance = settings.extra.w;
  let sample_count = u32(settings.a.w);
  let ny = max(1u, sample_count / 32u);

  var sample_seed = f32(glass_index) * 101.0 + replacement * 17.0;
  for (var iy = 0u; iy < ny; iy = iy + 1u) {
    for (var ix = 0u; ix < 4u; ix = ix + 1u) {
      let u = (f32(ix) + 0.5) / 4.0 - 0.5;
      let v = (f32(iy) + 0.5) / f32(ny) - 0.5;
      let p = g.center + tangent * (u * g.width) + vec3f(0.0, v * g.params.x, 0.0);

      for (var ia = 0u; ia < 8u; ia = ia + 1u) {
        sample_seed = sample_seed + 1.0;
        let alpha = radians(angle_at(ia));
        let ca = cos(alpha);
        let sa = sin(alpha);
        let approach = normalize(-n * ca + tangent * sa);
        let alignment_raw = dot(vec3f(approach.x, 0.0, approach.z), heading);
        let alignment = select(max(alignment_raw, 0.0), abs(alignment_raw), bidirectional);
        let direction_weight = 0.22 + 0.78 * pow(clamp(alignment, 0.0, 1.0), 1.7);
        let distance = max(2.0, view_distance * (0.68 + hash11(sample_seed) * 0.64));
        var eye = p - approach * distance;
        eye.y = bird_height;
        let view_vector = p - eye;
        let view_length = length(view_vector);
        if (view_length < 0.001) { continue; }
        let view = view_vector / view_length;
        let cos_i = clamp(-dot(view, n), 0.0, 1.0);
        if (cos_i < 0.015) { continue; }

        raw.total = raw.total + direction_weight;
        let local_x = u * g.width;
        let local_y = v * g.params.x;
        if (pattern_mask(mat, local_x, local_y)) {
          raw.marker = raw.marker + direction_weight;
          continue;
        }

        let fresnel = fresnel_exact(cos_i, 1.0, max(mat.props.z, 1.01));
        raw.fsum = raw.fsum + fresnel * direction_weight;
        raw.fmax = max(raw.fmax, fresnel);

        let reflected = reflect(view, n);
        let origin = p + n * 0.04;
        if (hit_tree(origin, reflected)) {
          raw.tree = raw.tree + fresnel * direction_weight;
        } else if (hit_water(origin, reflected)) {
          raw.water = raw.water + fresnel * direction_weight;
        } else {
          raw.sky = raw.sky + fresnel * direction_weight;
        }

        let transmittance = clamp(mat.props.y, 0.0, 0.96);
        var through = (1.0 - fresnel) * transmittance;
        if (g.params.w > 0.5) { through = max(through, (1.0 - fresnel) * 0.82); }
        raw.through = raw.through + through * direction_weight;
        raw.glass = raw.glass + max(0.0, 1.0 - fresnel - through) * direction_weight;
      }
    }
  }
  return raw;
}

fn nearest_tree(g: GlassIn) -> f32 {
  let count = u32(settings.extra.x);
  var best = 60.0;
  for (var i = 0u; i < count; i = i + 1u) {
    let t = trees[i].sphere;
    let dx = g.center.x - t.x;
    let dz = g.center.z - t.z;
    let horizontal = sqrt(dx * dx + dz * dz);
    let envelope = max(0.6, horizontal - t.w * 0.75);
    best = min(best, envelope);
  }
  return best;
}

fn risk_score(raw: Raw, nearest: f32, g: GlassIn, deterrence: f32) -> f32 {
  let w = max(raw.total, 0.000001);
  let avg_f = raw.fsum / w;
  let tree_share = raw.tree / w;
  let sky_share = raw.sky / w;
  let water_share = raw.water / w;
  let through_share = raw.through / w;
  let habitat = clamp(tree_share * 1.8 + sky_share * 0.75 + water_share * 0.9, 0.0, 1.0);
  let reflection_intensity = clamp(0.3 * avg_f + 0.7 * habitat, 0.0, 1.0);
  let reflection = settings.weights.x * reflection_intensity;
  let green_factor = exp(-max(0.0, nearest - 2.0) / max(4.0, settings.risk.x * 0.5));
  let green = settings.weights.y * green_factor;
  let floor_value = 1.0 / (1.0 + 0.42 * max(0.0, g.params.z - 1.0));
  let floor_score = settings.weights.z * floor_value;
  var see_factor = clamp(through_share * 0.45, 0.0, 0.35);
  if (g.params.w > 0.5) { see_factor = 1.0; }
  let see_score = settings.weights.w * see_factor;
  let base = reflection + green + floor_score + see_score;
  return clamp(base * (1.0 - clamp(deterrence, 0.0, 0.95)), 0.0, 100.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let index = global_id.x;
  let glass_count = u32(settings.a.z);
  if (index >= glass_count) { return; }

  let g = glasses[index];
  let current_index = u32(g.ids.x);
  let current_material = materials[current_index];
  let current = sample_glass(g, current_material, index, 0.0);
  let nearest = nearest_tree(g);
  let det_before = current_material.patternExtra.x;
  let risk_before = risk_score(current, nearest, g, det_before);

  var risk_after = risk_before;
  var det_after = det_before;
  let replacement_id = g.ids.y;
  if (replacement_id >= 0.0) {
    let replacement_index = u32(replacement_id);
    if (replacement_index != current_index) {
      let replacement_material = materials[replacement_index];
      let after = sample_glass(g, replacement_material, index, 1.0);
      det_after = replacement_material.patternExtra.x;
      risk_after = risk_score(after, nearest, g, det_after);
    }
  }

  let w = max(current.total, 0.000001);
  let avg_f = current.fsum / w;
  let tree_share = current.tree / w;
  let sky_share = current.sky / w;
  let water_share = current.water / w;
  let habitat = clamp(tree_share * 1.8 + sky_share * 0.75 + water_share * 0.9, 0.0, 1.0);
  let reflection_intensity = clamp(0.3 * avg_f + 0.7 * habitat, 0.0, 1.0);
  let green_factor = exp(-max(0.0, nearest - 2.0) / max(4.0, settings.risk.x * 0.5));
  let floor_factor = 1.0 / (1.0 + 0.42 * max(0.0, g.params.z - 1.0));

  outputs[index].fresnel = vec4f(current.fsum, current.fmax, avg_f, current.total);
  outputs[index].sumA = vec4f(current.tree, current.sky, current.water, current.glass);
  outputs[index].sumB = vec4f(current.through, current.marker, 0.0, 0.0);
  outputs[index].geo = vec4f(nearest, green_factor, floor_factor, g.params.w);
  outputs[index].riskOut = vec4f(risk_before, risk_after, reflection_intensity, det_before);
  outputs[index].riskExtra = vec4f(det_after, g.area, 0.0, 0.0);
  outputs[index].counts = vec4f(settings.a.w, f32(index), 0.0, 0.0);
  outputs[index].reserved = vec4f(0.0, 0.0, 0.0, 0.0);
}
`;

export const FRESNEL_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> cosines: array<f32>;
@group(0) @binding(1) var<storage, read_write> results: array<f32>;

fn fresnel_exact(cos_i: f32, n1: f32, n2: f32) -> f32 {
  let c = clamp(abs(cos_i), 0.0, 1.0);
  let ratio = n1 / n2;
  let sin2_t = ratio * ratio * (1.0 - c * c);
  if (sin2_t >= 1.0) { return 1.0; }
  let cos_t = sqrt(max(0.0, 1.0 - sin2_t));
  let rs = (n1 * c - n2 * cos_t) / (n1 * c + n2 * cos_t);
  let rp = (n2 * c - n1 * cos_t) / (n2 * c + n1 * cos_t);
  return clamp((rs * rs + rp * rp) * 0.5, 0.0, 1.0);
}

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let i = global_id.x;
  if (i >= arrayLength(&cosines)) { return; }
  results[i] = fresnel_exact(cosines[i], 1.0, 1.52);
}
`;
