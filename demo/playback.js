/* Clock-based replay. Speed is independent of render frequency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SnakePlayback = api;
})(globalThis, function () {
  "use strict";

  class Clock {
    constructor(length, { baseRate = 15, speed = 4 } = {}) {
      this.length = Math.max(0, length);
      this.baseRate = baseRate;
      this.speed = speed;
      this.cursor = 0;
      this.anchor = 0;
      this.playing = false;
    }
    position(now) {
      const elapsed = this.playing ? Math.max(0, now - this.anchor) / 1000 : 0;
      return Math.min(this.length, this.cursor + elapsed * this.baseRate * this.speed);
    }
    play(now) {
      if (this.playing) return;
      if (this.cursor >= this.length) this.cursor = 0;
      this.anchor = now;
      this.playing = this.length > 0;
    }
    pause(now) {
      this.cursor = this.position(now);
      this.anchor = now;
      this.playing = false;
    }
    seek(position, now) {
      this.cursor = Math.max(0, Math.min(this.length, position));
      this.anchor = now;
      if (this.cursor >= this.length) this.playing = false;
    }
    setSpeed(speed, now) {
      if (!Number.isFinite(speed) || speed <= 0 || speed > 64) throw new Error("Invalid playback speed.");
      this.cursor = this.position(now);
      this.anchor = now;
      this.speed = speed;
    }
    sample(now) {
      const position = this.position(now);
      if (position >= this.length) {
        this.cursor = this.length;
        this.playing = false;
      }
      return { position, index: Math.floor(position),
        fraction: position - Math.floor(position), ended: position >= this.length };
    }
    nextEvent(events, now) {
      const position = this.position(now);
      const next = events.find((event) => event > Math.floor(position));
      this.seek(next ?? this.length, now);
    }
  }
  return Object.freeze({ Clock });
});
