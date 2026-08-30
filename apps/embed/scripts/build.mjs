// Bundles src/v1.ts into a single dependency-free IIFE, ES2018, minified.
// Run via `pnpm --filter @r360/embed build`. Pass --watch for dev rebuilds.
import { build, context } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [path.join(root, "src/v1.ts")],
  outfile: path.join(root, "dist/v1.js"),
  bundle: true,
  format: "iife",
  target: ["es2018"],
  minify: true,
  legalComments: "none",
  sourcemap: true,
  logLevel: "info",
};

const BUDGET_KB = 6;

function reportSize() {
  const bytes = readFileSync(options.outfile);
  const gzipped = gzipSync(bytes);
  const kb = (gzipped.length / 1024).toFixed(2);
  const rawKb = (bytes.length / 1024).toFixed(2);
  const overBudget = gzipped.length / 1024 > BUDGET_KB;
  console.log(`\ndist/v1.js: ${rawKb} KB raw, ${kb} KB gzip (budget: ${BUDGET_KB} KB gzip)`);
  if (overBudget) {
    console.warn(`WARNING: bundle exceeds the ${BUDGET_KB} KB gzip budget.`);
  }
}

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [
      {
        name: "size-report",
        setup(b) {
          b.onEnd(() => reportSize());
        },
      },
    ],
  });
  await ctx.watch();
  console.log("watching src/v1.ts for changes...");
} else {
  await build(options);
  reportSize();
}
