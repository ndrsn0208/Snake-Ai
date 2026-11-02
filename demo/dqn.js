/* Double DQN: experience replay, a target network, Huber loss, and Adam. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const core = factory(node ? require("./engine.js") : root.SnakeEngine,
    node ? require("./evolution.js") : root.SnakeEvolution);
  const api = Object.freeze({ ...core, workerSource: `const SnakeDQN = (${factory.toString()})(SnakeEngine, SnakeEvolution);` });
  if (node) module.exports = api;
  else root.SnakeDQN = api;
})(globalThis, function (E, T) {
  "use strict";
  const DEFAULTS = Object.freeze({
    seed: 20190721, stepBudget: 500000, initialization: "random",
    learningRate: .001, gamma: .95, batchSize: 32, replayCapacity: 20000,
    warmupSteps: 1000, trainEvery: 4, targetEvery: 1000,
    epsilonStart: 1, epsilonEnd: .05, epsilonDecaySteps: 150000,
    gradientClip: 5, maxMoves: 1200, hungerLimit: 180,
    foodReward: 10, deathReward: -10, distanceReward: .1, stepReward: -.01,
  });

  class ReplayBuffer {
    constructor(capacity) {
      this.capacity = capacity;
      this.states = new Float64Array(capacity * 9);
      this.nextStates = new Float64Array(capacity * 9);
      this.actions = new Uint8Array(capacity);
      this.rewards = new Float64Array(capacity);
      this.terminals = new Uint8Array(capacity);
      this.size = 0;
      this.position = 0;
    }
    add(state, action, reward, nextState, done) {
      const i = this.position;
      this.states.set(state, i * 9);
      this.nextStates.set(nextState, i * 9);
      this.actions[i] = action;
      this.rewards[i] = reward;
      this.terminals[i] = Number(done);
      this.position = (i + 1) % this.capacity;
      this.size = Math.min(this.size + 1, this.capacity);
    }
    sample(count, rng) {
      if (!this.size) throw new Error("Cannot sample an empty replay buffer.");
      return Array.from({ length: count }, () => {
        const i = Math.floor(rng() * this.size);
        return { state: this.states.subarray(i * 9, i * 9 + 9),
          nextState: this.nextStates.subarray(i * 9, i * 9 + 9),
          action: this.actions[i], reward: this.rewards[i], done: Boolean(this.terminals[i]) };
      });
    }
  }

  function predict(weights, state) {
    return E.feedForward({ weights, outputActivation: "linear" }, state);
  }

  function tdTarget(transition, weights, targetWeights, gamma) {
    if (transition.done) return transition.reward;
    // Online weights choose the action; frozen target weights value that action.
    const action = predict(weights, transition.nextState).action;
    return transition.reward + gamma * predict(targetWeights, transition.nextState).output[action];
  }

  function lossAndGradient(weights, targetWeights, batch, gamma = .95) {
    const gradient = new Float64Array(E.WEIGHT_COUNT);
    let loss = 0;
    for (const transition of batch) {
      const { hidden, output } = predict(weights, transition.state);
      const target = tdTarget(transition, weights, targetWeights, gamma);
      const error = output[transition.action] - target;
      const magnitude = Math.abs(error);
      loss += magnitude <= 1 ? .5 * error * error : magnitude - .5;
      // The TD target is detached. Only Q(state, action) receives a gradient.
      const delta = Math.max(-1, Math.min(1, error)) / batch.length;
      const outputOffset = 160 + transition.action * 16;
      gradient[208 + transition.action] += delta;
      for (let h = 0; h < 16; h++) {
        gradient[outputOffset + h] += delta * hidden[h];
        const hiddenDelta = delta * weights[outputOffset + h] * hidden[h] * (1 - hidden[h]);
        gradient[144 + h] += hiddenDelta;
        for (let i = 0; i < 9; i++) gradient[h * 9 + i] += hiddenDelta * transition.state[i];
      }
    }
    return { loss: loss / batch.length, gradient };
  }

  class Adam {
    constructor(size, learningRate, clip = 5) {
      this.m = new Float64Array(size);
      this.v = new Float64Array(size);
      this.step = 0;
      this.learningRate = learningRate;
      this.clip = clip;
    }
    apply(weights, gradient) {
      this.step++;
      let normSquared = 0;
      for (const g of gradient) normSquared += g * g;
      const scale = Math.min(1, this.clip / Math.max(1e-12, Math.sqrt(normSquared)));
      const firstCorrection = 1 - .9 ** this.step;
      const secondCorrection = 1 - .999 ** this.step;
      for (let i = 0; i < weights.length; i++) {
        const g = gradient[i] * scale;
        this.m[i] = .9 * this.m[i] + .1 * g;
        this.v[i] = .999 * this.v[i] + .001 * g * g;
        weights[i] -= this.learningRate * (this.m[i] / firstCorrection) /
          (Math.sqrt(this.v[i] / secondCorrection) + 1e-8);
        if (!Number.isFinite(weights[i]) || Math.abs(weights[i]) > 1000) {
          throw new Error("Unstable weights. Try a smaller learning rate.");
        }
      }
    }
  }

  class DQN {
    constructor(options = {}) {
      const integer = (key, min, max) => T.integer(options[key], DEFAULTS[key], min, max, key);
      const number = (key, min, max) => T.number(options[key], DEFAULTS[key], min, max, key);
      this.config = {
        seed: integer("seed", 0, 0xffffffff), stepBudget: integer("stepBudget", 1000, 10000000),
        initialization: options.initialization || DEFAULTS.initialization,
        learningRate: number("learningRate", .000001, .1), gamma: number("gamma", 0, .999),
        batchSize: integer("batchSize", 8, 256), replayCapacity: integer("replayCapacity", 256, 100000),
        warmupSteps: integer("warmupSteps", 0, 100000), trainEvery: integer("trainEvery", 1, 32),
        targetEvery: integer("targetEvery", 1, 100000),
        epsilonStart: number("epsilonStart", 0, 1), epsilonEnd: number("epsilonEnd", 0, 1),
        epsilonDecaySteps: integer("epsilonDecaySteps", 1, 10000000),
        gradientClip: number("gradientClip", .01, 100),
        maxMoves: integer("maxMoves", 100, 4000), hungerLimit: integer("hungerLimit", 30, 1000),
        foodReward: number("foodReward", 0, 100), deathReward: number("deathReward", -100, 0),
        distanceReward: number("distanceReward", 0, 5), stepReward: number("stepReward", -1, 0),
        excludedSeeds: [...(options.excludedSeeds || [])],
      };
      if (!["random", "current"].includes(this.config.initialization)) throw new Error("DQN supports random or current weights.");
      if (this.config.epsilonEnd > this.config.epsilonStart) throw new Error("Final exploration must not exceed initial exploration.");
      if (this.config.warmupSteps >= this.config.stepBudget) throw new Error("Warmup must be shorter than the training move budget.");
      if (this.config.batchSize > this.config.replayCapacity) throw new Error("Batch size must not exceed replay capacity.");
      if (this.config.excludedSeeds.length > 128 ||
          !this.config.excludedSeeds.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) {
        throw new Error("Invalid reserved evaluation seeds.");
      }
      this.rng = E.random(this.config.seed);
      const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, this.rng()))) * Math.cos(2 * Math.PI * this.rng());
      this.weights = this.config.initialization === "current" ? T.validateWeights(options.initialWeights)
        : Array.from({ length: E.WEIGHT_COUNT }, (_, i) =>
          normal() * ((i >= 144 && i < 160) || i >= 208 ? .2 : .7));
      this.targetWeights = [...this.weights];
      this.optimizer = new Adam(E.WEIGHT_COUNT, this.config.learningRate, this.config.gradientClip);
      this.replay = new ReplayBuffer(this.config.replayCapacity);
      // Evaluation never consumes either random stream.
      this.gameRng = E.random(this.config.seed ^ 0x9e3779b9);
      this.simulatedMoves = 0;
      this.evaluatedGames = 0;
      this.updates = 0;
      this.loss = null;
      this.lossSum = 0;
      this.lossCount = 0;
      this.history = [];
      this.recentScores = [];
      this.done = false;
      this.newGame();
    }

    newGame() {
      let seed;
      do { seed = Math.floor(this.gameRng() * 0x100000000); } while (this.config.excludedSeeds.includes(seed));
      this.game = new E.Game({ seed,
        maxMoves: this.config.maxMoves, hungerLimit: this.config.hungerLimit });
    }

    get epsilon() {
      const fraction = Math.min(1, this.simulatedMoves / this.config.epsilonDecaySteps);
      return this.config.epsilonStart + fraction * (this.config.epsilonEnd - this.config.epsilonStart);
    }

    advance() {
      if (this.done) return false;
      const state = this.game.features();
      const action = this.rng() < this.epsilon ? Math.floor(this.rng() * 3) : predict(this.weights, state).action;
      const previousDistance = this.game.distanceReward;
      const result = this.game.move(action);
      const terminalFailure = result.done && this.game.reason !== "Board cleared";
      const closer = Math.sign(this.game.distanceReward - previousDistance);
      const reward = result.ate ? this.config.foodReward
        : terminalFailure ? this.config.deathReward
          : this.config.stepReward + closer * this.config.distanceReward;
      this.replay.add(state, action, reward, this.game.features(), result.done);
      this.simulatedMoves++;
      const c = this.config;
      if (this.simulatedMoves >= c.warmupSteps && this.replay.size >= c.batchSize &&
          this.simulatedMoves % c.trainEvery === 0) {
        const update = lossAndGradient(this.weights, this.targetWeights,
          this.replay.sample(c.batchSize, this.rng), c.gamma);
        this.optimizer.apply(this.weights, update.gradient);
        this.updates++;
        this.lossSum += update.loss;
        this.lossCount++;
      }
      if (this.simulatedMoves % c.targetEvery === 0) this.targetWeights = [...this.weights];
      if (result.done) {
        this.evaluatedGames++;
        this.recentScores.push(this.game.score);
        if (this.recentScores.length > 100) this.recentScores.shift();
        this.newGame();
      }
      this.done = this.simulatedMoves >= c.stepBudget;
      if (this.simulatedMoves % 1000 === 0 || this.done) {
        this.loss = this.lossCount ? this.lossSum / this.lossCount : null;
        this.history.push({ steps: this.simulatedMoves, loss: this.loss, epsilon: this.epsilon,
          episodes: this.evaluatedGames, updates: this.updates });
        this.lossSum = this.lossCount = 0;
        return true;
      }
      return false;
    }

    checkpoint() {
      return {
        name: `DQN · ${this.simulatedMoves.toLocaleString("en-US")} moves`,
        algorithm: "dqn", outputActivation: "linear", architecture: [...E.SHAPE],
        seed: this.config.seed, initialization: this.config.initialization,
        method: "Double DQN with experience replay, Huber loss, Adam, and a target network",
        hyperparameters: { ...this.config }, stepBudget: this.config.stepBudget,
        episodes: this.evaluatedGames, evaluatedGames: this.evaluatedGames,
        simulatedMoves: this.simulatedMoves, updates: this.updates,
        diagnostics: this.history.map((point) => ({ ...point })), weights: [...this.weights],
      };
    }

    snapshot(includeCheckpoint = true) {
      return {
        algorithm: "dqn", generation: 0, targetGenerations: 0,
        evaluatedGames: this.evaluatedGames, simulatedMoves: this.simulatedMoves,
        epsilon: this.epsilon, updates: this.updates, loss: this.loss,
        replaySize: this.replay.size, done: this.done,
        history: this.history.map((point) => ({ ...point })),
        checkpoint: includeCheckpoint ? this.checkpoint() : undefined,
      };
    }
  }
  return Object.freeze({ DEFAULTS, ReplayBuffer, predict, tdTarget, lossAndGradient, Adam, DQN });
});
