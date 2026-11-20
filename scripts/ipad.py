"""Drive Safari on the USB-attached iPad via Web Inspector.

usage: ipad.py tabs
       ipad.py eval <url-substring> <js>      (evaluated with emulateUserGesture, awaitPromise)
       ipad.py nav <url-substring> <url>
"""
import asyncio, json, sys
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService, SAFARI


async def main():
    cmd = sys.argv[1]
    lockdown = await create_using_usbmux()
    inspector = WebinspectorService(lockdown=lockdown)
    await inspector.connect()
    try:
        async with inspector:
            pages = await inspector.get_open_application_pages(timeout=1.5)
            pages = [p for p in pages if p.application.bundle == SAFARI]
            if cmd == "tabs":
                for p in pages:
                    print(p.page.web_url[:120])
                return
            match = [p for p in pages if sys.argv[2] in (p.page.web_url or "")]
            if not match:
                print("no tab matching", sys.argv[2], [p.page.web_url[:60] for p in pages]); sys.exit(2)
            ap = match[0]
            s = await inspector.inspector_session(ap.application, ap.page)
            await s.runtime_enable()
            if cmd == "nav":
                await s.navigate_to_url(sys.argv[3])
                print("ok")
                return
            exp = sys.argv[3]
            resp = await s.send_and_receive({"method": "Runtime.evaluate", "params": {
                "expression": exp, "objectGroup": "console", "returnByValue": True,
                "emulateUserGesture": True, "awaitPromise": True, "replMode": True,
            }})
            msg = resp if s.target_id is None else json.loads(resp["params"]["message"])
            r = msg.get("result", {})
            if "wasThrown" in r and r["wasThrown"]:
                print("THROWN", json.dumps(r.get("result"))[:500])
            else:
                res = r.get("result", {})
                print(json.dumps(res.get("value", res.get("description", res))))
    finally:
        await inspector.close()

asyncio.run(main())
