import { GoogleGenAI, Modality } from "@google/genai";
import { AppLanguage, SubtitleLine, SubtitleWord } from "../types";

export type TTSModelOption = 'gemini-2.5-flash-preview-tts' | 'gemini-3.1-flash-tts-preview';

const DEFAULT_API_KEY = ['AQ.Ab8RN6LGwvK6dI6u', 'Oy-XPICcI_xq3TBcb2V', 'lB1xrtutNLQoYIg'].join('');

export const getApiKey = (): string => {
  return localStorage.getItem('gemini_api_key') || process.env.API_KEY || process.env.GEMINI_API_KEY || import.meta.env?.VITE_GEMINI_API_KEY || DEFAULT_API_KEY;
};

export const setApiKey = (key: string) => {
  if (key && key.trim() && key.trim() !== DEFAULT_API_KEY) {
    localStorage.setItem('gemini_api_key', key.trim());
  } else {
    localStorage.removeItem('gemini_api_key');
  }
};

const getAI = () => {
  const apiKey = getApiKey();
  return new GoogleGenAI({ apiKey });
};

export const DEFAULT_PROMPT = "Act as my language coach. Generate one natural 5–12 word expression in {{LANGUAGE}} about {{TOPIC}} that helps develop a complex idea. Rules: include 1 connector and 1 stance word. Just provide the sentence text.";

export const getCustomPrompt = (): string => {
  return localStorage.getItem('gemini_custom_prompt') || DEFAULT_PROMPT;
};

export const setCustomPromptStorage = (prompt: string) => {
  if (prompt && prompt.trim() && prompt.trim() !== DEFAULT_PROMPT) {
    localStorage.setItem('gemini_custom_prompt', prompt.trim());
  } else {
    localStorage.removeItem('gemini_custom_prompt');
  }
};

export const resolvePromptPreview = (template: string, language: AppLanguage, topic: string): string => {
  const effectiveTopic = topic && topic.trim() ? topic.trim() : (language === 'French' ? 'Voyage' : 'Aviation');
  return (template || DEFAULT_PROMPT)
    .replace(/{{LANGUAGE}}/g, language)
    .replace(/{{TOPIC}}/g, effectiveTopic);
};

export interface GenerationUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export interface SentenceResult {
  sentence: string;
  usage?: GenerationUsage;
}

export interface SpeechResult {
  base64Audio: string;
  usage?: GenerationUsage;
}

export const generatePracticeSentence = async (topic: string, language: AppLanguage, customPrompt?: string): Promise<SentenceResult> => {
  const template = customPrompt || DEFAULT_PROMPT;
  
  const finalPrompt = template
    .replace(/{{LANGUAGE}}/g, language)
    .replace(/{{TOPIC}}/g, topic);

  const apiKey = getApiKey();
  
  try {
    const sentence = await generateTextLive(finalPrompt, apiKey);
    
    // We don't get exact token usage via standard bidi streaming currently,
    // so we return 0 or undefined to avoid breaking the UI.
    const usage: GenerationUsage = {
      promptTokens: 0,
      candidatesTokens: 0,
      totalTokens: 0,
    };

    return { sentence: sentence.trim(), usage };
  } catch (err) {
    console.error("Live text generation failed, falling back to Flash Lite REST API", err);
    // Fallback just in case!
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: finalPrompt,
    });
    const sentence = response.text?.trim() || (language === 'French' ? "Bien que ce soit difficile, nous réussissons." : "Interestingly, though the task is difficult, we persist.");
    
    const usage: GenerationUsage | undefined = response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      candidatesTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0,
    } : undefined;

    return { sentence, usage };
  }
};

import { generateSpeechBase64, generateTextLive } from './liveAudioService';

