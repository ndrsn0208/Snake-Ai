(function () {
  "use strict";
  const root = document.getElementById("snake-lab");
  if (!root) return;
  const E = globalThis.SnakeEngine;
  const T = globalThis.SnakeEvolution;
  const Runner = globalThis.SnakeTrainingRunner;
  const $ = (id) => root.querySelector(`#${id}`);
  let job = null;
  let jobNumber = 0;
  let state = "idle";
  let progress = null;
  let bestModel = null;
  let lastAnnouncedGeneration = -1;
  let chartGeneration = -1;
  let pendingRender = 0;

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

  function controls() {
    const active = ["starting", "running", "paused"].includes(state);
    $("snake-training-start").disabled = active;
    $("snake-training-pause").disabled = !["running", "paused"].includes(state);
    $("snake-training-pause").textContent = state === "paused" ? "Resume training" : "Pause training";
    $("snake-training-stop").disabled = !active;
    for (const field of $("snake-training-form").querySelectorAll("input, select")) field.disabled = active;
    $("snake-training-watch").disabled = $("snake-training-download").disabled = !bestModel;
    const labels = { idle: "Ready", starting: "Starting", running: "Training",
      paused: "Paused", stopped: "Stopped", completed: "Complete", error: "Error" };
    $("snake-training-status").textContent = labels[state] || state;
    root.dataset.trainingState = state;
  }

  function chart() {
    const target = $("snake-training-chart");
    const history = progress?.history || [];
    if (!history.length) {
      target.replaceChildren();
      const label = document.createElement("p");
      label.textContent = state === "running" || state === "starting"
        ? "Evaluating the first generation…" : "Start training to see real generation results.";
      target.append(label);
      return;
    }
    const ns = "http://www.w3.org/2000/svg";
    const width = Math.max(240, target.clientWidth);
    const height = 240;
    const left = width < 400 ? 55 : 70;
    const top = 20;
    const plotWidth = width - left - 20;
    const plotHeight = 172;
    const values = history.flatMap((p) => [p.fitness, p.meanFitness]);
    let low = Math.min(0, ...values);
    let high = Math.max(0, ...values);
    const padding = Math.max(1, (high - low) * .1);
    low -= padding;
    high += padding;
    const x = (generation) => left + generation / progress.targetGenerations * plotWidth;
    const y = (fitness) => top + (high - fitness) / (high - low) * plotHeight;
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("aria-label", `Fitness through generation ${progress.generation}; best ${progress.bestFitness.toFixed(1)}`);
    const add = (tag, attributes, text) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      svg.append(node);
      return node;
    };
    const format = (value) => Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
    for (let i = 0; i < 4; i++) {
      const value = low + i / 3 * (high - low);
      add("line", { x1: left, x2: width - 20, y1: y(value), y2: y(value), stroke: "var(--snake-line)", "stroke-width": 1 });
      add("text", { x: left - 8, y: y(value) + 5, "text-anchor": "end" }, format(value));
    }
    for (const generation of [0, Math.round(progress.targetGenerations / 2), progress.targetGenerations]) {
      add("text", { x: x(generation), y: top + plotHeight + 26,
        "text-anchor": generation === 0 ? "start" : generation === progress.targetGenerations ? "end" : "middle" }, generation);
    }
    for (const [field, colour] of [["meanFitness", "var(--snake-food)"], ["fitness", "var(--snake-accent)"]]) {
      add("polyline", {
        points: history.map((p) => `${x(p.generation)},${y(p[field])}`).join(" "),
        fill: "none", stroke: colour, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round",
      });
      const last = history.at(-1);
      add("circle", { cx: x(last.generation), cy: y(last[field]), r: 3.5, fill: colour });
    }
    add("text", { x: left + plotWidth / 2, y: 236, "text-anchor": "middle" }, "Generation");
    target.replaceChildren(svg);
  }

  function render() {
    pendingRender = 0;
    controls();
    if (!progress) {
      $("snake-training-generation").textContent = `0 / ${$("snake-training-generations").value}`;
      $("snake-training-games").textContent = "0";
      $("snake-training-food").textContent = "—";
      $("snake-training-time").textContent = "0.0s";
      $("snake-training-progress").firstElementChild.style.width = "0%";
      $("snake-training-progress").setAttribute("aria-valuenow", "0");
      chart();
      return;
    }
    $("snake-training-generation").textContent = `${progress.generation} / ${progress.targetGenerations}`;
    $("snake-training-games").textContent = progress.evaluatedGames.toLocaleString("en-US");
    $("snake-training-food").textContent = progress.bestFood === null ? "—" : progress.bestFood.toFixed(1);
    $("snake-training-time").textContent = `${(progress.elapsedMs / 1000).toFixed(1)}s`;
    const fraction = progress.done ? 1
      : (progress.generation + progress.evaluatedInGeneration / progress.gamesPerGeneration) / progress.targetGenerations;
    const percent = Math.min(100, Math.max(0, fraction * 100));
    $("snake-training-progress").firstElementChild.style.width = `${percent}%`;
    $("snake-training-progress").setAttribute("aria-valuenow", percent.toFixed(1));
    root.dataset.trainingGeneration = String(progress.generation);
    root.dataset.trainingGames = String(progress.evaluatedGames);
    root.dataset.trainingMoves = String(progress.simulatedMoves);
    if (chartGeneration !== progress.generation) {
      chartGeneration = progress.generation;
      chart();
    }
    if (lastAnnouncedGeneration !== progress.generation || state !== "running") {
      lastAnnouncedGeneration = progress.generation;
      const count = `${progress.evaluatedGames.toLocaleString("en-US")} games · ${progress.simulatedMoves.toLocaleString("en-US")} moves`;
      $("snake-training-summary").textContent = state === "completed"
        ? `Training complete. ${count}. Gameplay now uses your best model.`
        : state === "paused" ? `Paused without losing progress. ${count}.`
          : state === "stopped" ? `Stopped. The best completed generation is still available. ${count}.`
            : `${count}. Best food is averaged over ${bestModel?.trainSeeds.length || 3} training games.`;
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
    progress = message;
    state = message.state;
    if (message.checkpoint) bestModel = message.checkpoint;
    if (!pendingRender) pendingRender = requestAnimationFrame(render);
    if (state === "completed") {
      try { globalThis.SnakeApp.usePolicy(bestModel); }
      catch (error) { fail(`Training finished, but the model could not be loaded: ${error.message}`); return; }
      disposeJob();
      render();
    } else if (state === "stopped") {
      disposeJob();
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
    $("snake-training-runtime").textContent = "Compatibility mode: training yields regularly to keep the page responsive.";
    job.runner = Runner.createRunner((message) => accept(message, id), { budgetMs: 4 });
    try { job.runner.start(config); } catch (error) { fail(error.message); }
  }

  function start(config) {
    disposeJob();
    const id = ++jobNumber;
    job = { id, worker: null, runner: null, url: null, timer: null };
    state = "starting";
    progress = null;
    bestModel = null;
    lastAnnouncedGeneration = chartGeneration = -1;
    $("snake-training-error").hidden = true;
    $("snake-training-summary").textContent = config.initialization === "random"
      ? "Initializing a new population with random weights."
      : "Starting a new population from the selected gameplay model.";
    render();
    try {
      const source = [E.workerSource, T.workerSource, Runner.workerSource, `(${workerMain.toString()})();`].join("\n");
      job.url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
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
          $("snake-training-runtime").textContent = "Training in a background worker. Gameplay controls stay responsive.";
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
    } catch {
      startFallback(config, id);
    }
  }

  function command(type) {
    if (type === "stop" && state === "starting") {
      disposeJob();
      state = "stopped";
      $("snake-training-summary").textContent = "Stopped before the first generation was evaluated.";
      render();
      return;
    }
    if (job?.worker) job.worker.postMessage({ type });
    else if (job?.runner) job.runner[type]();
  }

  $("snake-training-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const initialization = $("snake-training-init").value;
      const config = {
        initialization,
        population: Number($("snake-training-population").value),
        generations: Number($("snake-training-generations").value),
        seed: Number($("snake-training-seed").value),
      };
      if (initialization === "current") config.initialWeights = globalThis.SnakeApp.getPolicy().weights;
      new T.Evolution(config); // Validate before starting the worker.
      start(config);
    } catch (error) { fail(error.message); }
  });
  $("snake-training-pause").addEventListener("click", () => command(state === "paused" ? "resume" : "pause"));
  $("snake-training-stop").addEventListener("click", () => command("stop"));
  $("snake-training-watch").addEventListener("click", () => {
    if (!bestModel) return;
    try {
      globalThis.SnakeApp.usePolicy(bestModel);
      $("snake-model-toolbar").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    } catch (error) { fail(error.message); }
  });
  $("snake-training-download").addEventListener("click", () => {
    if (!bestModel) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(bestModel, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `snake-ai-generation-${bestModel.generations}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  const observer = new ResizeObserver(chart);
  observer.observe($("snake-training-chart"));
  window.addEventListener("pagehide", disposeJob);
  render();
})();
