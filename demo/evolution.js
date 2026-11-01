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
  });

  function integer(value, fallback, min, max, label) {
    const n = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
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
    return {
      name: String(value.name || "Imported model").slice(0, 160),
      architecture: [...E.SHAPE], weights,
      seed: Number.isInteger(value.seed) ? value.seed >>> 0 : 0,
      population: Number.isInteger(value.population) ? value.population : 0,
      generations: Number.isInteger(value.generations) ? value.generations : 0,
      initialization: String(value.initialization || "imported").slice(0, 100),
      method: String(value.method || "Imported neural-network weights").slice(0, 240),
      trainSeeds: Array.isArray(value.trainSeeds) ? value.trainSeeds.slice(0, 16) : [],
      evaluatedGames: Number.isFinite(value.evaluatedGames) ? value.evaluatedGames : 0,
      simulatedMoves: Number.isFinite(value.simulatedMoves) ? value.simulatedMoves : 0,
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
      };
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

    mutate(weights, sigma, probability = .14) {
      return weights.map((w) => Math.max(-1000, Math.min(1000,
        w + (this.rng() < probability ? this.normal() * sigma : 0))));
    }

    // One full game per advance keeps pause/cancel responsive in every runtime.
    advance() {
      if (this.done) return false;
      const run = E.simulate(this.population[this.candidate], {
        seed: this.config.trainSeeds[this.episode], maxMoves: this.config.maxMoves,
        hungerLimit: this.config.hungerLimit,
      }, false);
      this.evaluatedGames++;
      this.simulatedMoves += run.moves;
      this.partialFitness += run.fitness;
      this.partialFood += run.score;
      this.episode++;
      if (this.episode < this.config.trainSeeds.length) return false;

      this.rankings.push({
        weights: this.population[this.candidate],
        fitness: this.partialFitness / this.config.trainSeeds.length,
        food: this.partialFood / this.config.trainSeeds.length,
      });
      this.candidate++;
      this.episode = 0;
      this.partialFitness = this.partialFood = 0;
      if (this.candidate < this.config.population) return false;

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
      if (this.generation >= this.config.generations) {
        this.done = true;
        return true;
      }
      const parentCount = Math.max(4, Math.floor(this.config.population * .2));
      const parents = this.rankings.slice(0, parentCount);
      const elites = Math.max(2, Math.floor(this.config.population * .06));
      const next = parents.slice(0, elites).map((p) => [...p.weights]);
      const sigma = this.generation < this.config.generations * .6 ? .65 : .3;
      while (next.length < this.config.population) {
        if (!this.initialWeights && this.rng() < .05) {
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
        name: `Trained model · generation ${this.generation}`,
        architecture: [...E.SHAPE], seed: this.config.seed,
        population: this.config.population, generations: this.generation,
        initialization: this.config.initialization,
        method: `Genetic evolution from ${this.config.initialization === "random" ? "random weights" : this.config.initialization === "current" ? "the selected model" : "an explicit heuristic starter"}`,
        trainSeeds: [...this.config.trainSeeds],
        evaluatedGames: this.evaluatedGames, simulatedMoves: this.simulatedMoves,
        bestGeneration: this.best.generation,
        history: this.history.map((point) => ({ ...point })),
        weights: [...this.best.weights],
      };
    }

    snapshot(includeCheckpoint = true) {
      return {
        generation: this.generation, targetGenerations: this.config.generations,
        evaluatedGames: this.evaluatedGames, simulatedMoves: this.simulatedMoves,
        evaluatedInGeneration: this.candidate * this.config.trainSeeds.length + this.episode,
        gamesPerGeneration: this.config.population * this.config.trainSeeds.length,
        bestFitness: this.best?.fitness ?? null, bestFood: this.best?.food ?? null,
        done: this.done, history: this.history.map((point) => ({ ...point })),
        checkpoint: includeCheckpoint ? this.checkpoint() : undefined,
      };
    }
  }

  return Object.freeze({ DEFAULTS, Evolution, validateWeights, validatePolicy });
});
