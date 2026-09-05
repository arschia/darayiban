// Run the same Edge Function source under Node in CI. Only Deno's environment
// and test registration are adapted; auth, tool schemas and agent code are real.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const target = new URL("../work/assistant-tests/", import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ["core", "tools", "index", "assistant_test"]) {
  let source = await readFile(
    new URL(
      `../supabase/functions/financial-assistant/${name}.ts`,
      import.meta.url,
    ),
    "utf8",
  );
  source = source.replace(
    /npm:(@[^/]+\/[^@"']+|[^@/"']+)@[^/"']+(\/[^"']*)?/g,
    (_match, pkg, path) => pkg + (path ?? ""),
  );
  source = source.replace(/(\.\/[a-z_]+)\.ts/g, "$1.mjs");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  await writeFile(new URL(`${name}.mjs`, target), compiled);
}
globalThis.Deno = {
  test,
  env: {
    get: (name) => process.env[name],
    set: (name, value) => {
      process.env[name] = value;
    },
    delete: (name) => {
      delete process.env[name];
    },
  },
};
await import(new URL("assistant_test.mjs", target).href);
