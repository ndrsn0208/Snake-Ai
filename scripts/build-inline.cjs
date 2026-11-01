const fs = require("node:fs");
const path = require("node:path");
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Supply an absolute output path.");
const read = (name) => fs.readFileSync(path.resolve(__dirname, "../demo", name), "utf8");
const markup = read("index.html").split("<!-- SNAKE_FRAGMENT_START -->")[1]
  .split("<!-- SNAKE_FRAGMENT_END -->")[0].trim();
const scripts = ["engine.js", "playback.js", "renderer.js", "policy.js", "app.js"].map(read).join("\n");
fs.writeFileSync(output, `${markup}\n<style>\n${read("app.css")}\n</style>\n<script>\n${scripts}\n</script>\n`);
console.log(output);
