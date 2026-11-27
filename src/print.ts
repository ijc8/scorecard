// Printing a card: drawn as it's printed (wordmark, QR code, name and size), in black and white at a
// thermal printer's width, then either saved as an image or sent straight to the printer.
//
// The printer is a Phomemo M02 Pro (or another that speaks the same ESC/POS raster commands over
// Bluetooth Classic). Web Bluetooth only talks to BLE devices, so this goes through Web Serial,
// which in Chrome reaches Bluetooth serial ports (RFCOMM): Chrome 117+ on desktop, 137+ on Android.
// The printer has to be paired with the computer or phone first, in its Bluetooth settings.
import QRCode from "qrcode"
import logoUrl from "./assets/logo.png"

export const PRINT_WIDTH = 576  // dots across the M02 Pro's head (about 72 mm, at 203 dpi)
const MARGIN = 16
const TEAR_PAD = 160  // blank paper after the card, so it clears the tear strip (about 20 mm)

export interface PrintableCard {
    url: string
    title: string
    size: number
    description?: string
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
})

// Breaks text into lines no wider than `width`.
function wrap(context: CanvasRenderingContext2D, text: string, width: number) {
    const lines: string[] = []
    let line = ""
    for (const word of text.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word
        if (line && context.measureText(next).width > width) {
            lines.push(line)
            line = word
        } else {
            line = next
        }
    }
    if (line) lines.push(line)
    return lines
}

// The card as printed: wordmark, QR code, name and size, description. Pure black and white.
export async function renderCard(card: PrintableCard, pad = 0) {
    await document.fonts.load("40px sysfont")
    const logo = await loadImage(logoUrl)
    const inner = PRINT_WIDTH - 2 * MARGIN
    const { size: modules, data } = QRCode.create(card.url, { errorCorrectionLevel: "L" }).modules
    // At least two modules of white all round the QR code (scanners need some quiet zone).
    const scale = Math.floor(PRINT_WIDTH / (modules + 4))
    const gap = Math.max(20, 2 * scale)
    const measure = document.createElement("canvas").getContext("2d")!
    measure.font = "26px sysfont"
    const description = card.description ? wrap(measure, card.description, inner) : []
    const logoHeight = Math.round(inner * logo.height / logo.width)
    const height = MARGIN + logoHeight + 2 * gap + modules * scale + 48 + description.length * 32 + MARGIN + pad

    const canvas = document.createElement("canvas")
    canvas.width = PRINT_WIDTH
    canvas.height = height
    const context = canvas.getContext("2d")!
    context.fillStyle = "white"
    context.fillRect(0, 0, PRINT_WIDTH, height)
    context.imageSmoothingEnabled = false
    let y = MARGIN
    context.drawImage(logo, MARGIN, y, inner, logoHeight)
    y += logoHeight + gap
    context.fillStyle = "black"
    const left = Math.floor((PRINT_WIDTH - modules * scale) / 2)
    for (let row = 0; row < modules; row++) {
        for (let column = 0; column < modules; column++) {
            if (data[row * modules + column]) context.fillRect(left + column * scale, y + row * scale, scale, scale)
        }
    }
    y += modules * scale + gap
    context.textAlign = "center"
    context.textBaseline = "top"
    context.font = "40px sysfont"
    context.fillText(`${card.title} | ${card.size}`, PRINT_WIDTH / 2, y, inner)
    y += 48
    context.font = "26px sysfont"
    for (const line of description) {
        context.fillText(line, PRINT_WIDTH / 2, y)
        y += 32
    }

    // No greys: thermal paper is black or white, and so are screenshots worth printing.
    const pixels = context.getImageData(0, 0, PRINT_WIDTH, height)
    for (let i = 0; i < pixels.data.length; i += 4) {
        const v = pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2] < 3 * 128 ? 0 : 255
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v
        pixels.data[i + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    return canvas
}

export async function saveCardImage(card: PrintableCard) {
    const canvas = await renderCard(card)
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"))
    const name = `${card.title.replace(/[^\w -]+/g, "").trim() || "card"}.png`
    const file = new File([blob], name, { type: "image/png" })
    // On a phone, sharing hands the picture straight to the printer's own app.
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: card.title })
            return
        } catch (e: any) {
            if (e?.name === "AbortError") return
        }
    }
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name })
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// (Where there's no Web Serial, the picture can still be saved and printed from the printer's own app.)
export const canPrintDirectly = () => "serial" in navigator

