import './style.css'
import typescriptLogo from './typescript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://vitejs.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

const context = new AudioContext()

async function setupAudio() {
  if (context.state === "suspended") {
    await new Promise(resolve => {
      document.onclick = () => context.resume().then(resolve)
    })
    document.onclick = null
  }
  await context.audioWorklet.addModule("worklet.js")
  const node = new AudioWorkletNode(context, "custom-processor")
  node.connect(context.destination)
}

setupAudio()
