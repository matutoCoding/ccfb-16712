import type { Vec3 } from '../types';

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  if (len < 1e-12) return [0, 1, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function azimuthVector(deg: number): Vec3 {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), 0, -Math.cos(r)];
}

export function rotateY(v: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

export function uid(prefix = 'id'): string {
  const rand = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function round(v: number, digits = 1): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

export function formatNumber(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDateTime(input: string | number | Date = new Date()): string {
  const d = new Date(input);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return [0.55, 0.68, 0.76];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function downloadBlob(content: Blob | string, filename: string, type = 'application/octet-stream') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function deterministicHash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