const SERIAL_PORT_PROFILE = "00001101-0000-1000-8000-00805f9b34fb"
const GS = 0x1d

// GS v 0: a raster image, at most 255 rows at a time; 1 bits are black.
function rasterChunks(canvas: HTMLCanvasElement) {
    const { width, height } = canvas
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data
    const bytesPerRow = width / 8
    const chunks: Uint8Array[] = []
    for (let top = 0; top < height; top += 255) {
        const rows = Math.min(255, height - top)
        const chunk = new Uint8Array(8 + bytesPerRow * rows)
        chunk.set([GS, 0x76, 0x30, 0, bytesPerRow & 0xff, bytesPerRow >> 8, rows & 0xff, rows >> 8])
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < width; x++) {
                if (pixels[((top + y) * width + x) * 4] < 128) chunk[8 + y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
            }
        }
        chunks.push(chunk)
    }
    return chunks
}

// Sends the card to the printer, and resolves once the printer says it has finished. `status`
// hears how it's going. The first time, the browser asks which (paired) printer to use.
export async function printCard(card: PrintableCard, status: (message: string) => void) {
    const serial = (navigator as any).serial
    if (!serial) throw new Error("This browser can't reach a printer. Save the picture and print it from the printer's app.")
    let [port] = await serial.getPorts()
    if (!port) {
        status("Choose your printer...")
        port = await serial.requestPort({
            allowedBluetoothServiceClassIds: [SERIAL_PORT_PROFILE],
            filters: [{ bluetoothServiceClassId: SERIAL_PORT_PROFILE }],
        })
    }
    status("Connecting...")
    await port.open({ baudRate: 115200 })
    const reader = port.readable.getReader()
    const writer = port.writable.getWriter()
    try {
        // The printer says something (1a 0f 0c) when the connection opens, and the same again
        // once a print has physically come out: that's the only word we get from it.
        let sent = false, finished: () => void = () => {}
        const done = new Promise<void>(resolve => finished = resolve)
        ;(async () => {
            for (;;) {
                const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
                if (done) return
                if (sent && value?.length) finished()
            }
        })()
        await new Promise(resolve => setTimeout(resolve, 500))
        const canvas = await renderCard(card, TEAR_PAD)
        status("Printing...")
        // A few blank rows first: the printer tends to lose the first lines it's sent.
        await writer.write(new Uint8Array([GS, 0x76, 0x30, 0, PRINT_WIDTH / 8, 0, 3, 0, ...new Array(PRINT_WIDTH / 8 * 3).fill(0)]))
        // One chunk at a time: the printer's buffer is small, and flooding it stalls the print.
        for (const chunk of rasterChunks(canvas)) await writer.write(chunk)
        await writer.write(new Uint8Array([GS, 0x56, 1]))  // feed
        // (Anything the printer says from here on is it finishing, not the hello from connecting.)
        sent = true
        const timedOut = await Promise.race([done.then(() => false), new Promise<boolean>(resolve => setTimeout(() => resolve(true), 120000))])
        if (timedOut) throw new Error("The printer never said it had finished. Check its paper, lid and battery.")
        status("Printed.")
    } finally {
        // Closing while it's still printing would stop it, so this only happens after it's done (or given up on).
        await reader.cancel().catch(() => {})
        reader.releaseLock()
        writer.releaseLock()
        await port.close().catch(() => {})
    }
}
