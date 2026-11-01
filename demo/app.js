(function () {
  "use strict";
  const root = document.getElementById("snake-lab");
  if (!root) return;
  const E = globalThis.SnakeEngine;
  const P = globalThis.SnakePlayback;
  const R = globalThis.SnakeRenderer;
  const T = globalThis.SnakeEvolution;
  let policy = globalThis.SnakePolicy;
  const policies = new Map([["demo", policy]]);
  let modelKey = "demo";
  const $ = (id) => root.querySelector(`#${id}`);
  const canvas = $("snake-canvas");
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  const speeds = [.5, 1, 2, 4, 8, 16];
  let samples = [...policy.validation].sort((a, b) => b.score - a.score).slice(0, 3);
  let replay;
  let clock;
  let width = 0;
  let animation;
  let lastUi = 0;
  let lastSaved = "";
  let palette = {};
  let speed = 4;
  try {
    const stored = Number(localStorage.getItem("snake-ai.playback-speed"));
    if (speeds.includes(stored)) speed = stored;
  } catch { /* Storage is optional, including when opened from disk. */ }

  function remember() {
    const state = { version: 2, modelKey, seed: replay.seed, speed: clock.speed,
      position: clock.position(performance.now()), playing: clock.playing };
    lastSaved = JSON.stringify(state);
    try {
      window.openai?.setWidgetState?.({
        modelContent: { visualization: "Snake AI replay", seed: state.seed, speed: state.speed,
          score: replay.frames[Math.floor(state.position)].score },
        privateContent: state,
      })?.catch(() => {});
    } catch { /* Standalone mode has no conversation host. */ }
  }

  function readColours() {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden";
    root.append(probe);
    for (const key of ["board", "grid", "snake", "tail", "head", "food", "eye"]) {
      probe.style.color = `var(--snake-${key})`;
      palette[key] = getComputedStyle(probe).color;
    }
    probe.remove();
  }

  function resize() {
    width = canvas.getBoundingClientRect().width;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(width * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(performance.now(), true);
  }

  function speedUi() {
    for (const button of $("snake-speeds").querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === clock.speed));
    }
    $("snake-rate").textContent = `${clock.speed}× · ${clock.baseRate * clock.speed} moves/s`;
  }

  function checkedPolicy(raw) {
    const candidate = T.validatePolicy(raw);
    candidate.validation = [7, 2026, 8675309, 410, 709].map((seed) => {
      const run = E.simulate(candidate.weights, { seed, maxMoves: 2000 }, false);
      return { seed, score: run.score, moves: run.moves, reason: run.reason };
    });
    return candidate;
  }

  function addModelOption(key, label) {
    let option = [...$("snake-model-select").options].find((item) => item.value === key);
    if (!option) {
      option = document.createElement("option");
      option.value = key;
      $("snake-model-select").append(option);
    }
    option.textContent = label;
  }

  function updateRunOptions() {
    samples = [...policy.validation].sort((a, b) => b.score - a.score).slice(0, 3);
    $("snake-run").replaceChildren();
    for (const [index, sample] of samples.entries()) {
      const option = document.createElement("option");
      option.value = String(sample.seed);
      option.textContent = `Run ${index + 1} · ${sample.score} food`;
      $("snake-run").append(option);
    }
    $("snake-model-select").value = modelKey;
    $("snake-model-note").textContent = modelKey === "demo"
      ? "Bundled demo policy · original network architecture"
      : `${policy.name} · ${policy.initialization === "random" ? "trained from random weights" : policy.initialization}`;
    $("snake-policy-description").textContent = modelKey === "demo"
      ? "The bundled model was evolved from a documented heuristic initialization. Train from scratch above to create your own weights."
      : `${policy.method}. ${policy.evaluatedGames || 0} games evaluated, ${(policy.simulatedMoves || 0).toLocaleString("en-US")} moves simulated.`;
    root.dataset.model = modelKey;
    root.dataset.modelGeneration = String(policy.generations || 0);
  }

  function selectModel(key, autoplay = true) {
    if (!policies.has(key)) throw new Error("The selected model is unavailable.");
    modelKey = key;
    policy = policies.get(key);
    updateRunOptions();
    loadRun(samples[0].seed, autoplay);
    try { localStorage.setItem("snake-ai.active-model", key); } catch { /* Optional. */ }
  }

  function useTrainedPolicy(raw) {
    const candidate = checkedPolicy(raw);
    policies.set("trained", candidate);
    addModelOption("trained", `Your trained model · generation ${candidate.generations}`);
    selectModel("trained");
    $("snake-model-message").textContent = `Gameplay now uses your model from generation ${candidate.generations}.`;
    try { localStorage.setItem("snake-ai.trained-policy", JSON.stringify(candidate)); }
    catch { $("snake-model-message").textContent += " Download it to keep a copy."; }
    remember();
  }

  function updateUi(sample) {
    const frame = replay.frames[sample.index];
    const decision = frame.inputs ? frame : replay.frames[Math.max(0, sample.index - 1)];
    $("snake-score").textContent = String(frame.score);
    $("snake-moves").textContent = String(frame.moves);
    $("snake-length").textContent = String(frame.body.length);
    $("snake-status").textContent = sample.ended ? "Finished" : clock.playing ? "Playing" : "Paused";
    $("snake-play").textContent = sample.ended ? "Play again" : clock.playing ? "Pause" : "Play";
    $("snake-timeline").max = String(clock.length);
    $("snake-timeline").value = String(Math.floor(sample.position));
    $("snake-progress").textContent = `${Math.floor(sample.position)} / ${clock.length} moves`;
    $("snake-time").textContent = `${((clock.length - sample.position) / (clock.baseRate * clock.speed)).toFixed(1)}s left at ${clock.speed}×`;
    $("snake-step").disabled = sample.ended;
    const futureFood = replay.events.some((event) => event > Math.floor(sample.position));
    $("snake-next-food").textContent = futureFood ? "Next food" : "Jump to finish";
    $("snake-next-food").disabled = sample.ended;
    $("snake-end").hidden = !sample.ended;
    $("snake-end").textContent = `${replay.reason} · ${replay.score} food · ${replay.moves} moves. Replay or start a new run.`;
    $("snake-action").textContent = E.ACTIONS[decision.action] || "—";
    $("snake-decision-step").textContent = frame.inputs ? `Move ${sample.index + 1}` : "Final decision";
    for (const element of $("snake-outputs").children) {
      const action = Number(element.dataset.action);
      const value = decision.output?.[action] || 0;
      element.dataset.selected = String(action === decision.action);
      element.querySelector(".snake-output-value").textContent = value.toFixed(3);
      element.querySelector(".snake-bar").setAttribute("aria-valuenow", String(value));
      element.querySelector(".snake-bar > div").style.width = `${value * 100}%`;
    }
    for (const cell of root.querySelectorAll("[data-input]")) {
      const index = Number(cell.dataset.input);
      const value = decision.inputs?.[index] || 0;
      cell.textContent = value ? "Yes" : "No";
      cell.dataset.on = String(Boolean(value));
      cell.dataset.danger = String(Boolean(value) && index % 3 !== 2);
    }
    root.dataset.position = sample.position.toFixed(4);
    root.dataset.speed = String(clock.speed);
    root.dataset.playing = String(clock.playing);
    root.dataset.seed = String(replay.seed);
    root.dataset.length = String(clock.length);
  }

  function render(now, forceUi = false) {
    if (!replay || !clock) return;
    const sample = clock.sample(now);
    if (width) R.draw(ctx, replay, sample.position, width, palette, reduced.matches);
    if (forceUi || now - lastUi >= 80 || sample.ended) {
      lastUi = now;
      updateUi(sample);
    }
    return sample;
  }

  function tick(now) {
    const sample = render(now);
    if (clock.playing) animation = requestAnimationFrame(tick);
    else if (sample?.ended) remember();
  }

  function schedule() {
    cancelAnimationFrame(animation);
    render(performance.now(), true);
    if (clock.playing) animation = requestAnimationFrame(tick);
  }

  function loadRun(seed, autoplay = true) {
    cancelAnimationFrame(animation);
    speed = clock?.speed || speed;
    replay = E.simulate(policy.weights, { seed, maxMoves: 2000 });
    clock = new P.Clock(replay.frames.length - 1, { speed });
    const optionValue = String(replay.seed);
    let option = [...$("snake-run").options].find((item) => item.value === optionValue);
    if (!option) {
      $("snake-run").querySelector('option[data-new="true"]')?.remove();
      option = document.createElement("option");
      option.dataset.new = "true";
      option.value = optionValue;
      option.textContent = `New run · ${replay.score} food`;
      $("snake-run").append(option);
    }
    $("snake-run").value = optionValue;
    $("snake-run-info").textContent = `Seed ${replay.seed}. ${replay.size} × ${replay.size} board. ${replay.moves} moves, ${replay.score} food. ${policy.generations ? `Model trained for ${policy.generations} generations with ${policy.population} candidates per generation.` : "Imported model."}`;
    canvas.setAttribute("aria-label", `Snake AI replay on a ${replay.size} by ${replay.size} board. The cyan snake collects orange food. Use the timeline to inspect any move.`);
    speedUi();
    if (autoplay) clock.play(performance.now());
    schedule();
  }

  function pause() {
    clock.pause(performance.now());
    schedule();
    remember();
  }

  function step(amount = 1) {
    const now = performance.now();
    clock.pause(now);
    clock.seek(Math.floor(clock.cursor) + amount, now);
    schedule();
    remember();
  }

  $("snake-speeds").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-speed]");
    if (!button) return;
    clock.setSpeed(Number(button.dataset.speed), performance.now());
    try { localStorage.setItem("snake-ai.playback-speed", String(clock.speed)); } catch { /* Optional. */ }
    speedUi();
    schedule();
    remember();
  });
  $("snake-play").addEventListener("click", () => {
    if (clock.playing) pause();
    else { clock.play(performance.now()); schedule(); remember(); }
  });
  $("snake-replay").addEventListener("click", () => {
    clock.seek(0, performance.now());
    clock.play(performance.now());
    schedule();
    remember();
  });
  $("snake-step").addEventListener("click", () => step());
  $("snake-next-food").addEventListener("click", () => {
    clock.nextEvent(replay.events, performance.now());
    schedule();
    remember();
  });
  $("snake-timeline").addEventListener("input", () => {
    const target = Number($("snake-timeline").value);
    clock.pause(performance.now());
    clock.seek(target, performance.now());
    schedule();
    remember();
  });
  $("snake-run").addEventListener("change", () => {
    loadRun(Number($("snake-run").value), true);
    remember();
  });
  $("snake-new").addEventListener("click", () => {
    loadRun(Math.floor(Math.random() * 0x100000000), true);
    remember();
  });
  $("snake-model-select").addEventListener("change", () => {
    selectModel($("snake-model-select").value);
    $("snake-model-message").textContent = modelKey === "demo" ? "Using the bundled demo model." : `Using ${policy.name}.`;
    remember();
  });
  $("snake-model-import").addEventListener("change", async () => {
    const file = $("snake-model-import").files[0];
    if (!file) return;
    try {
      if (file.size > 250000) throw new Error("Choose a model JSON file smaller than 250 KB.");
      const candidate = checkedPolicy(JSON.parse(await file.text()));
      policies.set("imported", candidate);
      addModelOption("imported", `Imported · ${candidate.name}`);
      selectModel("imported");
      $("snake-model-message").textContent = `Loaded ${file.name}.`;
      remember();
    } catch (error) {
      $("snake-model-message").textContent = `Model not loaded: ${error.message}`;
    }
    $("snake-model-import").value = "";
  });
  document.addEventListener("keydown", (event) => {
    if (!root.contains(event.target) && event.target !== document.body && event.target !== document.documentElement) return;
    if (event.target.closest("input, textarea, select, button, summary")) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (clock.playing) pause(); else { clock.play(performance.now()); schedule(); remember(); }
    } else if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
      event.preventDefault();
      step(event.code === "ArrowRight" ? 1 : -1);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && clock?.playing) {
      clock.pause(performance.now());
      schedule();
    }
  });
  window.addEventListener("pagehide", () => { clock?.pause(performance.now()); cancelAnimationFrame(animation); });
  theme.addEventListener("change", () => { readColours(); render(performance.now(), true); });
  reduced.addEventListener("change", () => render(performance.now(), true));
  const themeObserver = new MutationObserver(() => { readColours(); render(performance.now(), true); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  try {
    const savedPolicy = localStorage.getItem("snake-ai.trained-policy");
    if (savedPolicy) {
      const candidate = checkedPolicy(JSON.parse(savedPolicy));
      policies.set("trained", candidate);
      addModelOption("trained", `Your trained model · generation ${candidate.generations}`);
      if (localStorage.getItem("snake-ai.active-model") === "trained") {
        modelKey = "trained";
        policy = candidate;
      }
    }
  } catch { /* Invalid or unavailable saved data does not prevent playback. */ }
  updateRunOptions();
  function restore(state) {
    const data = state?.privateContent;
    if (!data || ![1, 2].includes(data.version) || !Number.isInteger(data.seed) || !speeds.includes(data.speed)) return false;
    if (JSON.stringify(data) === lastSaved) return true;
    const requestedModel = data.version === 1 ? "demo" : data.modelKey;
    if (!policies.has(requestedModel)) return false;
    modelKey = requestedModel;
    policy = policies.get(modelKey);
    updateRunOptions();
    speed = data.speed;
    if (clock) clock.speed = speed;
    loadRun(data.seed, false);
    if (Number.isFinite(data.position)) clock.seek(data.position, performance.now());
    if (data.playing && clock.cursor < clock.length) clock.play(performance.now());
    schedule();
    return true;
  }
  window.addEventListener("openai:set_globals", (event) => restore(event.detail?.globals?.widgetState));
  readColours();
  if (!restore(window.openai?.widgetState)) loadRun(samples[0].seed, !reduced.matches);
  resize();
  globalThis.SnakeApp = Object.freeze({
    getPolicy: () => ({ ...policy, weights: [...policy.weights] }),
    usePolicy: useTrainedPolicy,
  });
})();
