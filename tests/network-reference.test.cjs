const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../demo/engine");
const reference = require("./fixtures/network-reference.json");

for (const [index, fixture] of reference.cases.entries()) {
  test(`original NumPy network parity, input ${index + 1}`, () => {
    const actual = E.feedForward(reference.weights, fixture.input).output;
    actual.forEach((value, i) => assert.ok(Math.abs(value - fixture.output[i]) < 1e-12));
  });
}
