(function () {
  "use strict";
  const root = document.getElementById("snake-lab");
  if (!root) return;
  const E = globalThis.SnakeEngine;
  const P = globalThis.SnakePlayback;
  const R = globalThis.SnakeRenderer;
  const policy = globalThis.SnakePolicy;
  const $ = (id) => root.querySelector(`#${id}`);
  const canvas = $("snake-canvas");
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  const speeds = [.5, 1, 2, 4, 8, 16];
  const samples = [...policy.validation].sort((a, b) => b.score - a.score).slice(0, 3);
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
    const state = { version: 1, seed: replay.seed, speed: clock.speed,
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
    $("snake-run-info").textContent = `Seed ${replay.seed}. ${replay.size} × ${replay.size} board. ${replay.moves} moves, ${replay.score} food. Model evolved for ${policy.generations} generations with ${policy.population} candidates per generation.`;
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

  for (const [index, sample] of samples.entries()) {
    const option = document.createElement("option");
    option.value = String(sample.seed);
    option.textContent = `Run ${index + 1} · ${sample.score} food`;
    $("snake-run").append(option);
  }
  function restore(state) {
    const data = state?.privateContent;
    if (!data || data.version !== 1 || !Number.isInteger(data.seed) || !speeds.includes(data.speed)) return false;
    if (JSON.stringify(data) === lastSaved) return true;
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
})();