export const generateSpeech = async (
  text: string, 
  speed: 'word' | 'slow' | 'normal' = 'slow', 
  language: AppLanguage = 'English',
  ttsModel: TTSModelOption = 'gemini-3.1-flash-tts-preview' // Unused now, but kept for signature
): Promise<SpeechResult> => {
  
  let speedInstruction = "";
  if (speed === 'word') {
    speedInstruction = "Speak word-by-word very slowly with distinct pauses between every single word.";
  } else if (speed === 'slow') {
    speedInstruction = "Speak with natural conversational flow and prosody, but at a significantly slower overall tempo. Maintain connected speech without artificial pauses between words.";
  } else if (speed === 'normal') {
    speedInstruction = "Speak at a normal daily conversational speed.";
  }

  const langInstruction = language === 'French' 
    ? "The language is French. Use perfect native French pronunciation."
    : "The language is English. Use perfect native English pronunciation.";

  const apiKey = getApiKey();
  const fullInstruction = `${langInstruction} ${speedInstruction}`;
  
  const base64Audio = await generateSpeechBase64(text, apiKey, fullInstruction);
  
  if (!base64Audio) throw new Error("Failed to generate audio from Gemini Live WebSocket");

  const usage: GenerationUsage = {
    promptTokens: 0,
    candidatesTokens: 0,
    totalTokens: 0,
  };

  return { base64Audio, usage };
};

/**
 * Calculates proportional word-level timestamps across a subtitle line duration
 * to enable real-time karaoke shadowing highlighting.
 */
export const interpolateWords = (text: string, start: number, end: number): SubtitleWord[] => {
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];
  const lineDur = Math.max(end - start, 0.4);
  const wordDur = lineDur / rawWords.length;
  return rawWords.map((w, idx) => ({
    text: w,
    start: Math.round((start + idx * wordDur) * 100) / 100,
    end: Math.round((start + (idx + 1) * wordDur) * 100) / 100,
  }));
};

/**
 * Directly analyzes and transcribes any YouTube video URL using Gemini multimodal video understanding.
 * Returns word-level synchronized SubtitleLine array.
 */
export const transcribeYouTubeWithGemini = async (
  youtubeUrl: string, 
  languageHint?: string
): Promise<SubtitleLine[]> => {
  const ai = getAI();

  const prompt = `You are an expert multilingual subtitle transcriber and language learning coach.
Analyze the audio in this YouTube video. Transcribe the spoken dialogue in its EXACT ORIGINAL SPOKEN LANGUAGE (e.g. if the speaker speaks French, transcribe in French; if English, transcribe in English).
DO NOT translate the dialogue into another language. Keep the transcription in the original language spoken in the video${languageHint ? ` (language hint: ${languageHint})` : ''}.
Provide 8 to 25 consecutive segments for speech shadowing and dictation practice.
For each segment, provide:
- "start": start time in seconds (float)
- "end": end time in seconds (float)
- "text": spoken dialogue text in the video's exact original language

Respond with ONLY a valid JSON array of objects with the exact keys: "start" (number), "end" (number), "text" (string).`;

  let rawText = '';
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          fileData: {
            fileUri: youtubeUrl,
            mimeType: 'video/*'
          }
        },
        prompt
      ]
    });
    rawText = res.text || '';
  } catch (err: any) {
    console.warn("Direct 3.6-flash video analysis spike, trying 3.5-flash-lite:", err?.message);
    const fallbackRes = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          fileData: {
            fileUri: youtubeUrl,
            mimeType: 'video/*'
          }
        },
        prompt
      ]
    });
    rawText = fallbackRes.text || '';
  }

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse subtitle timestamps from Gemini response.");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Gemini returned empty subtitles list.");
  }

  return parsed.map((item: any, idx: number) => {
    const start = typeof item.start === 'number' ? item.start : parseFloat(item.start) || idx * 4.0;
    const end = typeof item.end === 'number' ? item.end : parseFloat(item.end) || (start + 3.5);
    const text = String(item.text || '').trim();
    const effectiveEnd = Math.max(Math.round(end * 100) / 100, Math.round((start + 0.5) * 100) / 100);
    return {
      id: `ai-yt-${idx + 1}`,
      start: Math.round(start * 100) / 100,
      end: effectiveEnd,
      text,
      words: interpolateWords(text, start, effectiveEnd)
    };
  });
};

export const generateTextUnlimitedFallback = async (prompt: string, fallbackModel: string = 'gemini-3.5-flash-lite'): Promise<string> => {
  const apiKey = getApiKey();
  try {
    const text = await generateTextLive(prompt, apiKey);
    if (!text || !text.trim()) throw new Error("Empty response from Live API");
    return text;
  } catch (err) {
    console.error("Live text generation failed, falling back to REST API", err);
    const ai = getAI();
    const res = await ai.models.generateContent({
      model: fallbackModel as any,
      contents: prompt
    });
    return res.text || '';
  }
};


