/* Deterministic headless Snake and the 9→16→3 network used by the 2019 trainer. */
(function (root, factory) {
  const core = factory();
  const api = Object.freeze({ ...core, workerSource: `const SnakeEngine = (${factory.toString()})();` });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SnakeEngine = api;
})(globalThis, function () {
  "use strict";
  const SHAPE = [9, 16, 3];
  const ACTIONS = ["Left", "Right", "Straight"];
  const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const INPUTS = [
    "Wall left", "Body left", "Food left",
    "Wall right", "Body right", "Food right",
    "Wall ahead", "Body ahead", "Food ahead",
  ];
  const WEIGHT_COUNT = 9 * 16 + 16 + 16 * 3 + 3;

  function random(seed) {
    let state = Number(seed) >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function feedForward(network, input) {
    const weights = network.weights || network;
    const linear = network.outputActivation === "linear";
    if (weights.length !== WEIGHT_COUNT || input.length !== 9) {
      throw new Error("Expected a 9→16→3 network.");
    }
    const hidden = new Array(16);
    for (let row = 0; row < 16; row++) {
      let z = weights[144 + row];
      for (let col = 0; col < 9; col++) z += weights[row * 9 + col] * input[col];
      hidden[row] = 1 / (1 + Math.exp(-z));
    }
    const output = new Array(3);
    for (let row = 0; row < 3; row++) {
      let z = weights[208 + row];
      for (let col = 0; col < 16; col++) z += weights[160 + row * 16 + col] * hidden[col];
      output[row] = linear ? z : 1 / (1 + Math.exp(-z));
    }
    let action = 0;
    for (let i = 1; i < 3; i++) if (output[i] > output[action]) action = i;
    return { hidden, output, action };
  }

  function heuristicWeights() {
    const weights = Array(WEIGHT_COUNT).fill(0);
    for (let i = 0; i < 9; i++) {
      weights[i * 9 + i] = 8;
      weights[144 + i] = -4;
    }
    for (let action = 0; action < 3; action++) {
      weights[160 + action * 16 + action * 3] = -20;
      weights[160 + action * 16 + action * 3 + 1] = -20;
      weights[160 + action * 16 + action * 3 + 2] = 4;
      weights[208 + action] = action === 2 ? .2 : 0;
    }
    return weights;
  }

  class Game {
    constructor({ seed = 1, size = 20, maxMoves = 2000, hungerLimit = 250 } = {}) {
      if (!Number.isInteger(size) || size < 8 || size > 40) throw new Error("Board size must be 8–40.");
      this.seed = seed >>> 0;
      this.size = size;
      this.rng = random(this.seed);
      this.maxMoves = maxMoves;
      this.hungerLimit = hungerLimit;
      const x = Math.max(5, Math.floor(size / 2));
      const y = Math.floor(size / 2);
      this.body = Array.from({ length: 6 }, (_, i) => (x - i) + y * size);
      this.direction = 1;
      this.food = null;
      this.score = 0;
      this.moves = 0;
      this.hunger = 0;
      this.distanceReward = 0;
      this.reason = null;
      this.collision = null;
      this.spawnFood();
    }

    xy(cell) { return [cell % this.size, Math.floor(cell / this.size)]; }

    spawnFood() {
      const occupied = new Set(this.body);
      const free = [];
      for (let cell = 0; cell < this.size ** 2; cell++) if (!occupied.has(cell)) free.push(cell);
      if (!free.length) {
        this.food = null;
        this.reason = "Board cleared";
        return;
      }
      this.food = free[Math.floor(this.rng() * free.length)];
    }

    nextCell(direction) {
      const [x, y] = this.xy(this.body[0]);
      const [dx, dy] = DELTAS[direction];
      return { x: x + dx, y: y + dy, cell: x + dx + (y + dy) * this.size };
    }

    features() {
      const [hx, hy] = this.xy(this.body[0]);
      const [fx, fy] = this.food === null ? [hx, hy] : this.xy(this.food);
      const body = new Set(this.body.slice(0, -1));
      const inputs = [];
      for (const direction of [(this.direction + 3) % 4, (this.direction + 1) % 4, this.direction]) {
        const next = this.nextCell(direction);
        const [dx, dy] = DELTAS[direction];
        const wall = next.x < 0 || next.y < 0 || next.x >= this.size || next.y >= this.size;
        inputs.push(wall ? 1 : 0, !wall && body.has(next.cell) ? 1 : 0,
          this.food !== null && ((fx - hx) * dx + (fy - hy) * dy > 0) ? 1 : 0);
      }
      return inputs;
    }

    move(action) {
      if (this.reason) return { ate: false, done: true };
      if (![0, 1, 2].includes(action)) throw new Error("Choose left, right, or straight.");
      this.direction = (this.direction + (action === 0 ? 3 : action === 1 ? 1 : 0)) % 4;
      const next = this.nextCell(this.direction);
      this.moves++;
      const wall = next.x < 0 || next.y < 0 || next.x >= this.size || next.y >= this.size;
      const ate = !wall && next.cell === this.food;
      const occupied = this.body.slice(0, ate ? this.body.length : -1);
      if (wall || occupied.includes(next.cell)) {
        this.reason = wall ? "Wall collision" : "Body collision";
        this.collision = { x: next.x, y: next.y };
        return { ate: false, done: true };
      }
      const [hx, hy] = this.xy(this.body[0]);
      const [fx, fy] = this.xy(this.food);
      const previousDistance = Math.hypot(fx - hx, fy - hy);
      const nextDistance = Math.hypot(fx - next.x, fy - next.y);
      this.distanceReward += nextDistance < previousDistance ? 1 : nextDistance > previousDistance ? -1.5 : 0;
      this.body.unshift(next.cell);
      if (ate) {
        this.score++;
        this.hunger = 0;
        this.spawnFood();
      } else {
        this.body.pop();
        this.hunger++;
      }
      if (!this.reason && this.hunger >= this.hungerLimit) this.reason = "No food for too long";
      if (!this.reason && this.moves >= this.maxMoves) this.reason = "Move limit reached";
      return { ate, done: Boolean(this.reason) };
    }

    snapshot(decision) {
      return {
        body: [...this.body], food: this.food, direction: this.direction,
        score: this.score, moves: this.moves, reason: this.reason,
        collision: this.collision ? { ...this.collision } : null,
        inputs: decision?.inputs || null, hidden: decision?.hidden || null,
        output: decision?.output || null, action: decision?.action ?? null,
      };
    }
  }

  function simulate(network, options = {}, record = true) {
    const game = new Game(options);
    const frames = [];
    const events = [];
    while (!game.reason) {
      const inputs = game.features();
      const decision = feedForward(network, inputs);
      if (record) frames.push(game.snapshot({ inputs, ...decision }));
      const result = game.move(decision.action);
      if (result.ate) events.push(game.moves);
    }
    if (record) frames.push(game.snapshot(null));
    const fitness = game.score * 120 + game.distanceReward * .4 + game.moves * .025
      - (game.reason.includes("collision") ? 35 : 0);
    return {
      seed: game.seed, size: game.size, frames, events, score: game.score,
      moves: game.moves, reason: game.reason, fitness,
    };
  }

  return Object.freeze({ SHAPE, ACTIONS, INPUTS, WEIGHT_COUNT, random, feedForward,
    heuristicWeights, Game, simulate });
});
