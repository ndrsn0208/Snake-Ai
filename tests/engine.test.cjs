const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../demo/engine");
const policy = require("../demo/policy");

test("the network preserves the original 9→16→3 shape and left-first tie break", () => {
  const result = E.feedForward(Array(E.WEIGHT_COUNT).fill(0), Array(9).fill(0));
  assert.deepEqual(result.hidden, Array(16).fill(.5));
  assert.deepEqual(result.output, [.5, .5, .5]);
  assert.equal(result.action, 0);
});

test("initial bodies are in bounds and food does not overlap the snake", () => {
  for (const size of [8, 20, 40]) {
    for (const seed of [0, 1, 2026, 0xffffffff]) {
      const game = new E.Game({ size, seed });
      assert.equal(new Set(game.body).size, 6);
      assert.ok(game.body.every((cell) => cell >= 0 && cell < size * size));
      assert.ok(!game.body.includes(game.food));
      assert.equal(new Set(game.body.map((cell) => Math.floor(cell / size))).size, 1);
    }
  }
});

test("relative turns and food signals agree for every heading", () => {
  const game = new E.Game();
  game.body = [10 + 10 * 20];
  const delta = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let direction = 0; direction < 4; direction++) {
    game.direction = direction;
    const left = delta[(direction + 3) % 4];
    game.food = (10 + left[0] * 3) + (10 + left[1] * 3) * 20;
    assert.equal(game.features()[2], 1);
    assert.equal(game.features()[5], 0);
    assert.equal(game.features()[8], 0);
  }
});

test("moving into a vacated tail cell is legal", () => {
  const game = new E.Game();
  game.body = [21, 22, 42, 41];
  game.direction = 3;
  game.food = 300;
  game.move(0);
  assert.equal(game.body[0], 41);
  assert.equal(game.reason, null);
});

test("eating grows once and replaces food on an empty square", () => {
  const game = new E.Game({ seed: 10 });
  game.food = game.body[0] + 1;
  game.move(2);
  assert.equal(game.score, 1);
  assert.equal(game.body.length, 7);
  assert.ok(!game.body.includes(game.food));
});

test("a full board ends without looping forever while placing food", () => {
  const game = new E.Game({ size: 8 });
  game.body = Array.from({ length: 64 }, (_, i) => i);
  game.spawnFood();
  assert.equal(game.reason, "Board cleared");
  assert.equal(game.food, null);
});

test("wall collisions preserve the last valid body snapshot", () => {
  const game = new E.Game();
  game.body = [19, 18, 17];
  game.direction = 1;
  game.move(2);
  assert.equal(game.reason, "Wall collision");
  assert.deepEqual(game.body, [19, 18, 17]);
  assert.equal(game.moves, 1);
});

test("replays are deterministic and events match actual score changes", () => {
  const a = E.simulate(policy.weights, { seed: 2026 });
  const b = E.simulate(policy.weights, { seed: 2026 });
  assert.deepEqual(a, b);
  assert.equal(a.frames.length, a.moves + 1);
  assert.equal(a.events.length, a.score);
  for (const event of a.events) assert.equal(a.frames[event].score, a.frames[event - 1].score + 1);
});

test("the bundled validation results are reproducible using the shipped weights", () => {
  for (const expected of policy.validation) {
    const actual = E.simulate(policy.weights, { seed: expected.seed }, false);
    assert.equal(actual.score, expected.score);
    assert.equal(actual.moves, expected.moves);
    assert.equal(actual.reason, expected.reason);
  }
});