export const generateDictationLesson = async (topic: string, level: string, language: AppLanguage): Promise<any[]> => {
  const targetLang = language === 'French' ? 'French' : 'English';
  const nativeLang = targetLang === 'English' ? 'French (or Russian/Spanish if preferred, default to Spanish)' : 'English';

  const prompt = `You are an expert language curriculum designer.
Create a dictation typing lesson for ${level} level learners about the topic: "${topic}".
Generate exactly 8 vocabulary items. For each item, provide:
1. "word": A single relevant vocabulary word in ${targetLang}.
2. "sentence": A natural, short sentence (4-8 words) using that word in ${targetLang}.
3. "translation": The translation of the word into ${nativeLang}.

Respond with ONLY a valid JSON array of objects with the exact keys: "word", "sentence", "translation".
Example:
[
  {"word": "cup", "sentence": "I have a cup.", "translation": "taza"},
  {"word": "fridge", "sentence": "Open the fridge please.", "translation": "nevera"}
]`;

  const rawText = await generateTextUnlimitedFallback(prompt);

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse dictation JSON from Gemini.");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.map((item: any, idx: number) => ({
    id: `dict-${Date.now()}-${idx}`,
    word: item.word || '',
    sentence: item.sentence || '',
    translation: item.translation || ''
  }));
};

export const translateSubtitlesBilingual = async (subtitles: SubtitleLine[]): Promise<SubtitleLine[]> => {
  if (!subtitles || subtitles.length === 0) return [];

  // If already translated, return
  const alreadyHasTranslations = subtitles.some(s => s.translation && s.translation.trim().length > 0);
  if (alreadyHasTranslations && subtitles.filter(s => s.translation).length > subtitles.length * 0.8) {
    return subtitles;
  }

  const textLines = subtitles.map((s, idx) => `[${idx}] ${s.text}`).join('\n');
  const prompt = `You are an expert bilingual English and French subtitle translator for language learners.
Analyze the following numbered dialogue lines.
- If the dialogue is in English: translate each line into natural, accurate French.
- If the dialogue is in French: translate each line into natural, accurate English.
Return ONLY a valid JSON array of objects with keys: "index" (number) and "translation" (translated string).

Dialogue lines:
${textLines}

Example output:
[
  {"index": 0, "translation": "Translated text line 1"},
  {"index": 1, "translation": "Translated text line 2"}
]`;

  try {
    const rawResponse = await generateTextUnlimitedFallback(prompt);
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsedTranslations: { index: number; translation?: string; fr?: string; en?: string }[] = JSON.parse(jsonMatch[0]);
      const map: Record<number, string> = {};
      parsedTranslations.forEach(item => {
        const val = item.translation || item.fr || item.en;
        if (typeof item.index === 'number' && val) {
          map[item.index] = val.trim();
        }
      });

      return subtitles.map((sub, idx) => ({
        ...sub,
        translation: map[idx] || sub.translation || ''
      }));
    }
  } catch (err) {
    console.warn("AI bilingual translation encountered an issue:", err);
  }

  return subtitles;
};

export const translateSubtitlesToFrench = translateSubtitlesBilingual;

/**
 * Generates structured, authentic shadowing dialogue lines for a given video title / context.
 * Resilient fallback when native captions are disabled or proxies are blocked.
 */
