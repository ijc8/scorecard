// Compiles C into a score card, off the main thread: Clang and LLD (as WebAssembly, via YoWASP)
// build the binary, then Binaryen renames the exports and squeezes it, as `examples/strip.sh` does.
// The toolchain is tens of megabytes, so it's only fetched when the first card is compiled.
import deckHeader from "../examples/deck.h?raw"
import generatorHeader from "../examples/generator.h?raw"

const headers = {
    "deck.h": deckHeader,
    "generator.h": generatorHeader,
    // deck.h's card-building branch expects Emscripten; this is all of it that cards need.
    "emscripten.h": '#define EMSCRIPTEN_KEEPALIVE __attribute__((used, visibility("default")))\n',
}

const flags = [
    "-D__EMSCRIPTEN__", "-I.", "-Oz", "-flto", "-Wall", "-nostartfiles",
    "-Wl,--no-entry", "-Wl,--strip-all", "-Wl,--lto-O3",
    "-Wl,--export=process", "-Wl,--export-if-defined=setup", "-Wl,--export-if-defined=title",
]

// Long names in the source, short names in the card (see "Score card ABI" in AGENTS.md).
const exportNames = [["process", "p"], ["setup", "s"], ["title", "d"], ["memory", "m"]]

const post = (message: any) => (self as any).postMessage(message)

async function compile(source: string) {
    const { commands, runLLVM } = await import("@yowasp/clang")
    const decoder = new TextDecoder()
    let log = ""
    let output: any
    try {
        // Fetch the toolchain first, on its own: `clang` doesn't pass `fetchProgress` on to the
        // run that does the fetching, so this is the only way to hear how it's going.
        await runLLVM(undefined, {}, { fetchProgress: ({ doneLength, totalLength }) => post({ progress: doneLength / totalLength }) })
        post({ progress: 1 })
        // The source lives in a subdirectory so that `#include "../deck.h"` (as the examples in the
        // repository have it) works as well as `#include "deck.h"`.
        output = await commands.clang([...flags, "-o", "card.wasm", "card/card.c"], { ...headers, card: { "card.c": source } }, {
            stderr: bytes => { if (bytes) log += decoder.decode(bytes) },
        })
    } catch (e: any) {
        return { log: log || String(e?.message ?? e) }
    }

    const { default: binaryen } = await import("binaryen")
    const module = binaryen.readBinary(output["card.wasm"])
    module.setFeatures(binaryen.Features.All)
    for (const [long, short] of exportNames) {
        const ref = module.getExport(long)
        if (!ref) continue
        const { kind, value } = binaryen.getExportInfo(ref)
        module.removeExport(long)
        if (kind === binaryen.ExternalFunction) module.addFunctionExport(value, short)
        else if (kind === binaryen.ExternalGlobal) module.addGlobalExport(value, short)
        else if (kind === binaryen.ExternalMemory) module.addMemoryExport(value, short)
    }
    // Optimize for size until it stops helping.
    binaryen.setOptimizeLevel(2)
    binaryen.setShrinkLevel(2)
    let binary = module.emitBinary()
    let size
    do {
        size = binary.length
        module.optimize()
        binary = module.emitBinary()
    } while (binary.length < size)
    module.dispose()
    return { log, binary }
}

self.onmessage = async (e: MessageEvent) => {
    post({ id: e.data.id, ...await compile(e.data.source).catch(error => ({ log: String(error?.message ?? error) })) })
}
