export const streamSpeechLive = async (
  text: string,
  apiKey: string,
  onAudioChunk: (data: Uint8Array) => void,
  onComplete: () => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error("API Key is missing for Live API."));
      return;
    }

    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`);
    
    ws.onopen = () => {
      // Send setup config with Aoede voice
      const setupMessage = {
        setup: {
          model: "models/gemini-3.8-live",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" }
              }
            }
          }
        }
      };
      ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = async (event) => {
      try {
        let textData = '';
        if (typeof event.data === 'string') {
          textData = event.data;
        } else if (event.data instanceof Blob) {
          textData = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          textData = new TextDecoder().decode(event.data);
        } else {
          return;
        }

        const msg = JSON.parse(textData);
        
        // When setup completes, instantly send the prompt
        if (msg.setupComplete) {
          const clientContent = {
            clientContent: {
              turns: [{
                role: "user",
                parts: [{ text: `Say ONLY this exact phrase clearly and naturally: "${text}"` }]
              }],
              turnComplete: true
            }
          };
          ws.send(JSON.stringify(clientContent));
        }
        
        // Receive and decode audio chunks
        if (msg.serverContent?.modelTurn) {
          const parts = msg.serverContent.modelTurn.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                const base64 = part.inlineData.data;
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                onAudioChunk(bytes);
              }
            }
          }
        }
        
        // When model finishes, close to save TPM
        if (msg.serverContent?.turnComplete) {
          ws.close();
          onComplete();
          resolve();
        }
      } catch (err) {
        console.error("Error parsing WebSocket message in streamSpeechLive:", err);
      }
    };
    
    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      reject(err);
    };

    ws.onclose = () => {
      // Ensure we resolve if closed unexpectedly
      resolve();
    };
  });
};

export const generateSpeechBase64 = async (
  text: string,
  apiKey: string,
  speedInstruction: string = ''
): Promise<string> => {
  const chunks: string[] = [];
  
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error("API Key is missing for Live API."));
      return;
    }

    let isDone = false;
    let wsState = "CONNECTING";
    const timeoutId = setTimeout(() => {
      if (isDone) return;
      isDone = true;
      if (chunks.length > 0) {
        resolve(processChunks(chunks));
      } else {
        reject(new Error(`WebSocket timed out (120s). State: ${wsState}. Chunks: 0. No audio received.`));
      }
    }, 120000);

    const cleanup = () => {
      isDone = true;
      clearTimeout(timeoutId);
    };

    const processChunks = (base64Chunks: string[]): string => {
      let totalLength = 0;
      const byteArrays = base64Chunks.map(chunk => {
        const binaryString = atob(chunk);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        totalLength += bytes.length;
        return bytes;
      });
      
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const arr of byteArrays) {
        combined.set(arr, offset);
        offset += arr.length;
      }
      
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < combined.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, combined.subarray(i, i + chunkSize) as any);
      }
      return btoa(binary);
    };

    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`);
    
    ws.onopen = () => {
      wsState = "OPEN_SENT_SETUP";
      const setupMessage = {
        setup: {
          model: "models/gemini-3.8-live",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" }
              }
            }
          }
        }
      };
      ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = async (event) => {
      if (isDone) return;
      try {
        let textData = '';
        if (typeof event.data === 'string') {
          textData = event.data;
        } else if (event.data instanceof Blob) {
          textData = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          textData = new TextDecoder().decode(event.data);
        } else {
          console.warn("Unknown event.data type:", typeof event.data);
          return;
        }

        const msg = JSON.parse(textData);
        wsState = "RECEIVING_MESSAGES";
          
          if (msg.error) {
            cleanup();
            ws.close();
            if (chunks.length > 0) resolve(processChunks(chunks));
            else reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            return;
          }
          
          if (msg.setupComplete) {
            wsState = "SETUP_COMPLETE_SENT_PROMPT";
            const prompt = speedInstruction 
              ? `Say ONLY this exact phrase clearly and naturally: "${text}". Instruction: ${speedInstruction}` 
              : `Say ONLY this exact phrase clearly and naturally: "${text}"`;
              
            const clientContent = {
              clientContent: {
                turns: [{
                  role: "user",
                  parts: [{ text: prompt }]
                }],
                turnComplete: true
              }
            };
            ws.send(JSON.stringify(clientContent));
          }
          
          if (msg.serverContent?.modelTurn) {
            const parts = msg.serverContent.modelTurn.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                  wsState = "RECEIVING_AUDIO_CHUNKS";
                  chunks.push(part.inlineData.data);
                }
              }
            }
          }
          
          if (msg.serverContent?.turnComplete) {
            cleanup();
            ws.close();
            resolve(processChunks(chunks));
          }
      } catch (err: any) {
        cleanup();
        ws.close();
        if (chunks.length > 0) resolve(processChunks(chunks));
        else reject(new Error("Error parsing WebSocket message: " + (err.message || String(err))));
      }
    };
    
    ws.onerror = (err) => {
      if (isDone) return;
      cleanup();
      if (chunks.length > 0) resolve(processChunks(chunks));
      else reject(new Error("WebSocket network error occurred."));
    };

    ws.onclose = () => {
      if (isDone) return;
      cleanup();
      if (chunks.length === 0) {
        reject(new Error("WebSocket closed without returning audio. Check model name or API limits."));
      } else {
        resolve(processChunks(chunks));
      }
    };
  });
};

