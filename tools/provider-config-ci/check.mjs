import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Run only in Actions. Keep individual exit codes even when collecting a failing baseline.
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Provider checks run in GitHub Actions only");
const output = resolve(process.argv[2] ?? "provider-ci");
mkdirSync(output, { recursive: true });
const commands = [
  ["root-types", ["typecheck"]],
  ["root-lint", ["lint"]],
  ["core-types", ["--filter", "@my-brain/core", "typecheck"]],
  ["core-boundaries", ["--filter", "@my-brain/core", "lint:boundaries"]],
  ["mobile-types", ["--filter", "@my-brain/mobile", "typecheck"]],
  ["mobile-core-tests", ["exec", "vitest", "run", "packages/core", "apps/mobile", "--reporter=json", `--outputFile=${output}/mobile-core-tests.json`]],
  ["full-tests", ["exec", "vitest", "run", "--reporter=json", `--outputFile=${output}/full-tests.json`]],
];
const results = commands.map(([name, args]) => {
  process.stdout.write(`Running ${name}\n`);
  const result = spawnSync("pnpm", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, env: process.env });
  writeFileSync(`${output}/${name}.log`, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  process.stdout.write(`${name}: exit ${result.status ?? 1}\n`);
  return { name, exitCode: result.status ?? 1 };
});
writeFileSync(`${output}/commands.json`, JSON.stringify({ sha: process.env.GITHUB_SHA, results }, null, 2));
// The summary job enforces every required exit code and compares full tests against the baseline.
