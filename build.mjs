import esbuild from "esbuild";
import { cpSync, existsSync, rmSync } from "node:fs";

await esbuild.build({
  entryPoints: ["src/mount.tsx"],
  bundle: true,
  format: "esm",
  outfile: "js/structure-flow.js",
  jsx: "automatic",
  alias: {
    three128: "three",
    "@designcodeio/threeui": "./src/index.ts",
    "@designcodeio/threeui/style.css": "./src/shaders/threeui.css",
  },
  loader: { ".css": "css" },
  plugins: [
    {
      name: "external-missing-font",
      setup(build) {
        build.onResolve({ filter: /fragment-mono\.woff2$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
});

const outDir = "dist";
rmSync(outDir, { recursive: true, force: true });
for (const path of ["index.html", "css", "js", "fonts", "src/shaders/threeui.css"]) {
  if (existsSync(path)) cpSync(path, `${outDir}/${path}`, { recursive: true });
}
