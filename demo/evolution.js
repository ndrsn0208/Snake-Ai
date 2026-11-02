/* Incremental genetic training, shared by the browser worker and Node CLI. */
(function (root, factory) {
  const E = typeof module === "object" && module.exports ? require("./engine.js") : root.SnakeEngine;
  const core = factory(E);
  const api = Object.freeze({ ...core, workerSource: `const SnakeEvolution = (${factory.toString()})(SnakeEngine);` });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SnakeEvolution = api;
})(globalThis, function (E) {
  "use strict";
  const DEFAULTS = Object.freeze({
    seed: 20190721, population: 96, generations: 100, initialization: "random",
    maxMoves: 1200, hungerLimit: 180, trainSeeds: [31, 137, 911],
    mutationRate: .14, mutationScale: .65, finalMutationScale: .3,
    eliteFraction: .06, parentFraction: .2, immigrantRate: .05,
  });

  function integer(value, fallback, min, max, label) {
    const n = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
    return n;
  }

  function number(value, fallback, min, max, label) {
    const n = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
    return n;
  }

  function validateWeights(weights) {
    if (!Array.isArray(weights) || weights.length !== E.WEIGHT_COUNT ||
        !weights.every((value) => Number.isFinite(value) && Math.abs(value) <= 1000)) {
      throw new Error(`The model must contain ${E.WEIGHT_COUNT} finite weights between -1000 and 1000.`);
    }
    return [...weights];
  }

  function validatePolicy(value) {
    if (!value || !Array.isArray(value.architecture) ||
        value.architecture.join(",") !== E.SHAPE.join(",")) {
      throw new Error("This page supports models with architecture 9 → 16 → 3.");
    }
    const weights = validateWeights(value.weights);
    const outputActivation = value.outputActivation || "sigmoid";
    if (!["sigmoid", "linear"].includes(outputActivation)) throw new Error("Unsupported output activation.");
    if (value.algorithm === "dqn" && outputActivation !== "linear") throw new Error("DQN models need a linear Q-value output.");
    const numericFields = ["episodes", "updates", "selectedAtSteps", "stepBudget", "bestGeneration"];
    const metadata = Object.fromEntries(numericFields.filter((key) => Number.isFinite(value[key]))
      .map((key) => [key, value[key]]));
    return {
      name: String(value.name || "Imported model").slice(0, 160),
      architecture: [...E.SHAPE], weights, outputActivation,
      algorithm: value.algorithm === "dqn" ? "dqn" : "evolution", ...metadata,
      seed: Number.isInteger(value.seed) ? value.seed >>> 0 : 0,
      population: Number.isInteger(value.population) ? value.population : 0,
      generations: Number.isInteger(value.generations) ? value.generations : 0,
      initialization: String(value.initialization || "imported").slice(0, 100),
      method: String(value.method || "Imported neural-network weights").slice(0, 240),
      trainSeeds: Array.isArray(value.trainSeeds) ? value.trainSeeds.slice(0, 16) : [],
      evaluatedGames: Number.isFinite(value.evaluatedGames) ? value.evaluatedGames : 0,
      simulatedMoves: Number.isFinite(value.simulatedMoves) ? value.simulatedMoves : 0,
      hyperparameters: value.hyperparameters && typeof value.hyperparameters === "object"
        ? Object.fromEntries(Object.entries(value.hyperparameters).filter(([, v]) =>
          typeof v === "number" && Number.isFinite(v) || typeof v === "string" || typeof v === "boolean")) : {},
      validation: Array.isArray(value.validation) ? value.validation.slice(0, 64).filter((p) =>
        p && Number.isFinite(p.seed) && Number.isFinite(p.score) && Number.isFinite(p.moves))
        .map((p) => ({ seed: p.seed, score: p.score, moves: p.moves, reason: String(p.reason || "") })) : [],
      learningCurve: Array.isArray(value.learningCurve) ? value.learningCurve.slice(0, 1001).filter((p) =>
        p && Number.isFinite(p.steps) && Number.isFinite(p.meanFood)).map((p) => ({
          steps: p.steps, meanFood: p.meanFood,
        })) : [],
      history: Array.isArray(value.history) ? value.history.slice(0, 1000).map((point) => ({
        generation: Number(point.generation), fitness: Number(point.fitness),
        meanFitness: Number(point.meanFitness ?? point.fitness),
        meanFood: Number(point.meanFood || 0),
      })).filter((p) => Object.values(p).every(Number.isFinite)) : [],
    };
  }

  class Evolution {
    constructor(options = {}) {
      this.config = {
        seed: integer(options.seed, DEFAULTS.seed, 0, 0xffffffff, "Seed"),
        population: integer(options.population, DEFAULTS.population, 16, 256, "Population"),
        generations: integer(options.generations, DEFAULTS.generations, 1, 1000, "Generations"),
        maxMoves: integer(options.maxMoves, DEFAULTS.maxMoves, 100, 4000, "Move limit"),
        hungerLimit: integer(options.hungerLimit, DEFAULTS.hungerLimit, 30, 1000, "Hunger limit"),
        initialization: options.initialization || DEFAULTS.initialization,
        trainSeeds: [...(options.trainSeeds || DEFAULTS.trainSeeds)],
        mutationRate: number(options.mutationRate, DEFAULTS.mutationRate, 0, 1, "Mutation rate"),
        mutationScale: number(options.mutationScale, DEFAULTS.mutationScale, 0, 5, "Mutation scale"),
        finalMutationScale: number(options.finalMutationScale, DEFAULTS.finalMutationScale, 0, 5, "Final mutation scale"),
        eliteFraction: number(options.eliteFraction, DEFAULTS.eliteFraction, 0, .5, "Elite fraction"),
        parentFraction: number(options.parentFraction, DEFAULTS.parentFraction, .05, 1, "Parent fraction"),
        immigrantRate: number(options.immigrantRate, DEFAULTS.immigrantRate, 0, 1, "Random immigrant rate"),
        stepBudget: options.stepBudget === undefined ? null
          : integer(options.stepBudget, 500000, 1000, 10000000, "Training move budget"),
      };
      if (this.config.eliteFraction > this.config.parentFraction) throw new Error("Elite fraction cannot exceed parent fraction.");
      if (!["random", "current", "heuristic"].includes(this.config.initialization)) {
        throw new Error("Choose random weights, the current model, or the explicit heuristic starter.");
      }
      if (this.config.trainSeeds.length < 1 || this.config.trainSeeds.length > 8 ||
          !this.config.trainSeeds.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) {
        throw new Error("Supply between 1 and 8 valid training seeds.");
      }
      this.rng = E.random(this.config.seed);
      this.history = [];
      this.generation = 0;
      this.candidate = 0;
      this.episode = 0;
      this.evaluatedGames = 0;
      this.simulatedMoves = 0;
      this.rankings = [];
      this.partialFitness = 0;
      this.partialFood = 0;
      this.best = null;
      this.done = false;
      this.initialWeights = this.config.initialization === "current"
        ? validateWeights(options.initialWeights)
        : this.config.initialization === "heuristic" ? E.heuristicWeights() : null;
      this.population = Array.from({ length: this.config.population }, (_, i) =>
        this.initialWeights
          ? (i === 0 ? [...this.initialWeights] : this.mutate(this.initialWeights, i < 16 ? .8 : 2.5, .45))
          : this.randomWeights());
    }

    normal() {
      return Math.sqrt(-2 * Math.log(Math.max(1e-12, this.rng()))) * Math.cos(2 * Math.PI * this.rng());
    }

    randomWeights() {
      return Array.from({ length: E.WEIGHT_COUNT }, (_, i) => {
        const bias = (i >= 144 && i < 160) || i >= 208;
        return this.normal() * (bias ? .2 : .7);
      });
    }

    mutate(weights, sigma, probability = this.config.mutationRate) {
      return weights.map((w) => Math.max(-1000, Math.min(1000,
        w + (this.rng() < probability ? this.normal() * sigma : 0))));
    }

    // One full game per advance keeps pause/cancel responsive in every runtime.
    advance() {
      if (this.done) return false;
      const remaining = this.config.stepBudget === null ? Infinity : this.config.stepBudget - this.simulatedMoves;
      const run = E.simulate(this.population[this.candidate], {
        seed: this.config.trainSeeds[this.episode], maxMoves: Math.min(remaining, this.config.maxMoves),
        hungerLimit: this.config.hungerLimit,
      }, false);
      this.evaluatedGames++;
      this.simulatedMoves += run.moves;
      // A budget-truncated game cannot be compared with a complete candidate evaluation.
      if (remaining < this.config.maxMoves && run.reason === "Move limit reached") {
        this.done = true;
        return true;
      }
      this.partialFitness += run.fitness;
      this.partialFood += run.score;
      this.episode++;
      if (this.episode < this.config.trainSeeds.length) {
        this.done = this.config.stepBudget !== null && this.simulatedMoves >= this.config.stepBudget;
        return this.done;
      }

      const candidate = {
        weights: this.population[this.candidate],
        fitness: this.partialFitness / this.config.trainSeeds.length,
        food: this.partialFood / this.config.trainSeeds.length,
      };
      this.rankings.push(candidate);
      if (!this.best || candidate.fitness > this.best.fitness) {
        this.best = { weights: [...candidate.weights], fitness: candidate.fitness, food: candidate.food,
          generation: this.generation + 1 };
      }
      this.candidate++;
      this.episode = 0;
      this.partialFitness = this.partialFood = 0;
      if (this.candidate < this.config.population) {
        this.done = this.config.stepBudget !== null && this.simulatedMoves >= this.config.stepBudget;
        return this.done;
      }

      this.rankings.sort((a, b) => b.fitness - a.fitness);
      const leader = this.rankings[0];
      if (!this.best || leader.fitness > this.best.fitness) {
        this.best = { weights: [...leader.weights], fitness: leader.fitness, food: leader.food,
          generation: this.generation + 1 };
      }
      this.generation++;
      this.history.push({
        generation: this.generation, fitness: this.best.fitness,
        meanFitness: this.rankings.reduce((n, candidate) => n + candidate.fitness, 0) / this.config.population,
        meanFood: this.best.food,
      });
      if (this.generation >= this.config.generations ||
          this.config.stepBudget !== null && this.simulatedMoves >= this.config.stepBudget) {
        this.done = true;
        return true;
      }
      const parentCount = Math.max(4, Math.floor(this.config.population * this.config.parentFraction));
      const parents = this.rankings.slice(0, parentCount);
      const elites = this.config.eliteFraction === 0 ? 0
        : Math.max(2, Math.floor(this.config.population * this.config.eliteFraction));
      const next = parents.slice(0, elites).map((p) => [...p.weights]);
      const fraction = this.config.stepBudget === null ? this.generation / this.config.generations
        : this.simulatedMoves / this.config.stepBudget;
      const sigma = fraction < .6 ? this.config.mutationScale : this.config.finalMutationScale;
      while (next.length < this.config.population) {
        if (this.rng() < this.config.immigrantRate) {
          next.push(this.randomWeights());
          continue;
        }
        const a = parents[Math.floor(this.rng() * parents.length)].weights;
        const b = parents[Math.floor(this.rng() * parents.length)].weights;
        const child = a.map((w, i) => this.rng() < .5 ? w : b[i]);
        next.push(this.mutate(child, sigma));
      }
      this.population = next;
      this.rankings = [];
      this.candidate = 0;
      return true;
    }

    checkpoint() {
      if (!this.best) return null;
      return {
        name: `Evolution · generation ${this.generation}`,
        algorithm: "evolution", outputActivation: "sigmoid",
        architecture: [...E.SHAPE], seed: this.config.seed,
        population: this.config.population, generations: this.generation,
        initialization: this.config.initialization,
        method: `Genetic evolution from ${this.config.initialization === "random" ? "random weights" : this.config.initialization === "current" ? "the selected model" : "an explicit heuristic starter"}`,
        trainSeeds: [...this.config.trainSeeds],
        evaluatedGames: this.evaluatedGames, simulatedMoves: this.simulatedMoves,
        bestGeneration: this.best.generation,
        hyperparameters: Object.fromEntries(Object.entries(this.config).filter(([, value]) =>
          typeof value === "number" || typeof value === "string")),
        history: this.history.map((point) => ({ ...point })),
        weights: [...this.best.weights],
      };
    }

    snapshot(includeCheckpoint = true) {
      return {
        algorithm: "evolution", generation: this.generation, targetGenerations: this.config.generations,
        evaluatedGames: this.evaluatedGames, simulatedMoves: this.simulatedMoves,
        evaluatedInGeneration: this.candidate * this.config.trainSeeds.length + this.episode,
        gamesPerGeneration: this.config.population * this.config.trainSeeds.length,
        bestFitness: this.best?.fitness ?? null, bestFood: this.best?.food ?? null,
        done: this.done, history: this.history.map((point) => ({ ...point })),
        checkpoint: includeCheckpoint ? this.checkpoint() : undefined,
      };
    }
  }

  return Object.freeze({ DEFAULTS, Evolution, validateWeights, validatePolicy, integer, number });
});
