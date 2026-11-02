/* Per-method training lengths or a matched-move benchmark, with shared validation. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const core = factory(node ? require("./engine.js") : root.SnakeEngine,
    node ? require("./evolution.js") : root.SnakeEvolution,
    node ? require("./dqn.js") : root.SnakeDQN);
  const api = Object.freeze({ ...core, workerSource: `const SnakeExperiment = (${factory.toString()})(SnakeEngine, SnakeEvolution, SnakeDQN);` });
  if (node) module.exports = api;
  else root.SnakeExperiment = api;
})(globalThis, function (E, T, D) {
  "use strict";
  const EVALUATION_SEEDS = Object.freeze([10007, 20011, 30013, 40009, 50021, 60013, 70001, 80021]);
  const TEST_SEEDS = Object.freeze(Array.from({ length: 20 }, (_, i) => 90001 + i * 97));

  class Experiment {
    constructor(options = {}) {
      this.config = { ...options };
      this.algorithm = options.algorithm || "evolution";
      if (!["evolution", "dqn", "compare"].includes(this.algorithm)) throw new Error("Choose Evolution, DQN, or Compare both.");
      this.budgetMode = options.budgetMode || (options.stepBudget === undefined ? "per-method" : "matched-moves");
      if (!["per-method", "matched-moves"].includes(this.budgetMode)) throw new Error("Choose per-method training or matched moves.");
      this.methods = this.algorithm === "compare" ? ["evolution", "dqn"] : [this.algorithm];
      this.evaluationEvery = T.integer(options.evaluationEvery, 25000, 1000, 1000000, "Evaluation interval");
      this.evaluationSeeds = [...(options.evaluationSeeds || EVALUATION_SEEDS)];
      if (!this.evaluationSeeds.length || this.evaluationSeeds.length > 32 ||
          !this.evaluationSeeds.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) {
        throw new Error("Supply 1–32 valid evaluation seeds.");
      }
      const trainSeeds = options.trainSeeds || T.DEFAULTS.trainSeeds;
      const reserved = [...this.evaluationSeeds, ...TEST_SEEDS];
      if (trainSeeds.some((seed) => reserved.includes(seed))) throw new Error("Training and evaluation seeds must be different.");
      this.curves = { evolution: [], dqn: [] };
      this.models = {};
      this.runs = {};
      this.index = 0;
      this.done = false;
      // Validate both configurations before any work starts.
      this.trainers = this.methods.map((method) => method === "dqn"
        ? new D.DQN({ ...options, excludedSeeds: reserved })
        : new T.Evolution({ ...options, stepBudget: this.budgetMode === "per-method"
          ? undefined : options.stepBudget ?? D.DEFAULTS.stepBudget }));
      this.nextEvaluation = 0;
    }

    get method() { return this.methods[this.index]; }
    get trainer() { return this.trainers[this.index]; }
    get simulatedMoves() { return this.trainer.simulatedMoves; }

    currentPolicy() {
      return this.trainer.checkpoint() || {
        name: "Evolution · initial weights", algorithm: "evolution", outputActivation: "sigmoid",
        architecture: [...E.SHAPE], weights: [...this.trainer.population[0]],
        seed: this.trainer.config.seed, initialization: this.trainer.config.initialization,
        evaluatedGames: 0, simulatedMoves: 0, generations: 0,
        method: "Initial candidate before selection",
      };
    }

    evaluate() {
      const model = this.currentPolicy();
      const results = this.evaluationSeeds.map((seed) => {
        const run = E.simulate(model, { seed,
          maxMoves: this.trainer.config.maxMoves, hungerLimit: this.trainer.config.hungerLimit }, false);
        return { seed, score: run.score, moves: run.moves, reason: run.reason };
      });
      const meanFood = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      const point = {
        steps: this.trainer.simulatedMoves, games: this.trainer.evaluatedGames, meanFood,
        minFood: Math.min(...results.map((r) => r.score)), maxFood: Math.max(...results.map((r) => r.score)),
        stdFood: Math.sqrt(results.reduce((sum, r) => sum + (r.score - meanFood) ** 2, 0) / results.length),
        ...(this.method === "dqn" ? { loss: this.trainer.loss, epsilon: this.trainer.epsilon, updates: this.trainer.updates }
          : { generation: this.trainer.generation }),
      };
      this.curves[this.method].push(point);
      const previous = this.models[this.method];
      if (!previous || meanFood > previous.validationMeanFood) {
        this.models[this.method] = { ...model, validation: results, validationMeanFood: meanFood,
          selectedAtSteps: point.steps, selectedAtGeneration: this.trainer.generation || 0,
          name: this.method === "evolution" && this.budgetMode === "per-method"
            ? `Evolution · best checkpoint at generation ${point.generation}`
            : `${this.method === "dqn" ? "DQN" : "Evolution"} · checkpoint at ${point.steps.toLocaleString("en-US")} moves` };
      }
      this.nextEvaluation = (Math.floor(point.steps / this.evaluationEvery) + 1) * this.evaluationEvery;
      this.runs[this.method] = {
        steps: point.steps, games: this.trainer.evaluatedGames, done: this.trainer.done,
        generations: this.trainer.generation || 0, updates: this.trainer.updates || 0,
        config: { ...this.trainer.config },
      };
      return point;
    }

    advance() {
      if (this.done) return false;
      if (this.nextEvaluation === 0) {
        this.evaluate();
        return true;
      }
      const previousGeneration = this.trainer.generation;
      this.trainer.advance();
      const due = this.method === "evolution" && this.budgetMode === "per-method"
        ? this.trainer.generation > previousGeneration
        : this.trainer.simulatedMoves >= this.nextEvaluation;
      if (!due && !this.trainer.done) return false;
      this.evaluate();
      if (this.trainer.done) {
        if (this.index === this.methods.length - 1) this.done = true;
        else { this.index++; this.nextEvaluation = 0; }
      }
      return true;
    }

    checkpoint() {
      const model = this.models[this.method];
      if (!model) return null;
      return this.exportModel(this.method);
    }

    runSummary(method) {
      const trainer = this.trainers[this.methods.indexOf(method)];
      return {
        steps: trainer.simulatedMoves, games: trainer.evaluatedGames, done: trainer.done,
        generations: trainer.generation || 0, updates: trainer.updates || 0,
        config: structuredClone(trainer.config),
      };
    }

    exportModel(method) {
      const run = this.runSummary(method);
      return {
        ...structuredClone(this.models[method]),
        trainingSummary: { steps: run.steps, games: run.games, generations: run.generations,
          updates: run.updates, done: run.done, budgetMode: this.budgetMode,
          generationTarget: run.config.generations || 0, stepBudget: run.config.stepBudget || null },
        learningCurve: this.curves[method].map((p) => ({ ...p })),
      };
    }

    snapshot(includeCheckpoint = true) {
      const status = this.trainer.snapshot(false);
      const budget = this.trainer.config.stepBudget;
      const fraction = budget ? status.simulatedMoves / budget
        : (status.generation + status.evaluatedInGeneration / status.gamesPerGeneration) / status.targetGenerations;
      return {
        ...status, algorithm: this.method, mode: this.algorithm, budgetMode: this.budgetMode,
        runIndex: this.index, runCount: this.methods.length,
        done: this.done, progressFraction: this.done ? 1 : (this.index + Math.min(1, fraction)) / this.methods.length,
        stepBudget: budget, bestFood: this.models[this.method]?.validationMeanFood ?? null,
        evaluationSeeds: [...this.evaluationSeeds], evaluationEvery: this.evaluationEvery,
        curves: structuredClone(this.curves),
        runs: Object.fromEntries(this.methods.map((method) => [method, this.runSummary(method)])),
        models: includeCheckpoint ? Object.fromEntries(Object.keys(this.models).map((key) =>
          [key, this.exportModel(key)])) : undefined,
        checkpoint: includeCheckpoint ? this.checkpoint() : undefined,
      };
    }

    result() {
      const snapshot = this.snapshot(true);
      return {
        formatVersion: 2, mode: this.algorithm, budgetMode: this.budgetMode, seed: this.trainer.config.seed,
        evaluationSeeds: snapshot.evaluationSeeds, evaluationEvery: this.evaluationEvery,
        note: "Greedy policies evaluated on shared validation seeds. Validation selects saved checkpoints. Evaluation moves are excluded from the training budget.",
        curves: snapshot.curves, runs: snapshot.runs, models: snapshot.models,
      };
    }
  }
  return Object.freeze({ EVALUATION_SEEDS, TEST_SEEDS, Experiment });
});
