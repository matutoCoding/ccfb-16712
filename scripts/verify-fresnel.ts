// 独立校验精确 Fresnel 公式。Node 24 可直接执行:node scripts/verify-fresnel.ts
function fresnel(cosTheta: number, n1 = 1, n2 = 1.52): number {
  const c = Math.min(1, Math.max(0, Math.abs(cosTheta)));
  const sin2T = (n1 / n2) ** 2 * (1 - c * c);
  if (sin2T >= 1) return 1;
  const cosT = Math.sqrt(1 - sin2T);
  const rs = (n1 * c - n2 * cosT) / (n1 * c + n2 * cosT);
  const rp = (n2 * c - n1 * cosT) / (n2 * c + n1 * cosT);
  return Math.min(1, Math.max(0, (rs * rs + rp * rp) / 2));
}

const cases = [0, 5, 15, 30, 45, 60, 70, 80, 85, 89, 90];
let maxErr = 0;
for (const deg of cases) {
  const rad = (deg * Math.PI) / 180;
  const value = fresnel(Math.cos(rad));
  const c = Math.cos(rad);
  const ct = Math.sqrt(1 - (1 / 1.52) ** 2 * Math.sin(rad) ** 2);
  const rs = (c - 1.52 * ct) / (c + 1.52 * ct);
  const rp = (1.52 * c - ct) / (1.52 * c + ct);
  const expected = (rs ** 2 + rp ** 2) / 2;
  const err = Math.abs(value - expected);
  maxErr = Math.max(maxErr, err);
  console.log(`${String(deg).padStart(2)}°  R=${value.toFixed(10)}  err=${err.toExponential(3)}`);
}

const normalExpected = ((1.52 - 1) / (1.52 + 1)) ** 2;
const normalErr = Math.abs(fresnel(1) - normalExpected);
const grazing89 = fresnel(Math.cos((89 * Math.PI) / 180));
const grazingNearLimit = fresnel(Math.cos((89.99 * Math.PI) / 180));
if (normalErr > 1e-12) throw new Error(`normal Fresnel mismatch: ${normalErr}`);
if (grazing89 < 0.9) throw new Error(`89 degree Fresnel should be above 0.9: ${grazing89}`);
if (grazingNearLimit < 0.99) throw new Error(`near-grazing Fresnel is not close enough to 1: ${grazingNearLimit}`);
if (maxErr >= 0.01) throw new Error(`Fresnel error exceeds 1%: ${maxErr}`);
console.log(`PASS: max formula error ${maxErr.toExponential(3)}, 89° R=${grazing89.toFixed(8)}, 89.99° R=${grazingNearLimit.toFixed(8)}`);
