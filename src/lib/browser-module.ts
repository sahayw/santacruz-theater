import ts from 'typescript'

/**
 * Serve a shared src/lib TypeScript module to the /admin editor as a plain ES module.
 * Relative imports of sibling modules (`./organizers.ts`) become `./organizers.js`,
 * so each imported module needs its own src/pages/admin/<name>.js.ts route.
 */
export function browserModuleResponse(source: string) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  })
  const js = outputText.replace(/(from\s+['"]\.\/[\w-]+)\.ts(['"])/g, '$1.js$2')
  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
  })
}
