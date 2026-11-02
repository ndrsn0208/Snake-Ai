(function () {
  "use strict";
  const root = document.getElementById("snake-lab");
  if (!root) return;
  const E = globalThis.SnakeEngine;
  const T = globalThis.SnakeEvolution;
  const D = globalThis.SnakeDQN;
  const X = globalThis.SnakeExperiment;
  const Runner = globalThis.SnakeTrainingRunner;
  const $ = (id) => root.querySelector(`#${id}`);
  const names = { evolution: "Evolution", dqn: "DQN" };
  const compact = (n) => n >= 1000000 ? `${+(n / 1000000).toFixed(2)}m`
    : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n);
  let job = null;
  let jobNumber = 0;
  let state = "idle";
  let progress = null;
  let models = {};
  let curves = { evolution: [], dqn: [] };
  let runs = {};
  let runConfig = null;
  let source = "empty";
  let chartSignature = "";
  let pendingRender = 0;
  let selectionTouched = false;

  function workerMain() {
    const runner = SnakeTrainingRunner.createRunner((message) => self.postMessage(message), { budgetMs: 14 });
    self.addEventListener("message", (event) => {
      try {
        const message = event.data;
        if (message.type === "start") runner.start(message.config);
        else if (message.type === "pause") runner.pause();
        else if (message.type === "resume") runner.resume();
        else if (message.type === "stop") runner.stop();
      } catch (error) {
        self.postMessage({ type: "error", message: error.message || String(error) });
      }
    });
    self.postMessage({ type: "ready" });
  }

  function disposeJob() {
    if (!job) return;
    clearTimeout(job.timer);
    job.worker?.terminate();
    job.runner?.dispose();
    if (job.url) URL.revokeObjectURL(job.url);
    job = null;
  }

  function selectedModel() {
    const key = $("snake-result-model").value;
    const model = models[key];
    return model ? { ...model, learningCurve: curves[key].map((p) => ({ ...p })) } : null;
  }

  function controls() {
    const active = ["starting", "running", "paused"].includes(state);
    const method = $("snake-training-method").value;
    $("snake-training-start").disabled = active;
    $("snake-training-start").textContent = method === "compare" ? "Train both methods" : `Train ${names[method]}`;
    $("snake-training-pause").disabled = !["running", "paused"].includes(state);
    $("snake-training-pause").textContent = state === "paused" ? "Resume training" : "Pause training";
    $("snake-training-stop").disabled = !active;
    $("snake-evolution-parameters").hidden = method === "dqn";
    $("snake-dqn-parameters").hidden = method === "evolution";
    for (const field of $("snake-training-form").querySelectorAll("input, select")) {
      field.disabled = active || Boolean(field.closest("section[hidden]"));
    }
    for (const option of $("snake-result-model").options) option.disabled = !models[option.value];
    $("snake-result-model").disabled = !Object.keys(models).length;
    if (!selectedModel()) $("snake-result-model").value = Object.keys(models).at(-1) || "dqn";
    $("snake-training-watch").disabled = $("snake-training-download").disabled = !selectedModel();
    $("snake-curves-download").disabled = !Object.values(curves).some((points) => points.length);
    $("snake-recorded-load").hidden = !globalThis.SnakeComparison;
    $("snake-recorded-load").disabled = active || source === "recorded";
    const labels = { idle: "Ready", starting: "Starting", running: `Training ${names[progress?.algorithm] || ""}`,
      paused: "Paused", stopped: "Stopped", completed: "Complete", error: "Error" };
    $("snake-training-status").textContent = labels[state] || state;
    root.dataset.trainingState = state;
    root.dataset.trainingAlgorithm = progress?.algorithm || "";
  }

  function drawChart() {
    const target = $("snake-training-chart");
    const all = Object.values(curves).flat();
    if (!all.length) {
      const empty = document.createElement("p");
      empty.textContent = "Start training to compare real checkpoint scores.";
      target.replaceChildren(empty);
      return;
    }
    const ns = "http://www.w3.org/2000/svg";
    const width = Math.max(200, target.clientWidth);
    const height = 310;
    const left = 48, right = width - 14, top = 34, bottom = height - 60;
    const maxSteps = Math.max(1, runConfig?.stepBudget || 0, ...all.map((p) => p.steps));
    const high = Math.max(5, Math.ceil(Math.max(...all.map((p) => p.meanFood)) / 5) * 5);
    const x = (steps) => left + steps / maxSteps * (right - left);
    const y = (food) => bottom - food / high * (bottom - top);
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    const description = Object.entries(curves).filter(([, p]) => p.length).map(([key, p]) =>
      `${names[key]}: ${p[0].meanFood.toFixed(1)} initially, ${p.at(-1).meanFood.toFixed(1)} at ${p.at(-1).steps} moves`).join(". ");
    svg.setAttribute("aria-label", `Mean food per validation game versus training moves. ${description}`);
    const add = (tag, attributes, text, parent = svg) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      parent.append(node);
      return node;
    };
    add("title", {}, "Evolution and DQN learning curves");
    add("desc", {}, description);
    add("text", { x: left, y: 18, class: "axis-title", "data-axis": "y" }, "Food / game");
    for (let i = 0; i < 4; i++) {
      const value = high * i / 3;
      add("line", { x1: left, x2: right, y1: y(value), y2: y(value), stroke: "var(--snake-line)", "stroke-width": 1 });
      add("text", { x: left - 9, y: y(value) + 5, "text-anchor": "end" }, value.toFixed(0));
    }
    for (const value of [0, maxSteps / 2, maxSteps]) {
      add("text", { x: x(value), y: bottom + 26,
        "text-anchor": value === 0 ? "start" : value === maxSteps ? "end" : "middle" }, compact(value));
    }
    add("text", { x: (left + right) / 2, y: height - 6, "text-anchor": "middle",
      class: "axis-title", "data-axis": "x" }, "Training moves");
    for (const [key, points] of Object.entries(curves)) {
      if (!points.length) continue;
      const color = key === "evolution" ? "var(--snake-accent)" : "var(--snake-food)";
      add("polyline", { "data-series": key, points: points.map((p) => `${x(p.steps)},${y(p.meanFood)}`).join(" "),
        fill: "none", stroke: color, "stroke-width": 2.75, "stroke-linejoin": "round",
        "stroke-dasharray": key === "dqn" ? "7 4" : "none" });
      const last = points.at(-1);
      add(key === "dqn" ? "rect" : "circle", key === "dqn"
        ? { x: x(last.steps) - 3, y: y(last.meanFood) - 3, width: 6, height: 6, fill: color }
        : { cx: x(last.steps), cy: y(last.meanFood), r: 3.5, fill: color });
    }
    const guide = add("line", { y1: top, y2: bottom, stroke: "var(--snake-muted)", "stroke-width": 1, visibility: "hidden" });
    const hit = add("rect", { x: left, y: top, width: right - left, height: bottom - top, fill: "transparent" });
    const tooltip = document.createElement("div");
    tooltip.className = "snake-chart-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    function inspect(event) {
      const bounds = svg.getBoundingClientRect();
      const px = Math.max(left, Math.min(right, (event.clientX - bounds.left) * width / bounds.width));
      const steps = (px - left) / (right - left) * maxSteps;
      guide.setAttribute("x1", px);
      guide.setAttribute("x2", px);
      guide.setAttribute("visibility", "visible");
      tooltip.replaceChildren();
      for (const [key, points] of Object.entries(curves)) {
        if (!points.length || steps > points.at(-1).steps + maxSteps * .025) continue;
        const nearest = points.reduce((a, b) => Math.abs(a.steps - steps) < Math.abs(b.steps - steps) ? a : b);
        const line = document.createElement("p");
        line.textContent = `${names[key]}: ${nearest.meanFood.toFixed(1)} at ${compact(nearest.steps)}`;
        tooltip.append(line);
      }
      tooltip.hidden = !tooltip.children.length;
      tooltip.style.top = "38px";
      tooltip.style.left = `${Math.max(6, Math.min(px + 10, width - tooltip.offsetWidth - 6))}px`;
    }
    hit.addEventListener("pointermove", inspect);
    hit.addEventListener("pointerdown", inspect);
    hit.addEventListener("pointerleave", () => { tooltip.hidden = true; guide.setAttribute("visibility", "hidden"); });
    target.replaceChildren(svg, tooltip);
  }

  function render() {
    pendingRender = 0;
    controls();
    $("snake-training-stats").hidden = !progress;
    $("snake-training-progress").hidden = !progress;
    const budget = progress?.stepBudget || runConfig?.stepBudget || Number($("snake-training-budget").value);
    const steps = progress?.simulatedMoves || 0;
    $("snake-training-generation").textContent = `${compact(steps)} / ${compact(budget)}`;
    $("snake-training-games").textContent = (progress?.evaluatedGames || 0).toLocaleString("en-US");
    $("snake-training-food").textContent = progress?.bestFood == null ? "—" : progress.bestFood.toFixed(1);
    $("snake-training-time").textContent = `${((progress?.elapsedMs || 0) / 1000).toFixed(1)}s`;
    const percent = Math.min(100, Math.max(0, (progress?.progressFraction || 0) * 100));
    $("snake-training-progress").firstElementChild.style.width = `${percent}%`;
    $("snake-training-progress").setAttribute("aria-valuenow", percent.toFixed(1));
    root.dataset.trainingGeneration = String(progress?.generation || 0);
    root.dataset.trainingGames = String(progress?.evaluatedGames || 0);
    root.dataset.trainingMoves = String(steps);
    if (progress) {
      const detail = progress.algorithm === "dqn"
        ? `${progress.updates.toLocaleString("en-US")} gradient updates · ε ${progress.epsilon.toFixed(3)} · loss ${progress.loss == null ? "—" : progress.loss.toFixed(3)}`
        : `Generation ${progress.generation} / ${progress.targetGenerations}`;
      $("snake-training-detail").textContent = `${names[progress.algorithm]} · run ${progress.runIndex + 1} of ${progress.runCount} · ${detail}`;
    }
    const signature = `${source}:` + Object.entries(curves).map(([k, p]) => `${k}:${p.length}:${p.at(-1)?.steps}`).join("|");
    if (chartSignature !== signature) { chartSignature = signature; drawChart(); }
  }

  function summary() {
    const best = Object.entries(models).map(([key, model]) =>
      `${names[key]} best: ${model.validationMeanFood.toFixed(1)} food/game`).join(" · ");
    if (source === "recorded") {
      $("snake-training-summary").textContent = `Recorded run from random weights, seed ${runConfig.seed}. ${best}. Select a checkpoint to watch it play, or train a new run.`;
    } else {
      const intro = state === "completed" ? "Training complete."
        : state === "paused" ? "Paused. Resume continues the same run."
          : state === "stopped" ? "Stopped. Evaluated checkpoints are still available."
            : `${names[progress?.algorithm] || "Training"} is learning.`;
      $("snake-training-summary").textContent = `${intro} ${best}`;
    }
  }

  function fail(message) {
    disposeJob();
    state = "error";
    $("snake-training-error").hidden = false;
    $("snake-training-error").textContent = message;
    render();
  }

  function accept(message, id) {
    if (!job || job.id !== id) return;
    if (message.type === "error") { fail(message.message); return; }
    if (message.type !== "progress") return;
    const previousState = state;
    progress = message;
    state = message.state;
    curves = message.curves;
    runs = message.runs;
    if (message.models) {
      models = message.models;
      if (!selectionTouched && models[message.algorithm]) $("snake-result-model").value = message.algorithm;
      summary();
    } else if (previousState !== state) summary();
    if (!pendingRender) pendingRender = requestAnimationFrame(render);
    if (state === "completed") {
      try {
        for (const [key, model] of Object.entries(models)) {
          globalThis.SnakeApp.usePolicy({ ...model, learningCurve: curves[key] }, false);
        }
        if (selectedModel()) globalThis.SnakeApp.usePolicy(selectedModel());
      } catch (error) { fail(`Training finished, but the model could not be loaded: ${error.message}`); return; }
      disposeJob();
      summary();
      render();
    } else if (state === "stopped") {
      disposeJob();
      summary();
      render();
    }
  }

  function startFallback(config, id) {
    if (!job || job.id !== id) return;
    job.worker?.terminate();
    job.worker = null;
    if (job.url) URL.revokeObjectURL(job.url);
    job.url = null;
    clearTimeout(job.timer);
    $("snake-training-runtime").textContent = "Compatibility mode: training yields to keep controls responsive.";
    job.runner = Runner.createRunner((message) => accept(message, id), { budgetMs: 4 });
    try { job.runner.start(config); } catch (error) { fail(error.message); }
  }

  function start(config) {
    disposeJob();
    const id = ++jobNumber;
    job = { id, worker: null, runner: null, url: null, timer: null };
    state = "starting";
    progress = null;
    models = {};
    curves = { evolution: [], dqn: [] };
    runs = {};
    runConfig = config;
    source = "live";
    selectionTouched = false;
    chartSignature = "";
    $("snake-training-error").hidden = true;
    $("snake-curve-source").textContent = `Live run · seed ${config.seed}`;
    $("snake-curve-note").textContent = "Eight shared validation maps. Lines show actual checkpoint scores, without smoothing.";
    $("snake-training-summary").textContent = config.initialization === "random"
      ? "Initializing independent models with random weights."
      : "Starting from the selected model. DQN uses a fresh optimizer and replay buffer.";
    render();
    try {
      const sourceCode = [E.workerSource, T.workerSource, D.workerSource, X.workerSource,
        Runner.workerSource, `(${workerMain.toString()})();`].join("\n");
      job.url = URL.createObjectURL(new Blob([sourceCode], { type: "text/javascript" }));
      const worker = new Worker(job.url);
      job.worker = worker;
      let ready = false;
      worker.onmessage = (event) => {
        if (!job || job.id !== id || job.worker !== worker) return;
        if (event.data.type === "ready") {
          ready = true;
          clearTimeout(job.timer);
          URL.revokeObjectURL(job.url);
          job.url = null;
          $("snake-training-runtime").textContent = "Training in a background worker. Gameplay stays responsive.";
          worker.postMessage({ type: "start", config });
        } else accept(event.data, id);
      };
      worker.onerror = (event) => {
        if (!job || job.id !== id || job.worker !== worker) return;
        event.preventDefault();
        if (!ready) startFallback(config, id);
        else fail(`Training worker stopped: ${event.message || "unknown error"}`);
      };
      job.timer = setTimeout(() => { if (!ready) startFallback(config, id); }, 1500);
    } catch { startFallback(config, id); }
  }

  function command(type) {
    if (type === "stop" && state === "starting") {
      disposeJob();
      state = "stopped";
      summary();
      render();
      return;
    }
    if (job?.worker) job.worker.postMessage({ type });
    else if (job?.runner) job.runner[type]();
  }

  const fields = {
    stepBudget: "budget", seed: "seed", population: "population", generations: "generations",
    mutationRate: "mutation-rate", mutationScale: "mutation-scale", finalMutationScale: "final-scale",
    eliteFraction: "elite", parentFraction: "parents", immigrantRate: "immigrants",
    learningRate: "lr", gamma: "gamma", batchSize: "batch", replayCapacity: "replay",
    epsilonStart: "epsilon-start", epsilonEnd: "epsilon-end", epsilonDecaySteps: "decay",
    warmupSteps: "warmup", trainEvery: "frequency", targetEvery: "target",
    foodReward: "food-reward", deathReward: "death-reward", distanceReward: "distance-reward", stepReward: "step-reward",
    maxMoves: "max-moves", hungerLimit: "hunger", evaluationEvery: "evaluate",
  };
  $("snake-training-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const config = {
        algorithm: $("snake-training-method").value,
        initialization: $("snake-training-init").value,
        ...Object.fromEntries(Object.entries(fields).map(([key, suffix]) => [key, Number($(`snake-training-${suffix}`).value)])),
      };
      if (config.initialization === "current") config.initialWeights = globalThis.SnakeApp.getPolicy().weights;
      new X.Experiment(config);
      start(config);
    } catch (error) { fail(error.message); }
  });
  $("snake-training-method").addEventListener("change", () => {
    const descriptions = {
      compare: "Compare genetic evolution with gradient-based DQN. Both get the same move budget and the same validation maps.",
      evolution: "Evolve a population using selection, crossover, and mutation. No gradient updates.",
      dqn: "Learn from game experience with Double DQN, gradient updates, and a target network.",
    };
    $("snake-training-description").textContent = descriptions[$("snake-training-method").value];
    controls();
  });
  $("snake-training-pause").addEventListener("click", () => command(state === "paused" ? "resume" : "pause"));
  $("snake-training-stop").addEventListener("click", () => command("stop"));
  $("snake-result-model").addEventListener("change", () => { selectionTouched = true; controls(); });
  $("snake-training-watch").addEventListener("click", () => {
    const model = selectedModel();
    if (!model) return;
    try {
      globalThis.SnakeApp.usePolicy(model);
      $("snake-model-toolbar").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    } catch (error) { fail(error.message); }
  });
  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  $("snake-training-download").addEventListener("click", () => {
    const model = selectedModel();
    if (model) download(model, `snake-ai-${model.algorithm}-${model.selectedAtSteps ?? model.simulatedMoves}-moves.json`);
  });
  $("snake-curves-download").addEventListener("click", () => download({
    formatVersion: 1, source, seed: runConfig.seed,
    evaluationSeeds: progress?.evaluationSeeds || globalThis.SnakeComparison?.evaluationSeeds || X.EVALUATION_SEEDS,
    evaluationEvery: runConfig.evaluationEvery, curves, runs,
    note: "Unsmoothed mean food on fixed validation maps. Evaluation games do not update weights. Each line shows the current policy at that checkpoint.",
  }, `snake-ai-learning-curves-${runConfig.seed}.json`));
  function loadRecorded() {
    const saved = globalThis.SnakeComparison;
    if (!saved) return;
    source = "recorded";
    state = "idle";
    progress = null;
    models = structuredClone(saved.models);
    curves = structuredClone(saved.curves);
    runs = structuredClone(saved.runs);
    runConfig = { seed: saved.seed, stepBudget: Math.max(...Object.values(runs).map((r) => r.steps)),
      evaluationEvery: saved.evaluationEvery };
    $("snake-result-model").value = models.dqn ? "dqn" : "evolution";
    $("snake-curve-source").textContent = `Recorded run · ${compact(runConfig.stepBudget)} moves each`;
    $("snake-curve-note").textContent = "Eight shared validation maps · one training seed · unsmoothed scores. Best checkpoints can differ from final points.";
    $("snake-training-error").hidden = true;
    $("snake-training-detail").textContent = "The chart below is a saved training run. Start a new run with the controls above.";
    chartSignature = "";
    summary();
    render();
  }
  $("snake-recorded-load").addEventListener("click", loadRecorded);
  new ResizeObserver(drawChart).observe($("snake-training-chart"));
  window.addEventListener("pagehide", disposeJob);
  if (globalThis.SnakeComparison) loadRecorded();
  else render();
})();