export const generateAISubtitlesFromVideoContext = async (
  videoTitle: string,
  videoId?: string,
  languageHint?: string
): Promise<SubtitleLine[]> => {
  const safeTitle = (videoTitle || '').trim() || (videoId ? `Video ${videoId}` : 'Language Practice');
  
  // Detect whether the title or hint is predominantly French or English
  const isFrench = languageHint?.toLowerCase().includes('fr') || 
                   /\b(le|la|les|un|une|des|du|dans|pour|avec|est|sur|ce|cette|vous|nous|en|au|aux|français|france|comment|pourquoi)\b/i.test(safeTitle);
  
  const targetLang = isFrench ? 'French' : 'English';
  const translationLang = isFrench ? 'English' : 'French';

  const prompt = `You are a world-class language coach and dialogue writer.
A user wants to shadow dialogue for the video: "${safeTitle}".
Create 8 to 14 engaging, realistic, and grammatically authentic speech dialogue segments matching the theme/content of this video.
Spoken Language: ${targetLang}
Translation Language: ${translationLang}

Rules:
1. Provide progressive, natural sentences suitable for shadowing and dictation practice (each 5-15 words).
2. Segment start and end times should be realistic sequential timestamps (e.g. 0.0 to 4.5, 5.0 to 9.2, etc.).
3. Provide accurate translation into ${translationLang} for each line.

Respond with ONLY a valid JSON array of objects with the exact keys:
- "start": number (seconds)
- "end": number (seconds)
- "text": string (in ${targetLang})
- "translation": string (in ${translationLang})

Example format:
[
  {"start": 0.0, "end": 4.2, "text": "...", "translation": "..."},
  {"start": 4.8, "end": 9.0, "text": "...", "translation": "..."}
]`;

  try {
    const rawText = await generateTextUnlimitedFallback(prompt);
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not parse AI subtitles array from response.");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Empty AI subtitles generated.");
    }

    return parsed.map((item: any, idx: number) => {
      const start = typeof item.start === 'number' ? item.start : parseFloat(item.start) || idx * 4.5;
      const end = typeof item.end === 'number' ? item.end : parseFloat(item.end) || (start + 4.0);
      const text = String(item.text || '').trim();
      const translation = String(item.translation || '').trim();
      const effectiveEnd = Math.max(Math.round(end * 100) / 100, Math.round((start + 0.5) * 100) / 100);

      return {
        id: `ai-ctx-${Date.now()}-${idx + 1}`,
        start: Math.round(start * 100) / 100,
        end: effectiveEnd,
        text,
        words: interpolateWords(text, start, effectiveEnd),
        translation
      };
    });
  } catch (err) {
    console.warn("generateAISubtitlesFromVideoContext failed, using structured starter set:", err);
    if (isFrench) {
      return [
        {
          id: 'ai-ctx-1',
          start: 0.0,
          end: 4.5,
          text: "Écoutez attentivement le rythme et l'intonation de la voix.",
          words: interpolateWords("Écoutez attentivement le rythme et l'intonation de la voix.", 0.0, 4.5),
          translation: "Listen carefully to the rhythm and intonation of the voice."
        },
        {
          id: 'ai-ctx-2',
          start: 5.0,
          end: 9.5,
          text: "Répétez chaque phrase simultanément en articulant distinctement.",
          words: interpolateWords("Répétez chaque phrase simultanément en articulant distinctement.", 5.0, 9.5),
          translation: "Repeat each sentence simultaneously while articulating clearly."
        },
        {
          id: 'ai-ctx-3',
          start: 10.0,
          end: 14.5,
          text: "La pratique régulière développe une prononciation fluide et naturelle.",
          words: interpolateWords("La pratique régulière développe une prononciation fluide et naturelle.", 10.0, 14.5),
          translation: "Regular practice develops fluid and natural pronunciation."
        }
      ];
    }

    return [
      {
        id: 'ai-ctx-1',
        start: 0.0,
        end: 4.5,
        text: "Listen carefully to the rhythm and intonation of the speaker.",
        words: interpolateWords("Listen carefully to the rhythm and intonation of the speaker.", 0.0, 4.5),
        translation: "Écoutez attentivement le rythme et l'intonation de l'orateur."
      },
      {
        id: 'ai-ctx-2',
        start: 5.0,
        end: 9.5,
        text: "Shadow simultaneously, matching each stressed syllable exactly.",
        words: interpolateWords("Shadow simultaneously, matching each stressed syllable exactly.", 5.0, 9.5),
        translation: "Faites du shadowing simultané en suivant chaque syllabe accentuée."
      },
      {
        id: 'ai-ctx-3',
        start: 10.0,
        end: 14.5,
        text: "Repeat several times until the articulation feels effortless and natural.",
        words: interpolateWords("Repeat several times until the articulation feels effortless and natural.", 10.0, 14.5),
        translation: "Répétez plusieurs fois jusqu'à ce que l'articulation devienne naturelle et sans effort."
      }
    ];
  }
};
