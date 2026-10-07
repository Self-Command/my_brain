import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const baseline = read("reports/baseline/full-tests.json");
const current = read("reports/current/full-tests.json");
const commands = read("reports/current/commands.json");
const mobile = read("reports/current/mobile-core-tests.json");
function failures(report) {
  return report.testResults.flatMap((suite) => {
    const failed = suite.assertionResults.filter((item) => item.status === "failed");
    return failed.length ? failed.map((item) => `${suite.name.replace(/^.*?\/(src|apps|packages)\//, "$1/")}::${item.fullName}`)
      : suite.status === "failed" ? [suite.name.replace(/^.*?\/(src|apps|packages)\//, "$1/")] : [];
  });
}
const oldFailures = new Set(failures(baseline));
const fullFailures = failures(current);
const unexpected = fullFailures.filter((name) => !name.startsWith("src/") || !oldFailures.has(name));
const requiredFailures = commands.results.filter((item) => item.name !== "full-tests" && item.exitCode !== 0);
const requiredNames = ["root-types", "root-lint", "core-types", "core-boundaries", "mobile-types", "mobile-core-tests", "full-tests"];
for (const name of requiredNames) if (!commands.results.some((item) => item.name === name)) requiredFailures.push({ name, exitCode: 1, reason: "Missing required check" });
if (mobile.numFailedTests || mobile.numFailedTestSuites || mobile.numTotalTests < 800) requiredFailures.push({ name: "mobile-core-coverage", exitCode: 1, reason: "Missing or failing mobile/core coverage" });
const result = {
  sha: commands.sha,
  status: requiredFailures.length || unexpected.length ? "FAIL" : "PASS",
  requiredFailures, unexpected,
  knownLegacyFailures: fullFailures.filter((name) => name.startsWith("src/") && oldFailures.has(name)),
  tests: {
    mobileCore: { total: mobile.numTotalTests, passed: mobile.numPassedTests, failed: mobile.numFailedTests, pending: mobile.numPendingTests },
    fullRepository: { total: current.numTotalTests, passed: current.numPassedTests, failed: current.numFailedTests, pending: current.numPendingTests },
  },
  device: { microphone: "NOT_RUN", acousticBargeIn: "NOT_RUN", bluetooth: "NOT_RUN", phoneCall: "NOT_RUN", ios: "NOT_TESTED" },
  visualReferenceComparison: { status: "NOT_RUN", reason: "Upstream does not contain referenced companion-registry.json or SVG baselines; checked-in capture routes and theme contracts are validated instead." },
};
writeFileSync("reports/verification.json", JSON.stringify(result, null, 2));
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Provider validation: ${result.status}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
if (result.status !== "PASS") process.exitCode = 1;
