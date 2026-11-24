import type { AppSettings, GlassMaterial, Project } from '../types';
import { DEFAULT_APP_SETTINGS, createDefaultMaterials } from './materials';
import { createMallProject, createOfficeProject } from './seed';

const DB_NAME = 'bird-glass-studio-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('materials')) db.createObjectStore('materials', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export const dbGetAllProjects = () => tx<Project[]>('projects', 'readonly', (s) => s.getAll() as IDBRequest<Project[]>);
export const dbPutProject = (p: Project) => tx<IDBValidKey>('projects', 'readwrite', (s) => s.put(p));
export const dbDeleteProject = (id: string) => tx<undefined>('projects', 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);

export const dbGetAllMaterials = () => tx<GlassMaterial[]>('materials', 'readonly', (s) => s.getAll() as IDBRequest<GlassMaterial[]>);
export const dbPutMaterial = (m: GlassMaterial) => tx<IDBValidKey>('materials', 'readwrite', (s) => s.put(m));
export const dbDeleteMaterial = (id: string) => tx<undefined>('materials', 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);

export async function dbGetAppSettings(): Promise<AppSettings> {
  const value = await tx<AppSettings | undefined>('kv', 'readonly', (s) => s.get('app') as IDBRequest<AppSettings | undefined>);
  return value ?? { ...DEFAULT_APP_SETTINGS };
}

export const dbPutAppSettings = (settings: AppSettings) => tx<IDBValidKey>('kv', 'readwrite', (s) => s.put(settings));

export async function ensureSeeded(): Promise<{ projects: Project[]; materials: GlassMaterial[]; settings: AppSettings }> {
  let materials = await dbGetAllMaterials();
  if (!materials.length) {
    materials = createDefaultMaterials();
    await Promise.all(materials.map((m) => dbPutMaterial(m)));
  }

  let projects = await dbGetAllProjects();
  if (!projects.length) {
    projects = [createOfficeProject(), createMallProject()];
    await Promise.all(projects.map((p) => dbPutProject(p)));
  }

  const settings = await dbGetAppSettings();
  return { projects, materials, settings };
}

export async function reseedTestProjects(): Promise<Project[]> {
  const office = createOfficeProject();
  const mall = createMallProject();
  const existing = await dbGetAllProjects();
  const testNames = new Set(['临湖云启办公楼', '星环里玻璃连廊商场']);
  await Promise.all(existing.filter((p) => testNames.has(p.name)).map((p) => dbDeleteProject(p.id)));
  await Promise.all([dbPutProject(office), dbPutProject(mall)]);
  return dbGetAllProjects();
}
