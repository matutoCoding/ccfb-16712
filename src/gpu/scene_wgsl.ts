export const SCENE_WGSL = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4f,
  cameraPos: vec4f,
  options: vec4f,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<storage, read> treeSpheres: array<vec4f>;

struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) material: vec4f,
  @location(4) pattern: vec4f,
  @location(5) patternColor: vec3f,
};

struct VertexOut {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) material: vec4f,
  @location(4) pattern: vec4f,
  @location(5) patternColor: vec3f,
};

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  out.clipPosition = camera.viewProj * vec4f(input.position, 1.0);
  out.worldPos = input.position;
  out.normal = input.normal;
  out.color = input.color;
  out.material = input.material;
  out.pattern = input.pattern;
  out.patternColor = input.patternColor;
  return out;
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

fn ray_sphere(origin: vec3f, direction: vec3f, sphere: vec4f) -> bool {
  let center = sphere.xyz;
  let radius = sphere.w;
  let oc = origin - center;
  let b = dot(oc, direction);
  let cc = dot(oc, oc) - radius * radius;
  let discriminant = b * b - cc;
  if (discriminant <= 0.0) { return false; }
  let t = -b - sqrt(discriminant);
  return t > 0.08;
}

fn pattern_mask(kind: f32, spacing_x: f32, spacing_y: f32, marker_size: f32, p: vec3f, n: vec3f) -> bool {
  if (kind < 0.5) { return false; }
  var lx = p.x;
  if (abs(n.z) > abs(n.x)) { lx = p.x; } else { lx = p.z; }
  let ly = p.y;
  let dx = lx - round(lx / spacing_x) * spacing_x;
  let dy = ly - round(ly / spacing_y) * spacing_y;
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

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
  var N = normalize(input.normal);
  let V = normalize(camera.cameraPos.xyz - input.worldPos);
  if (dot(N, V) < 0.0) { N = -N; }

  if (input.material.x > 0.5) {
    let cos_theta = max(dot(N, V), 0.0);
    let f0 = input.material.y;
    let ior = max(input.material.w, 1.01);
    let fresnel = fresnel_exact(cos_theta, 1.0, ior);
    let reflected = reflect(-V, N);

    var environment = vec3f(0.82, 0.89, 0.94);
    let sky_height = clamp(reflected.y * 0.55 + 0.45, 0.0, 1.0);
    let horizon = vec3f(0.86, 0.91, 0.95);
    let zenith = vec3f(0.28, 0.53, 0.76);
    var sky = mix(horizon, zenith, pow(sky_height, 0.72));
    let sun_dir = normalize(vec3f(-0.38, 0.72, 0.52));
    sky += vec3f(1.0, 0.84, 0.52) * pow(max(dot(reflected, sun_dir), 0.0), 220.0) * 0.9;

    var hit_tree = false;
    for (var i: u32 = 0u; i < 48u; i = i + 1u) {
      if (i >= arrayLength(&treeSpheres)) { break; }
      if (ray_sphere(input.worldPos + N * 0.05, reflected, treeSpheres[i])) {
        hit_tree = true;
        break;
      }
    }

    if (hit_tree) {
      environment = vec3f(0.12, 0.34, 0.20) + vec3f(0.05, 0.10, 0.04) * max(reflected.y, 0.0);
    } else if (reflected.y < -0.02) {
      environment = mix(vec3f(0.55, 0.62, 0.60), vec3f(0.30, 0.45, 0.52), clamp(-reflected.y * 2.0, 0.0, 1.0));
    } else {
      environment = sky;
    }

    if (pattern_mask(input.pattern.x, max(input.pattern.y, 0.01), max(input.pattern.z, 0.01), input.pattern.w, input.worldPos, N)) {
      return vec4f(input.patternColor, 1.0);
    }

    let transmittance = clamp(input.material.z, 0.0, 0.96);
    let see_through_body = mix(input.color * 0.62, vec3f(0.70, 0.88, 0.96), transmittance);
    let floor_tint = 0.94 + 0.06 * sin(input.worldPos.y * 2.1);
    var color = mix(see_through_body * floor_tint, environment, fresnel);
    if (input.material.x > 1.5) {
      color = mix(color, vec3f(0.96, 0.62, 0.12), 0.38);
    }
    return vec4f(color, 1.0);
  }

  let light_dir = normalize(vec3f(-0.42, 0.82, 0.36));
  let diffuse = max(dot(N, light_dir), 0.0);
  let hemisphere = 0.22 + 0.18 * max(N.y, 0.0);
  var color = input.color * (hemisphere + 0.68 * diffuse);
  if (input.material.x < -0.5 || input.material.x > 1.5) {
    color = mix(color, vec3f(0.96, 0.62, 0.12), 0.45);
  }
  return vec4f(clamp(color, 0.0, 1.0), 1.0);
}
`;
