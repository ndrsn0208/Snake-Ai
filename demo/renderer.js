(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SnakeRenderer = api;
})(globalThis, function () {
  "use strict";
  function draw(ctx, replay, position, size, palette, reduced = false) {
    const index = Math.min(replay.frames.length - 1, Math.floor(position));
    const current = replay.frames[index];
    const next = replay.frames[Math.min(index + 1, replay.frames.length - 1)];
    const fraction = reduced ? 0 : position - index;
    const pad = 12;
    const board = size - pad * 2;
    const cell = board / replay.size;
    const point = (value) => ({
      x: pad + (value % replay.size + .5) * cell,
      y: pad + (Math.floor(value / replay.size) + .5) * cell,
    });
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = palette.board;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = .55;
    ctx.beginPath();
    for (let i = 0; i <= replay.size; i++) {
      const offset = pad + i * cell;
      ctx.moveTo(offset, pad);
      ctx.lineTo(offset, size - pad);
      ctx.moveTo(pad, offset);
      ctx.lineTo(size - pad, offset);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (current.food !== null) {
      const food = point(current.food);
      const eaten = current.food !== next.food;
      const alpha = eaten ? 1 - fraction : 1;
      ctx.fillStyle = palette.food;
      ctx.globalAlpha = .12 * alpha;
      ctx.beginPath();
      ctx.arc(food.x, food.y, cell * .68, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(food.x, food.y, cell * .30, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (eaten && next.food !== null && fraction > 0) {
        const incoming = point(next.food);
        ctx.globalAlpha = fraction;
        ctx.beginPath();
        ctx.arc(incoming.x, incoming.y, cell * .30, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    const points = next.body.map((value, i) => {
      const a = point(current.body[Math.min(i, current.body.length - 1)]);
      const b = point(value);
      return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
    });
    if (!points.length) return;
    const gradient = ctx.createLinearGradient(points.at(-1).x, points.at(-1).y, points[0].x, points[0].y);
    gradient.addColorStop(0, palette.tail);
    gradient.addColorStop(1, palette.snake);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = cell * .72;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = points.length - 1; i >= 0; i--) {
      if (i === points.length - 1) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    const head = points[0];
    ctx.fillStyle = current.reason ? palette.food : palette.head;
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * .42, 0, Math.PI * 2);
    ctx.fill();
    const direction = fraction > .5 ? next.direction : current.direction;
    const vectors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [dx, dy] = vectors[direction];
    ctx.fillStyle = palette.eye;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(head.x + dx * cell * .13 - dy * side * cell * .16,
        head.y + dy * cell * .13 + dx * side * cell * .16,
        Math.max(1.4, cell * .063), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return Object.freeze({ draw });
});
