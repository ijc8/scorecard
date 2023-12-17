class CustomProcessor extends AudioWorkletProcessor { 
    constructor() {
      super()
    }
  
    process(inputs, outputs, parameters) {
      const speakers = outputs[0]
  
      for (let i = 0; i < speakers[0].length; i++) {
        const noise = Math.random() * 2 - 1
        for (const channel of speakers) {
          channel[i] = noise
        }
      }
  
      return true
    }
  }

  registerProcessor("custom-processor", CustomProcessor)
