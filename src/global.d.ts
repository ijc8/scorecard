// For vite-plugin-svgr:
declare module "*.svg?react" {
    import React from "react"
    const SVG: React.FC<React.SVGProps<SVGSVGElement>>
    export default SVG
}
