/// <reference types="vite/client" />

declare module "*.h?raw" {
    const source: string
    export default source
}

declare module "*.c?raw" {
    const source: string
    export default source
}
