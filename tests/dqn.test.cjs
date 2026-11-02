const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const E = require("../demo/engine");
const T = require("../demo/evolution");
const D = require("../demo/dqn");
const X = require("../demo/experiment");
const R = require("../demo/training-runner");

const state = [0, 1, 1, 0, 0, 0, 1, 0, 1];
const config = { seed: 42, stepBudget: 3000, warmupSteps: 64, batchSize: 8,
  replayCapacity: 256, epsilonDecaySteps: 2000, maxMoves: 100, hungerLimit: 30 };
function run(options = config) {
  const trainer = new D.DQN(options);
  while (!trainer.done) trainer.advance();
  return trainer;
}

test("linear Q values preserve old action ranking without sigmoid saturation", () => {
  const weights = new D.DQN(config).weights;
  const legacy = E.feedForward(weights, state);
  const q = D.predict(weights, state);
  assert.equal(q.action, legacy.action);
  q.output.forEach((value, i) => assert.ok(Math.abs(1 / (1 + Math.exp(-value)) - legacy.output[i]) < 1e-12));
  weights[208] = 100;
  weights[209] = 200;
  assert.equal(D.predict(weights, state).action, 1);
});

test("Double DQN selects with online weights, evaluates with target weights, and never bootstraps terminals", () => {
  const online = Array(E.WEIGHT_COUNT).fill(0);
  const target = [...online];
  online[208] = 3;
  target[208] = 2;
  target[209] = 100;
  const transition = { state, nextState: state, action: 1, reward: -2, done: false };
  assert.equal(D.tdTarget(transition, online, target, .5), -1);
  assert.equal(D.tdTarget({ ...transition, done: true }, online, target, .5), -2);
});

test("backpropagated Huber gradients match numerical derivatives for all 211 parameters", () => {
  const weights = new D.DQN(config).weights;
  const target = weights.map((w, i) => w + (i % 3 - 1) * .1);
  const batch = [
    { state, nextState: state.map((x) => 1 - x), action: 0, reward: .03, done: false },
    { state: state.map((x) => 1 - x), nextState: state, action: 2, reward: -10, done: true },
    { state, nextState: state, action: 1, reward: .3, done: true },
  ];
  const analytical = D.lossAndGradient(weights, target, batch, .9);
  for (let i = 0; i < weights.length; i++) {
    const before = weights[i];
    weights[i] = before + 1e-5;
    const above = D.lossAndGradient(weights, target, batch, .9).loss;
    weights[i] = before - 1e-5;
    const below = D.lossAndGradient(weights, target, batch, .9).loss;
    weights[i] = before;
    assert.ok(Math.abs((above - below) / 2e-5 - analytical.gradient[i]) < 1e-7, `parameter ${i}`);
  }
});

test("Adam updates reduce an independently measured terminal regression loss", () => {
  const weights = new D.DQN(config).weights;
  const batch = [{ state, nextState: state, action: 1, reward: 3, done: true }];
  const optimizer = new D.Adam(weights.length, .005, 5);
  const before = D.lossAndGradient(weights, weights, batch).loss;
  for (let i = 0; i < 100; i++) optimizer.apply(weights, D.lossAndGradient(weights, weights, batch).gradient);
  assert.ok(D.lossAndGradient(weights, weights, batch).loss < before * .1);
});

test("replay buffer owns its inputs and overwrites old experiences at capacity", () => {
  const replay = new D.ReplayBuffer(2);
  const input = [...state];
  replay.add(input, 0, 1, input, false);
  input[0] = 100;
  replay.add(state, 1, 2, state, true);
  replay.add(state, 2, 3, state, false);
  assert.equal(replay.size, 2);
  assert.deepEqual([...replay.rewards], [3, 2]);
  assert.equal(replay.states[0], state[0]);
  assert.deepEqual(replay.sample(2, () => .75).map((t) => [t.action, t.done]), [[1, true], [1, true]]);
  assert.throws(() => new D.ReplayBuffer(2).sample(1, Math.random));
});

test("DQN training changes weights, is reproducible, and respects its exact move budget", () => {
  const initial = new D.DQN(config);
  const trained = run();
  assert.equal(trained.simulatedMoves, config.stepBudget);
  assert.ok(trained.updates > 0);
  assert.notDeepEqual(trained.weights, initial.weights);
  assert.notDeepEqual(trained.targetWeights, initial.targetWeights);
  assert.deepEqual(trained.checkpoint(), run().checkpoint());
  const restored = T.validatePolicy(JSON.parse(JSON.stringify(trained.checkpoint())));
  assert.equal(restored.outputActivation, "linear");
  assert.deepEqual(E.simulate(restored, { seed: 99 }, false), E.simulate(trained.checkpoint(), { seed: 99 }, false));
});

test("comparison uses equal budgets, separate validation seeds, and real checkpoint scores", () => {
  const experiment = new X.Experiment({ ...config, algorithm: "compare", generations: 1000,
    population: 16, evaluationEvery: 1000, evaluationSeeds: [500, 700] });
  while (!experiment.done) experiment.advance();
  const result = experiment.result();
  for (const method of ["evolution", "dqn"]) {
    assert.equal(result.runs[method].steps, config.stepBudget);
    assert.equal(result.curves[method][0].steps, 0);
    assert.equal(result.curves[method].at(-1).steps, config.stepBudget);
    const model = result.models[method];
    const scores = result.evaluationSeeds.map((seed) =>
      E.simulate(model, { seed, maxMoves: config.maxMoves, hungerLimit: config.hungerLimit }, false).score);
    assert.equal(scores.reduce((sum, s) => sum + s, 0) / scores.length, model.validationMeanFood);
  }
  const frozen = JSON.stringify(experiment.curves);
  result.curves.dqn[0].meanFood = 999;
  result.models.dqn.weights[0] = 999;
  assert.equal(JSON.stringify(experiment.curves), frozen);
  assert.notEqual(experiment.models.dqn.weights[0], 999);
  assert.throws(() => new X.Experiment({ ...config, evaluationSeeds: [31] }));
});

