const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assets = [
  "index.html", "engine.js", "playback.js", "renderer.js",
  "policy.js", "app.js", "app.css", "standalone.css",
  "evolution.js", "dqn.js", "experiment.js", "comparison.js", "training-runner.js", "training-ui.js",
];
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!assets.includes(name) || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
    return;
  }
  const type = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : "text/javascript";
  response.writeHead(200, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; worker-src blob:; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'",
  });
  response.end(request.method === "HEAD" ? undefined : fs.readFileSync(path.resolve(__dirname, "../demo", name)));
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(Number(process.env.SNAKE_PREVIEW_PORT || 4174), "127.0.0.1", () => {
  console.log(`Snake AI preview: http://127.0.0.1:${server.address().port}`);
});
