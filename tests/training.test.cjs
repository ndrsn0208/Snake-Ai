const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const E = require("../demo/engine");
const T = require("../demo/evolution");
const D = require("../demo/dqn");
const X = require("../demo/experiment");
const R = require("../demo/training-runner");
const config = { seed: 42, population: 16, generations: 8, trainSeeds: [31, 137], maxMoves: 200, hungerLimit: 80 };

function train(options = config) {
  const trainer = new T.Evolution(options);
  while (!trainer.done) trainer.advance();
  return trainer;
}

test("from-scratch training really starts from random weights and is reproducible", () => {
  const a = new T.Evolution(config);
  const b = new T.Evolution(config);
  assert.equal(a.config.initialization, "random");
  assert.deepEqual(a.population, b.population);
  assert.notDeepEqual(a.population[0], E.heuristicWeights());
  assert.notDeepEqual(a.population[0], a.population[1]);
  assert.equal(a.checkpoint(), null);
  while (!a.done) a.advance();
  while (!b.done) b.advance();
  assert.deepEqual(a.checkpoint(), b.checkpoint());
  assert.equal(a.evaluatedGames, 16 * 8 * 2);
  assert.equal(a.history.length, 8);
  assert.ok(a.simulatedMoves > a.evaluatedGames);
  for (let i = 1; i < a.history.length; i++) assert.ok(a.history[i].fitness >= a.history[i - 1].fitness);
});

test("checkpoints preserve the actual evaluated champion and do not alias training state", () => {
  const trainer = train();
  const checkpoint = trainer.checkpoint();
  const measured = config.trainSeeds.map((seed) => E.simulate(checkpoint.weights,
    { seed, maxMoves: config.maxMoves, hungerLimit: config.hungerLimit }, false));
  const fitness = measured.reduce((sum, run) => sum + run.fitness, 0) / measured.length;
  assert.equal(fitness, trainer.best.fitness);
  checkpoint.weights[0] += 100;
  checkpoint.history[0].fitness = -999;
  assert.notEqual(checkpoint.weights[0], trainer.best.weights[0]);
  assert.notEqual(checkpoint.history[0].fitness, trainer.history[0].fitness);
});

test("warm starts are explicit and seed weights remain unchanged", () => {
  const weights = E.heuristicWeights();
  const before = [...weights];
  const trainer = new T.Evolution({ ...config, initialization: "current", initialWeights: weights });
  assert.deepEqual(trainer.population[0], weights);
  while (!trainer.done) trainer.advance();
  assert.deepEqual(weights, before);
  assert.equal(trainer.checkpoint().initialization, "current");
});

function harness() {
  let time = 0;
  let nextId = 0;
  const queue = new Map();
  const messages = [];
  const runner = R.createRunner((message) => messages.push(message), {
    now: () => ++time, budgetMs: 2,
    schedule: (callback) => { queue.set(++nextId, callback); return nextId; },
    cancel: (id) => queue.delete(id),
  });
  return { runner, queue, messages, flush() {
    const entry = queue.entries().next().value;
    if (!entry) return false;
    queue.delete(entry[0]);
    entry[1]();
    return true;
  } };
}

test("pause freezes work; resume completes the exact same training run", () => {
  const h = harness();
  h.runner.start(config);
  while (h.messages.at(-1).generation < 1) h.flush();
  h.runner.pause();
  const paused = h.messages.at(-1);
  assert.equal(paused.state, "paused");
  assert.equal(h.queue.size, 0);
  assert.equal(h.flush(), false);
  assert.equal(h.messages.at(-1).evaluatedGames, paused.evaluatedGames);
  h.runner.resume();
  while (h.flush()) {}
  assert.equal(h.messages.at(-1).state, "completed");
  assert.deepEqual(h.messages.at(-1).checkpoint.weights, train().checkpoint().weights);
});

test("stop retains the best checkpoint and cancels future evaluation", () => {
  const h = harness();
  h.runner.start(config);
  while (h.messages.at(-1).generation < 1) h.flush();
  h.runner.stop();
  const stopped = h.messages.at(-1);
  assert.equal(stopped.state, "stopped");
  assert.ok(stopped.checkpoint.weights.length > 0);
  assert.equal(h.flush(), false);
  assert.equal(h.runner.getState(), "stopped");
});

test("the self-contained worker sources run the same engine without imports or fetch", () => {
  const context = { result: null, setTimeout, clearTimeout, performance };
  vm.runInNewContext(`${E.workerSource}\n${T.workerSource}\n${D.workerSource}\n${X.workerSource}\n${R.workerSource}
    const trainer = new SnakeEvolution.Evolution(${JSON.stringify(config)});
    while (!trainer.done) trainer.advance();
    result = trainer.checkpoint();`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), train().checkpoint());
});

test("saved model validation rejects incompatible or non-finite weights", () => {
  const checkpoint = train().checkpoint();
  const restored = T.validatePolicy(JSON.parse(JSON.stringify(checkpoint)));
  assert.deepEqual(restored.weights, checkpoint.weights);
  assert.throws(() => T.validatePolicy({ ...checkpoint, architecture: [9, 18, 7, 3] }));
  assert.throws(() => T.validatePolicy({ ...checkpoint, weights: [NaN, ...checkpoint.weights.slice(1)] }));
  assert.throws(() => new T.Evolution({ population: 0 }));
  assert.throws(() => new T.Evolution({ generations: 1001 }));
});