test("per-method training completes every evolution generation independently of DQN's move budget", () => {
  const options = { ...config, algorithm: "compare", budgetMode: "per-method", generations: 8,
    population: 16, evaluationEvery: 1000, evaluationSeeds: [500, 700] };
  const experiment = new X.Experiment(options);
  while (!experiment.done) experiment.advance();
  const result = experiment.result();
  assert.equal(result.budgetMode, "per-method");
  assert.equal(result.runs.evolution.generations, options.generations);
  assert.equal(result.runs.evolution.games, options.population * options.generations * 3);
  assert.equal(result.runs.evolution.config.stepBudget, null);
  assert.equal(result.runs.dqn.steps, options.stepBudget);
  assert.deepEqual(result.curves.evolution.map((p) => p.generation), Array.from({ length: 9 }, (_, i) => i));
  const direct = new T.Evolution({ ...options, stepBudget: undefined });
  while (!direct.done) direct.advance();
  assert.equal(result.runs.evolution.steps, direct.simulatedMoves);
  assert.deepEqual(result.models.evolution.trainingSummary.steps, direct.simulatedMoves);
  assert.ok(result.models.evolution.selectedAtSteps <= result.models.evolution.trainingSummary.steps);
  assert.throws(() => new X.Experiment({ ...options, budgetMode: "unknown" }));
  const matchedDefaults = new X.Experiment({ algorithm: "compare", budgetMode: "matched-moves" });
  assert.equal(matchedDefaults.trainers[0].config.stepBudget, matchedDefaults.trainers[1].config.stepBudget);
});

test("DQN pause/resume preserves the exact training trajectory and worker code is standalone", () => {
  let now = 0;
  let callback;
  const messages = [];
  const options = { ...config, algorithm: "dqn", evaluationEvery: 1000, evaluationSeeds: [999] };
  const runner = R.createRunner((message) => messages.push(message), {
    now: () => ++now, budgetMs: 2,
    schedule: (fn) => { callback = fn; return 1; },
    cancel: () => { callback = null; },
  });
  runner.start(options);
  for (let i = 0; i < 20; i++) { const fn = callback; callback = null; fn(); }
  runner.pause();
  assert.equal(callback, null);
  assert.equal(messages.at(-1).state, "paused");
  runner.resume();
  while (callback) { const fn = callback; callback = null; fn(); }
  assert.equal(messages.at(-1).state, "completed");
  const context = { result: null, structuredClone };
  vm.runInNewContext(`${E.workerSource}\n${T.workerSource}\n${D.workerSource}\n${X.workerSource}
    const experiment = new SnakeExperiment.Experiment(${JSON.stringify(options)});
    while (!experiment.done) experiment.advance();
    result = experiment.result();`, context);
  assert.deepEqual(messages.at(-1).checkpoint.weights, JSON.parse(JSON.stringify(context.result)).models.dqn.weights);
});

test("invalid training and imported activation settings fail early", () => {
  assert.throws(() => new D.DQN({ ...config, learningRate: 0 }));
  assert.throws(() => new D.DQN({ ...config, epsilonStart: .1, epsilonEnd: .5 }));
  assert.throws(() => new D.DQN({ ...config, warmupSteps: config.stepBudget }));
  assert.throws(() => new T.Evolution({ parentFraction: .1, eliteFraction: .4 }));
  assert.throws(() => T.validatePolicy({ ...run().checkpoint(), outputActivation: "sigmoid" }));
});

test("the recorded models reproduce every published validation and held-out test score", () => {
  for (const recorded of [require("../docs/examples/comparison-500k.json"),
    require("../docs/examples/comparison-300-generations.json")]) {
  for (const method of ["evolution", "dqn"]) {
    const model = recorded.models[method];
    const settings = recorded.runs[method].config;
    if (recorded.budgetMode === "per-method" && method === "evolution") {
      assert.equal(recorded.runs.evolution.generations, 300);
      assert.equal(recorded.runs.evolution.games, 86400);
      assert.equal(model.trainingSummary.steps, recorded.runs.evolution.steps);
      assert.equal(T.validatePolicy(model).trainingSummary.generations, 300);
      assert.ok(model.selectedAtSteps < model.trainingSummary.steps);
    } else assert.equal(recorded.runs[method].steps, 500000);
    for (const expected of [...model.validation, ...model.test.samples]) {
      const actual = E.simulate(T.validatePolicy(model), {
        seed: expected.seed, maxMoves: settings.maxMoves, hungerLimit: settings.hungerLimit,
      }, false);
      assert.equal(actual.score, expected.score);
      assert.equal(actual.moves, expected.moves);
    }
    assert.equal(model.test.samples.reduce((sum, p) => sum + p.score, 0) / model.test.samples.length, model.test.meanFood);
    assert.equal(Math.max(...recorded.curves[method].map((p) => p.meanFood)), model.validationMeanFood);
  }
  }
});
