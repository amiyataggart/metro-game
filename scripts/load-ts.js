// Minimal TS loader for the CommonJS build scripts: transpile .ts on require so
// scripts can read the service tables / scope (src/app/(game)/london/*.ts).
// Same transpile settings as build-stations.js / report-service-diff.js.
const fs = require('fs')

// Always (re)registered: Node >= 22 ships its own .ts handler (type
// stripping, ESM resolution), which cannot load the extensionless imports in
// services/index.ts.
let registered = false
function registerTs() {
  if (registered) return
  registered = true
  const ts = require('typescript')
  require.extensions['.ts'] = (module, filename) => {
    const src = fs.readFileSync(filename, 'utf8')
    const out = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
      fileName: filename,
    }).outputText
    module._compile(out, filename)
  }
}

module.exports = { registerTs }
