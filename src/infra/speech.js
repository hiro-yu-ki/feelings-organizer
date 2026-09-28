export class SpeechToTextProvider {
  constructor(recognitionFactory){this.recognitionFactory=recognitionFactory;}
  available(){return typeof this.recognitionFactory==='function';}
  classify(confidence,error=null){if(error)return{mode:'text',reason:error};if(confidence==null||confidence<.65)return{mode:'confirm',reason:'low_confidence'};return{mode:'audio',reason:null};}
}
export class TextToSpeechProvider {
  constructor(synthesis){this.synthesis=synthesis;}
  available(){return Boolean(this.synthesis);}
}
export class GeminiLiveSpeechAdapter {
  constructor(){this.enabled=false;}
  createEphemeralSession(){throw new Error('Gemini Live is disabled until current API terms and ephemeral-token specification are reviewed');}
}
