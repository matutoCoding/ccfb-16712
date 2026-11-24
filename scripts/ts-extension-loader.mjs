export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.css')) {
    return { url: new URL('./empty-style.mjs', import.meta.url).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]s$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}
