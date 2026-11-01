const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const E = require("../demo/engine");
const policy = require("../demo/policy");
const result = cp.spawnSync(process.env.SNAKE_PYTHON || "python3",
  [path.resolve(__dirname, "network-reference.py")], {
    input: JSON.stringify(policy.weights), encoding: "utf8",
  });
if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
const fixtures = JSON.parse(result.stdout);
for (const fixture of fixtures) {
  const actual = E.feedForward(policy.weights, fixture.input).output;
  actual.forEach((value, i) => assert.ok(Math.abs(value - fixture.output[i]) < 1e-12));
}
if (process.argv.includes("--write-fixtures")) {
  const folder = path.resolve(__dirname, "../tests/fixtures");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "network-reference.json"),
    JSON.stringify({ weights: policy.weights, cases: fixtures }, null, 2) + "\n");
}
console.log(`PASS: ${fixtures.length} cases match the original network.py forward pass.`);
