// QR decoding with ZXing-C++ (as WebAssembly), which copes with dense, slightly blurry or skewed
// codes far better than the pure-JS decoders: score cards are about as dense as QR codes get.
// Loaded lazily, since it's only needed for scanning.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url"

let readerPromise: Promise<typeof import("zxing-wasm/reader")> | undefined

function getReader() {
    return readerPromise ??= import("zxing-wasm/reader").then(reader => {
        // Serve the decoder from our own files rather than the library's default CDN.
        reader.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => path.endsWith(".wasm") ? wasmUrl : prefix + path } })
        return reader
    })
}

// Returns the text of the first QR code found, if any.
export async function readQR(image: ImageData | Blob) {
    const { readBarcodes } = await getReader()
    const results = await readBarcodes(image, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 })
    return results[0]?.text as string | undefined
}
