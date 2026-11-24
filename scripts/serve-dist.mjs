// Serves the production build (dist/) gzipped, as GitHub Pages does, unlike `vite preview`: without
// compression the C compiler is a 104 MB download instead of about 27 MB, which on a phone makes
// the Create tab look stuck. For trying a build on a phone before deploying it.
//
//     node scripts/serve-dist.mjs [port] [host]     (defaults: 4173, 127.0.0.1)
import { createServer } from "http"
import { readFile, stat } from "fs/promises"
import { extname, join, normalize } from "path"
import { gzipSync } from "zlib"

const root = join(import.meta.dirname, "..", "dist")
const port = Number(process.argv[2] ?? 4173), host = process.argv[3] ?? "127.0.0.1"
const types = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".tar": "application/x-tar",
}
const gzipped = new Map()  // path -> [mtime, compressed]

createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname))
    if (path.endsWith("/")) path += "index.html"
    const file = join(root, path)
    let info
    try {
        if (!file.startsWith(root)) throw new Error()
        info = await stat(file)
        if (!info.isFile()) throw new Error()
    } catch {
        res.writeHead(404).end("not found")
        return
    }
    const headers = { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "max-age=600", "Last-Modified": info.mtime.toUTCString() }
    if (req.headers["if-modified-since"] === headers["Last-Modified"]) {
        res.writeHead(304, headers).end()
        return
    }
    let body = await readFile(file)
    if (/\bgzip\b/.test(req.headers["accept-encoding"] ?? "") && body.length > 1024) {
        let cached = gzipped.get(file)
        if (!cached || cached[0] !== info.mtimeMs) gzipped.set(file, cached = [info.mtimeMs, gzipSync(body, { level: 6 })])
        body = cached[1]
        headers["Content-Encoding"] = "gzip"
        headers["Vary"] = "Accept-Encoding"
    }
    headers["Content-Length"] = body.length
    res.writeHead(200, headers).end(req.method === "HEAD" ? undefined : body)
}).listen(port, host, () => console.log(`serving ${root} gzipped at http://${host}:${port}/`))
