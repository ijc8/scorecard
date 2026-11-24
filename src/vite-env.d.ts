/// <reference types="vite/client" />

declare module "*.h?raw" {
    const source: string
    export default source
}

declare module "*.c?raw" {
    const source: string
    export default source
}

declare module "qrcode/lib/core/error-correction-code" {
    const ECCode: { getBlocksCount(version: number, level: unknown): number, getTotalCodewordsCount(version: number, level: unknown): number }
    export default ECCode
}
declare module "qrcode/lib/core/utils" {
    const Utils: { getSymbolTotalCodewords(version: number): number }
    export default Utils
}
declare module "qrcode/lib/core/mode" {
    interface QRMode { bit: number }
    const Mode: { NUMERIC: QRMode, ALPHANUMERIC: QRMode, BYTE: QRMode, getCharCountIndicator(mode: QRMode, version: number): number }
    export default Mode
}
