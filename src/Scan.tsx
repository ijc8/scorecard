import { useEffect, useRef, useState } from "react"
import Alert from "pixelarticons/svg/alert.svg?react"
import ImageIcon from "pixelarticons/svg/image.svg?react"
import { readQR } from "./qrReader"
import { dlog } from "./debug"
import { Tab } from "./tabs"

export function Scan({ onScan, tab }: { onScan: (data: string) => boolean, tab: number }) {
    const [message, setMessage] = useState("")
    const video = useRef<HTMLVideoElement>(null)
    const onScanRef = useRef(onScan)
    onScanRef.current = onScan
    const active = tab === Tab.Scan

    const handle = (text: string | undefined, nothing: string) => {
        if (text === undefined) setMessage(nothing)
        else if (!onScanRef.current(text)) setMessage("That's not a score card")
    }

    useEffect(() => {
        if (!active) return
        setMessage("")
        let stream: MediaStream | undefined
        let stopped = false
        let timeout: number | undefined
        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d", { willReadFrequently: true })!

        const scan = async () => {
            const v = video.current
            if (stopped || !v) return
            if (v.videoWidth) {
                // Decode the whole frame at full resolution, not just what's visible in the viewfinder.
                canvas.width = v.videoWidth
                canvas.height = v.videoHeight
                context.drawImage(v, 0, 0)
                try {
                    const text = await readQR(context.getImageData(0, 0, canvas.width, canvas.height))
                    if (stopped) return
                    if (text !== undefined) handle(text, "")
                } catch (e) {
                    console.error(e)
                }
            }
            timeout = window.setTimeout(scan, 60)
        }

        ;(async () => {
            try {
                // Ask for a high-resolution rear camera: dense codes need the pixels.
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                })
            } catch (e) {
                dlog("camera failed", String(e))
                if (!stopped) setMessage("Can't use the camera")
                return
            }
            if (stopped || !video.current) {
                stream.getTracks().forEach(track => track.stop())
                return
            }
            video.current.srcObject = stream
            video.current.play().catch(() => {})
            scan()
        })()

        return () => {
            stopped = true
            clearTimeout(timeout)
            stream?.getTracks().forEach(track => track.stop())
            if (video.current) video.current.srcObject = null
        }
    }, [active])

    const scanPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return
        setMessage("Reading...")
        handle(await readQR(file).catch(() => undefined), "No card found in that photo")
    }

    return active && <>
        <div className="viewfinder">
            <video ref={video} playsInline muted autoPlay />
            <div></div>
        </div>
        <div style={{ fontSize: "6cqw", display: "flex", justifyContent: "center", alignItems: "center", margin: "12px 0" }}>
            {message ? <><Alert style={{ height: "6cqw" }} />&nbsp;{message}</> : "Point at a score card"}
        </div>
        <label className="photo-button">
            <ImageIcon style={{ height: "1.2em", verticalAlign: "middle" }} /> Scan a photo instead
            <input type="file" accept="image/*" onChange={scanPhoto} />
        </label>
    </>
}

