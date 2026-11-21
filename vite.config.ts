import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

// Dev-only sink for the `?debug` overlay's log lines (see src/debug.ts).
// Set SCORECARD_DEBUGLOG=/path/to/file to choose where they go.
function debugLog(): Plugin {
  const file = process.env.SCORECARD_DEBUGLOG ?? "debuglog.txt"
  return {
    name: "scorecard-debuglog",
    apply: "serve",
    configureServer(server) {
      // Short links for typing on a phone: /m -> card from $SCORECARD_CARDS/m.b43, with ?debug.
      const cards = process.env.SCORECARD_CARDS
      server.middlewares.use((req, res, next) => {
        const short = cards && req.url?.match(/^\/([a-z])$/)
        if (short && existsSync(`${cards}/${short[1]}.b43`)) {
          res.statusCode = 302
          res.setHeader("Location", `/?debug&c=${readFileSync(`${cards}/${short[1]}.b43`, "utf8").trim()}`)
          return res.end()
        }
        if (!req.url?.endsWith("/__debuglog") || req.method !== "POST") return next()
        let body = ""
        req.on("data", chunk => { body += chunk })
        req.on("end", () => {
          appendFileSync(file, `[${new Date().toISOString()} ${req.socket.remoteAddress}]\n${body}\n`)
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), svgr(), debugLog()],
  // The compiler worker loads its (large) toolchain with dynamic imports, which needs ES modules.
  worker: { format: "es" },
  // Binaryen (used by that worker) needs top-level await.
  build: { target: "es2022" },
})
