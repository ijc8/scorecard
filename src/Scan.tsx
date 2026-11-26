import { useEffect, useState } from "react"
import Alert from "pixelarticons/svg/alert.svg?react"
import { Html5QrcodePlugin } from "./Html5QrcodePlugin"
import { Tab } from "./tabs"

export function Scan({ onScan, tab }: any) {
    const [error, setError] = useState("")
    const qrCodeSuccessCallback = (data: string) => {
        if (!onScan(data)) {
            setError("Invalid ScoreCard")
        }
    }
    useEffect(() => {
        if (tab !== Tab.Scan) {
            // Reset error message on tab switch
            setError("")
        }
    }, [tab])
    return tab === Tab.Scan && <>
        <Html5QrcodePlugin
            fps={10}
            qrbox={250}
            disableFlip={false}
            qrCodeSuccessCallback={qrCodeSuccessCallback}
        />
        <div style={{ fontSize: "6cqw", display: "flex", justifyContent: "center", alignItems: "center" }}>
            {error && <Alert style={{ height: "6cqw" }} />}
            &nbsp;
            {error}
        </div>
    </>
}
