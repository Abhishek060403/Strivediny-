import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

export interface LiveSessionConfig {
  language: string;
  level: string;
  topic: string;
}

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private sampleRate: number = 24000;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  async start() {
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    this.nextStartTime = this.audioContext.currentTime;
  }

  stop() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async playPCM(base64Data: string) {
    if (!this.audioContext) return;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768.0;
    }

    const buffer = this.audioContext.createBuffer(1, floatData.length, this.sampleRate);
    buffer.getChannelData(0).set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  get context() {
    return this.audioContext;
  }
}

export const createLiveSession = async (
  apiKey: string,
  config: LiveSessionConfig,
  callbacks: {
    onAudioData: (base64: string) => void;
    onTranscription: (text: string, isInterim: boolean, isModel: boolean) => void;
    onInterrupted: () => void;
    onError: (error: any) => void;
    onClose: () => void;
  }
) => {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `You are a friendly and patient language tutor named Lingo. 
  The user wants to practice ${config.language} at a ${config.level} level. 
  The topic for today is: ${config.topic}.
  
  Guidelines:
  1. Speak naturally but clearly.
  2. If the user makes a mistake, gently correct them after they finish their thought.
  3. Encourage the user to speak more.
  4. Keep responses relatively concise to maintain a back-and-forth flow.
  5. If the user is struggling, offer hints or translate small phrases if necessary.
  6. Stay in character as a tutor.`;

  return ai.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-09-2025",
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
      },
      systemInstruction,
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
    callbacks: {
      onopen: () => {
        console.log("Live session opened");
      },
      onmessage: async (message: LiveServerMessage) => {
        const msg = message as any;
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              callbacks.onAudioData(part.inlineData.data);
            }
          }
        }

        if (msg.serverContent?.interrupted) {
          callbacks.onInterrupted();
        }

        if (msg.modelTranscription?.parts) {
          const text = msg.modelTranscription.parts.map((p: any) => p.text).join(" ");
          callbacks.onTranscription(text, false, true);
        }

        if (msg.userTranscription?.parts) {
          const text = msg.userTranscription.parts.map((p: any) => p.text).join(" ");
          callbacks.onTranscription(text, false, false);
        }
      },
      onerror: (error) => {
        callbacks.onError(error);
      },
      onclose: () => {
        callbacks.onClose();
      },
    },
  });
};
