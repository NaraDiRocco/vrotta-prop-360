// Zero-dependency static server for apps/embed/demo. Exists only so the
// demo page and the two "iframe" tours it embeds are same-origin (loader
// and mock viewer both validate postMessage origins strictly, so a plain
// `open index.html` from the filesystem would fail that check).
//
// Usage: node scripts/serve-demo.mjs [port]   (default 8090)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2]) || 8090;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function send(res, status, body, contentType) {
  res.writeHead(status, { "Content-Type": contentType || "text/plain" });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found");
    const ext = path.extname(filePath);
    send(res, 200, data, MIME[ext] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  // Stands in for the real viewer app's tour route — everything the mock
  // viewer needs (tenant/project/instance/unit/scene) arrives via query
  // string, same as buildIframeSrc() constructs for the real deployment.
  if (url.pathname === "/t") {
    return serveFile(res, path.join(root, "demo/mock-viewer.html"));
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return serveFile(res, path.join(root, "demo/index.html"));
  }

  const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);
  if (!filePath.startsWith(root)) return send(res, 403, "Forbidden");
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not found");
    serveFile(res, filePath);
  });
});

server.listen(port, () => {
  console.log(`demo running at http://localhost:${port}`);
});
