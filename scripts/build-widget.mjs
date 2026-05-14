import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const outdir = resolve("web/dist");

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["web/src/component.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: resolve(outdir, "avenue-ai-widget.js"),
  minify: true,
  sourcemap: false,
  logLevel: "info"
});

await mkdir(dirname(resolve(outdir, "avenue-ai-widget.css")), { recursive: true });

await build({
  entryPoints: ["web/src/styles.css"],
  bundle: true,
  outfile: resolve(outdir, "avenue-ai-widget.css"),
  minify: true,
  sourcemap: false,
  logLevel: "info"
});
