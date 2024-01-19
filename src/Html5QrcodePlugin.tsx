// https://github.com/scanapp-org/html5-qrcode-react
import { useEffect } from 'react'

// Dynamic import for code-splitting
const html5QrcodePromise = import("html5-qrcode")

const qrcodeRegionId = "html5qr-code-full-region"

// Creates the configuration object for Html5QrcodeScanner.
const createConfig = (props: any) => {
    let config: any = {}
    if (props.fps) {
        config.fps = props.fps
    }
    if (props.qrbox) {
        config.qrbox = props.qrbox
    }
    if (props.aspectRatio) {
        config.aspectRatio = props.aspectRatio
    }
    if (props.disableFlip !== undefined) {
        config.disableFlip = props.disableFlip
    }
    return config
}

export const Html5QrcodePlugin = (props: any) => {
    useEffect(() => {
        let html5QrcodeScanner: any
        let valid = true
        ;(async() => {
            // when component mounts
            const config = createConfig(props)
            const verbose = props.verbose === true
            // Suceess callback is required.
            if (!(props.qrCodeSuccessCallback)) {
                throw "qrCodeSuccessCallback is required callback."
            }
            const Html5QrcodeScanner = (await html5QrcodePromise).Html5QrcodeScanner
            if (!valid) return
            html5QrcodeScanner = new Html5QrcodeScanner(qrcodeRegionId, config, verbose)
            html5QrcodeScanner.render(props.qrCodeSuccessCallback, props.qrCodeErrorCallback)
            // HACK: remove the border html5-qrcode adds to its container
            document.getElementById(qrcodeRegionId)!.style.border = "none"
        })()

        // cleanup function when component will unmount
        return () => {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.clear().catch((error: any) => {
                    console.error("Failed to clear html5QrcodeScanner. ", error)
                })
            } else {
                valid = false
            }
        }
    }, [])

    return (
        <div id={qrcodeRegionId} style={{ display: "flex", flexDirection: "column", justifyContent: "center" }} />
    )
}
