const test = require("node:test");
const assert = require("node:assert/strict");
const { Clock } = require("../demo/playback");

test("default playback is four times the original 15-move-per-second rate", () => {
  const clock = new Clock(1000);
  clock.play(0);
  assert.equal(clock.position(1000), 60);
  clock.setSpeed(16, 1000);
  assert.equal(clock.position(2000), 300);
});

test("changing speed preserves the current position instead of restarting the run", () => {
  const clock = new Clock(1000, { speed: 1 });
  clock.play(0);
  clock.setSpeed(8, 2000);
  assert.equal(clock.position(2000), 30);
  assert.equal(clock.position(3000), 150);
});

test("playback depends on elapsed time, not how many render frames occur", () => {
  const sixtyFps = new Clock(2000, { speed: 16 });
  const tenFps = new Clock(2000, { speed: 16 });
  sixtyFps.play(0);
  tenFps.play(0);
  for (let i = 0; i < 60; i++) sixtyFps.sample(i * 1000 / 60);
  for (let i = 0; i < 10; i++) tenFps.sample(i * 100);
  assert.equal(sixtyFps.position(1000), 240);
  assert.equal(tenFps.position(1000), 240);
});

test("pause and resume do not include time spent paused", () => {
  const clock = new Clock(1000);
  clock.play(0);
  clock.pause(1000);
  assert.equal(clock.position(9000), 60);
  clock.play(9000);
  assert.equal(clock.position(10000), 120);
});

test("seeking while playing resets the time anchor and clamps both ends", () => {
  const clock = new Clock(1000);
  clock.play(0);
  clock.seek(400, 1000);
  assert.equal(clock.position(1500), 430);
  clock.seek(-10, 1500);
  assert.equal(clock.position(1500), 0);
  clock.seek(2000, 2000);
  assert.equal(clock.cursor, 1000);
  assert.equal(clock.playing, false);
});

test("skip-to-food seeks to the next event, then to the terminal frame", () => {
  const clock = new Clock(1000);
  clock.nextEvent([20, 55, 99], 0);
  assert.equal(clock.cursor, 20);
  clock.nextEvent([20, 55, 99], 0);
  assert.equal(clock.cursor, 55);
  clock.seek(99, 0);
  clock.nextEvent([20, 55, 99], 0);
  assert.equal(clock.cursor, 1000);
});

test("finishing a replay stops exactly and replaying starts from zero", () => {
  const clock = new Clock(30);
  clock.play(0);
  assert.equal(clock.sample(1000).position, 30);
  assert.equal(clock.playing, false);
  clock.play(2000);
  assert.equal(clock.position(2000), 0);
});
