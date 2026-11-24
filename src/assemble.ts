// Assembling WebAssembly text (for tracing, and the source face's Wasm and Beat modes) with watr:
// about 50 KB, where wabt was over a megabyte. Still loaded only when it's first needed.

// Throws an Error saying what's wrong, if the text doesn't assemble.
export async function assembleWat(text: string): Promise<Uint8Array> {
    const { compile } = await import("watr")
    let binary
    try {
        binary = compile(text)
    } catch (e: any) {
        // watr's own complaints are Errors ("Unknown instruction ... at line:column"); anything else
        // is it tripping over something it didn't expect.
        throw new Error(e?.constructor === Error ? e.message : `Can't make sense of this (${e?.message ?? e})`)
    }
    // watr doesn't check types and the like; the browser does.
    try {
        new WebAssembly.Module(binary as BufferSource)
    } catch (e: any) {
        throw new Error(String(e?.message ?? e).replace(/^WebAssembly\.Module(\(\))?: /, ""))
    }
    return binary
}
