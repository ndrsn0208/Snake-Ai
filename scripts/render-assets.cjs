// Optional artwork generator. Uses the same board renderer and playback clock.
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const E = require("../demo/engine");
const { Clock } = require("../demo/playback");
const R = require("../demo/renderer");
const policy = require("../demo/policy");
const replay = E.simulate(policy.weights, { seed: 2026 });
const output = path.resolve(process.argv[2] || ".artifacts/movie");
const assets = path.resolve(__dirname, "../docs/assets");
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(assets, { recursive: true });
const palette = {
  board: "#0b1d2d", grid: "#23435a", snake: "#23d6f3",
  tail: "#07688c", head: "#6de9fc", food: "#ff9c43", eye: "#082532",
};
const board = createCanvas(510, 510);
const boardContext = board.getContext("2d");
const canvas = createCanvas(960, 650);
const ctx = canvas.getContext("2d");
const fps = 24;
const frames = fps * 12;
const clock = new Clock(replay.frames.length - 1, { speed: 1 });
clock.play(0);
let lastSpeed = 1;
for (let i = 0; i < frames; i++) {
  const now = i / fps * 1000;
  const speed = now >= 7000 ? 16 : now >= 3000 ? 4 : 1;
  if (speed !== lastSpeed) {
    clock.setSpeed(speed, now);
    lastSpeed = speed;
  }
  const sample = clock.sample(now);
  const frame = replay.frames[sample.index];
  const decision = frame.inputs ? frame : replay.frames[Math.max(0, sample.index - 1)];
  ctx.fillStyle = "#081522";
  ctx.fillRect(0, 0, 960, 650);
  ctx.fillStyle = "#edf7ff";
  ctx.font = "600 32px Arial";
  ctx.fillText("Snake AI", 28, 46);
  ctx.fillStyle = "#a8bfce";
  ctx.font = "18px Arial";
  ctx.fillText("Gameplay replay", 194, 44);
  R.draw(boardContext, replay, sample.position, 510, palette);
  ctx.drawImage(board, 24, 80);
  ctx.fillStyle = "#23d6f3";
  ctx.font = "600 44px Arial";
  ctx.fillText(`${speed}×`, 580, 125);
  ctx.font = "20px Arial";
  ctx.fillText(`${speed * 15} moves / second`, 580, 159);
  ctx.fillStyle = "#edf7ff";
  ctx.font = "28px Arial";
  ctx.fillText(`Food  ${frame.score}`, 580, 218);
  ctx.fillText(`Moves  ${sample.index}`, 580, 258);
  ctx.fillStyle = "#a8bfce";
  ctx.font = "18px Arial";
  ctx.fillText(sample.ended ? replay.reason : "AI decision", 580, 316);
  for (let action = 0; action < 3; action++) {
    const y = 353 + action * 66;
    const value = decision.output?.[action] || 0;
    ctx.fillStyle = "#edf7ff";
    ctx.fillText(E.ACTIONS[action], 580, y);
    ctx.fillStyle = "#183347";
    ctx.fillRect(580, y + 12, 320, 8);
    ctx.fillStyle = action === decision.action ? "#23d6f3" : "#526b7b";
    ctx.fillRect(580, y + 12, value * 320, 8);
  }
  ctx.fillStyle = "#a8bfce";
  ctx.font = "17px Arial";
  ctx.fillText("Same replay. Adjustable speed.", 580, 577);
  ctx.fillStyle = "#183347";
  ctx.fillRect(24, 615, 912, 4);
  ctx.fillStyle = "#23d6f3";
  ctx.fillRect(24, 615, 912 * sample.position / clock.length, 4);
  fs.writeFileSync(path.join(output, `${String(i).padStart(4, "0")}.png`), canvas.toBuffer("image/png"));
}
fs.writeFileSync(path.join(output, "timing.json"), JSON.stringify({ fps, frameDurationMs: 1000 / fps, frames }));
const cover = createCanvas(1280, 360);
const c = cover.getContext("2d");
c.fillStyle = "#081522";
c.fillRect(0, 0, 1280, 360);
c.fillStyle = "#edf7ff";
c.font = "600 72px Arial";
c.fillText("Snake AI", 52, 112);
c.fillStyle = "#23d6f3";
c.font = "32px Arial";
c.fillText("Fast replay. Headless training.", 54, 171);
c.fillStyle = "#a8bfce";
c.font = "22px Arial";
c.fillText("0.5× – 16× playback", 55, 237);
c.fillText("Pause, seek, step, or jump to the next food.", 55, 282);
R.draw(boardContext, replay, 680, 510, palette);
c.drawImage(board, 916, 26, 308, 308);
fs.writeFileSync(path.join(assets, "cover.png"), cover.toBuffer("image/png"));
console.log(`Rendered ${frames} replay frames and the README cover.`);
