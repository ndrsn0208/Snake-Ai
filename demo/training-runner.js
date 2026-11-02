/* Cooperative scheduling and pause/resume shared by workers and fallback mode. */
(function (root, factory) {
  const T = typeof module === "object" && module.exports ? require("./evolution.js") : root.SnakeEvolution;
  const X = typeof module === "object" && module.exports ? require("./experiment.js") : root.SnakeExperiment;
  const core = factory(T, X);
  const api = Object.freeze({ ...core, workerSource: `const SnakeTrainingRunner = (${factory.toString()})(SnakeEvolution, SnakeExperiment);` });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SnakeTrainingRunner = api;
})(globalThis, function (T, X) {
  "use strict";
  function createRunner(emit, options = {}) {
    const now = options.now || (() => performance.now());
    const schedule = options.schedule || ((callback) => setTimeout(callback, 0));
    const cancel = options.cancel || ((handle) => clearTimeout(handle));
    const budget = options.budgetMs || 12;
    let trainer = null;
    let state = "idle";
    let timer = null;
    let elapsed = 0;
    let activeSince = 0;
    let lastUpdate = 0;
    function elapsedMs() { return elapsed + (state === "running" ? now() - activeSince : 0); }
    function report(checkpoint = true) {
      emit({ type: "progress", state, elapsedMs: elapsedMs(), ...(trainer ? trainer.snapshot(checkpoint) : {}) });
      lastUpdate = now();
    }
    function stopClock() {
      if (state === "running") elapsed += Math.max(0, now() - activeSince);
      if (timer !== null) cancel(timer);
      timer = null;
    }
    function pump() {
      timer = null;
      if (state !== "running") return;
      try {
        const started = now();
        let generationChanged = false;
        do {
          generationChanged = trainer.advance() || generationChanged;
        } while (!trainer.done && now() - started < budget);
        if (trainer.done) {
          stopClock();
          state = "completed";
          report(true);
          return;
        }
        if (generationChanged || now() - lastUpdate >= 100) report(generationChanged);
        timer = schedule(pump);
      } catch (error) {
        stopClock();
        state = "error";
        emit({ type: "error", message: error.message || String(error) });
      }
    }
    return {
      start(config) {
        stopClock();
        trainer = config.algorithm ? new X.Experiment(config) : new T.Evolution(config);
        elapsed = 0;
        activeSince = now();
        state = "running";
        report(false);
        timer = schedule(pump);
      },
      pause() {
        if (state !== "running") return;
        stopClock();
        state = "paused";
        report(true);
      },
      resume() {
        if (state !== "paused") return;
        activeSince = now();
        state = "running";
        report(false);
        timer = schedule(pump);
      },
      stop() {
        if (!["running", "paused"].includes(state)) return;
        stopClock();
        state = "stopped";
        report(true);
      },
      dispose() {
        stopClock();
        state = "disposed";
      },
      getState() { return state; },
    };
  }
  return Object.freeze({ createRunner });
});