export const generateTextLive = async (
  prompt: string,
  apiKey: string
): Promise<string> => {
  let accumulatedText = "";

  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error("API Key is missing for Live API."));
      return;
    }

    let isDone = false;
    const timeoutId = setTimeout(() => {
      if (isDone) return;
      isDone = true;
      if (accumulatedText.length > 0) {
        resolve(accumulatedText);
      } else {
        reject(new Error("WebSocket connection timed out for text generation (120s)."));
      }
    }, 120000);

    const cleanup = () => {
      isDone = true;
      clearTimeout(timeoutId);
    };

    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`);
    
    ws.onopen = () => {
      const setupMessage = {
        setup: {
          model: "models/gemini-3.8-live",
          generationConfig: {
            responseModalities: ["TEXT"]
          }
        }
      };
      ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = async (event) => {
      if (isDone) return;
      try {
        let textData = '';
        if (typeof event.data === 'string') {
          textData = event.data;
        } else if (event.data instanceof Blob) {
          textData = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          textData = new TextDecoder().decode(event.data);
        } else {
          return;
        }

        const msg = JSON.parse(textData);
        
        if (msg.error) {
          cleanup();
          ws.close();
          if (accumulatedText.length > 0) resolve(accumulatedText);
          else reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          return;
        }
        
        if (msg.setupComplete) {
          const clientContent = {
            clientContent: {
              turns: [{
                role: "user",
                parts: [{ text: prompt }]
              }],
              turnComplete: true
            }
          };
          ws.send(JSON.stringify(clientContent));
        }
        
        if (msg.serverContent?.modelTurn) {
          const parts = msg.serverContent.modelTurn.parts;
          if (parts) {
            for (const part of parts) {
              if (part.text) {
                accumulatedText += part.text;
              }
            }
          }
        }
        
        if (msg.serverContent?.turnComplete) {
          cleanup();
          ws.close();
          resolve(accumulatedText);
        }
      } catch (err: any) {
        cleanup();
        ws.close();
        if (accumulatedText.length > 0) resolve(accumulatedText);
        else reject(new Error("Error parsing WebSocket text message: " + (err.message || String(err))));
      }
    };
    
    ws.onerror = (err) => {
      if (isDone) return;
      cleanup();
      if (accumulatedText.length > 0) resolve(accumulatedText);
      else reject(new Error("WebSocket network error occurred."));
    };

    ws.onclose = () => {
      if (isDone) return;
      cleanup();
      if (accumulatedText.length === 0) {
        reject(new Error("WebSocket closed without returning text."));
      } else {
        resolve(accumulatedText);
      }
    };
  });
};
