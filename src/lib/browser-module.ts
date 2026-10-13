import ts from 'typescript'

/** Serve a shared src/lib TypeScript module to the /admin editor as a plain ES module. */
export function browserModuleResponse(source: string) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  })
  return new Response(outputText, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
  })
}
