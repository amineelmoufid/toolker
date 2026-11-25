
let globalAudio: HTMLAudioElement | null = null;
let globalSource: AudioBufferSourceNode | null = null;
let globalCtx: AudioContext | null = null;

export function stopAllAudio() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio = null;
  }
  if (globalSource) {
    try { globalSource.stop(); } catch(e) {}
    globalSource = null;
  }
}

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export async function playPcmBuffer(data: Uint8Array, onEnded?: () => void) {
  stopAllAudio();
  if (!globalCtx) {
    globalCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  const buffer = await decodeAudioData(data, globalCtx);
  const source = globalCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(globalCtx.destination);
  source.onended = () => {
    if (onEnded) onEnded();
    globalSource = null;
  };
  source.start();
  globalSource = source;
}

export async function playPcmAudio(base64Audio: string, onEnded?: () => void) {
  const data = decodeBase64(base64Audio);
  await playPcmBuffer(data, onEnded);
}

export function playStandardAudio(base64OrDataUri: string, onEnded?: () => void): HTMLAudioElement {
  stopAllAudio();
  const src = base64OrDataUri.startsWith('data:') 
    ? base64OrDataUri 
    : `data:audio/webm;base64,${base64OrDataUri}`;
  const audio = new Audio(src);
  audio.onended = () => {
    if (onEnded) onEnded();
    globalAudio = null;
  };
  audio.onerror = (e) => {
    console.warn("Audio playback error:", e);
    if (onEnded) onEnded();
    globalAudio = null;
  };
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      console.warn("Audio playback interrupted or blocked:", err);
      if (onEnded) onEnded();
      globalAudio = null;
    });
  }
  globalAudio = audio;
  return audio;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
