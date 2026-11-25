// A plain static file server for the quickstart page and the browser tests.
// It does nothing to the files, which is the point: the quickstart works on
// any server that can hand out files.
//
//   node scripts/serve.mjs [port]      default port: 4173

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.argv[2] ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer((request, response) => {
  let path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (path === "/") path = "/examples/quickstart/";
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(root, path));
  let found = false;
  if (file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    try {
      found = statSync(file).isFile();
    } catch {
      found = false;
    }
  }
  if (!found) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Quickstart: http://127.0.0.1:${port}/`);
});
