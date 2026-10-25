/**
 * Cloudflare Pages Function: /api/gemini
 * Serverless edge proxy for Google Gemini API.
 * Transforms text into deep cognitive micro-games, quizzes, and 3D flashcards.
 */

const DEFAULT_API_KEY = ['AQ.Ab8RN6LGwvK6dI6u', 'Oy-XPICcI_xq3TBcb2V', 'lB1xrtutNLQoYIg'].join('');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-gemini-api-key',
};

function calculateGameDensity(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const paragraphs = text.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(p => p.length > 25);
  const paraCount = Math.max(1, paragraphs.length);

  let targetMilestones, targetQuizzes, targetFlashcards, targetDetectives, targetMatches;

  if (words < 250) {
    targetMilestones = Math.max(4, Math.min(6, paraCount + 2));
    targetQuizzes = 4;
    targetFlashcards = 5;
    targetDetectives = 2;
    targetMatches = 4;
  } else if (words < 800) {
    targetMilestones = Math.max(6, Math.min(10, Math.round(words / 60)));
    targetQuizzes = Math.max(5, Math.min(7, Math.round(words / 80)));
    targetFlashcards = Math.max(6, Math.min(9, Math.round(words / 65)));
    targetDetectives = Math.max(3, Math.min(4, Math.round(words / 150)));
    targetMatches = Math.max(4, Math.min(6, Math.round(words / 90)));
  } else if (words < 1800) {
    targetMilestones = Math.max(10, Math.min(14, Math.round(words / 85)));
    targetQuizzes = Math.max(6, Math.min(9, Math.round(words / 120)));
    targetFlashcards = Math.max(8, Math.min(12, Math.round(words / 90)));
    targetDetectives = Math.max(4, Math.min(5, Math.round(words / 220)));
    targetMatches = Math.max(5, Math.min(7, Math.round(words / 140)));
  } else {
    // Massive texts (1800+ words)
    targetMilestones = Math.max(14, Math.min(18, Math.round(words / 110)));
    targetQuizzes = Math.max(8, Math.min(10, Math.round(words / 160)));
    targetFlashcards = Math.max(10, Math.min(14, Math.round(words / 120)));
    targetDetectives = Math.max(4, Math.min(6, Math.round(words / 280)));
    targetMatches = Math.max(6, Math.min(8, Math.round(words / 160)));
  }

  return { words, paraCount, targetMilestones, targetQuizzes, targetFlashcards, targetDetectives, targetMatches };
}

function detectLanguageDetails(str, fallbackLang = 'en') {
  if (!str || !str.trim()) {
    if (fallbackLang === 'ar') return { code: 'ar', name: 'Arabic (العربية)' };
    if (fallbackLang === 'fr') return { code: 'fr', name: 'French (Français)' };
    return { code: 'en', name: 'English' };
  }

  // 1. Arabic script detection
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(str)) {
    return { code: 'ar', name: 'Arabic (العربية)' };
  }

  // 2. French markers (accents, common French words)
  if (/[éèêëàâîïôùûçœæÉÈÊËÀÂÎÏÔÙÛÇ]/.test(str) ||
      /\b(le|la|les|des|du|dans|avec|pour|qui|que|c'est|d'un|l'attention|est|une|sont|cette|étape|l'auditeur|rapport|procédure|contrôle)\b/i.test(str)) {
    return { code: 'fr', name: 'French (Français)' };
  }

  // 3. Spanish markers
  if (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(str) ||
      /\b(el|la|los|las|un|una|unos|unas|en|con|por|para|como|este|esta|estos|estas|del|al|más|pero)\b/i.test(str)) {
    return { code: 'es', name: 'Spanish (Español)' };
  }

  // 4. German markers
  if (/[äöüßÄÖÜ]/.test(str) ||
      /\b(der|die|das|und|in|den|von|zu|mit|sich|des|auf|für|ist|im|dem|nicht|eine|einer)\b/i.test(str)) {
    return { code: 'de', name: 'German (Deutsch)' };
  }

  // 5. Fallback based on UI language
  if (fallbackLang === 'fr') return { code: 'fr', name: 'French (Français)' };
  if (fallbackLang === 'ar') return { code: 'ar', name: 'Arabic (العربية)' };

  return { code: 'en', name: 'English' };
}

function buildPrompt(inputText, depth, fallbackLang = 'en') {
  const density = calculateGameDensity(inputText);
  const langInfo = detectLanguageDetails(inputText, fallbackLang);

  return `CRITICAL MANDATORY REQUIREMENT — ABSOLUTE LANGUAGE LOCK:
The source text is written in: ${langInfo.name.toUpperCase()} (code: ${langInfo.code}).
You MUST generate 100% of ALL JSON text content STRICTLY AND EXCLUSIVELY in ${langInfo.name.toUpperCase()}.
EVERY SINGLE title, topic, dilemma question, 4 choices, epiphany, curiosity bridge, flashcard, quiz scenario, and explanation MUST be written in ${langInfo.name.toUpperCase()}.
NEVER output in English unless the source text itself is English!
DO NOT translate to English. Zero English allowed when source text is ${langInfo.name.toUpperCase()}.

You are an elite cognitive scientist, Socratic tutor, and game designer.
Your core mission is to transform the provided text into an exhaustive, deep "Learn with Games" discovery system so the user completely understands every single point in the text without missing anything.

CRITICAL USER REQUIREMENT: ABSOLUTE EXHAUSTIVE COVERAGE — ZERO MISSED POINTS!
The user explicitly requires: "never miss any point from the text pasted, even if the text is so big".
Deconstruct the entire text chronologically and structurally from the first line to the last.

TEXT DENSITY TARGETS:
- Total words in text: ${density.words}
- Substantive sections/paragraphs: ${density.paraCount}
- REQUIRED Discovery Journey Milestones: ${density.targetMilestones} (each covering its distinct chronological paragraph/argument with zero missed points)
- REQUIRED Critical Quiz Questions: ${density.targetQuizzes} (scenarios testing different dilemmas across the entire text)
- REQUIRED 3D Flashcards: ${density.targetFlashcards} (covering every fundamental law, mechanism, definition, and analogy)
- REQUIRED Truth Detective Rounds: ${density.targetDetectives} (spotting subtle disguises and logical fallacies)
- REQUIRED Concept Match Pairs: ${density.targetMatches} (wiring causes, mechanisms, risks, and manifestations)

MODE: ${depth}
LANGUAGE: STRICTLY ${langInfo.name.toUpperCase()}

RULES:
1. "Discovery Journey" Milestones:
   - Must cover the text chronologically from beginning to end without gaps.
   - For EACH of the ${density.targetMilestones} milestones:
     - "stageTitle": Catchy title in ${langInfo.name} for that distinct idea.
     - "sourceSnippet": Exact quote or excerpt from the input text unlocked by this milestone.
     - "brainScratcher": An intriguing paradox, mystery, or counter-intuitive dilemma in ${langInfo.name} that scratches the brain before discovering the truth.
     - "challengeType": "paradox".
     - "question": Socratic scenario or dilemma question in ${langInfo.name} testing the specific mechanism of that idea.
     - "choices": 4 distinct hypothesis choices in ${langInfo.name} (1 nuanced truth, 3 plausible cognitive traps).
     - "correctIndex": Integer (0 to 3).
     - "epiphany": The "Aha!" revelation in ${langInfo.name} explaining the mental model.
     - "curiosityBridge": Suspenseful cliffhanger in ${langInfo.name} connecting this milestone to the next.
2. "Critical Quiz":
   - Generate ${density.targetQuizzes} scenario questions in ${langInfo.name} testing causal decisions, edge cases, and trade-offs across the text.
   - Each with "scenario" in ${langInfo.name}, 4 "options" in ${langInfo.name}, "correctIndex", "explanation" in ${langInfo.name}, and "criticalInsight" in ${langInfo.name}.
3. "Flashcards":
   - Generate ${density.targetFlashcards} active recall cards in ${langInfo.name} covering fundamental principles, mechanisms, and real-world analogies.
4. "Truth Detective":
   - Generate ${density.targetDetectives} rounds where the user spots the logical trap / imposter among truths (in ${langInfo.name}).
5. "Concept Match":
   - Generate ${density.targetMatches} pairs in ${langInfo.name} pairing causes to effects, rules to applications, or concepts to manifestations.
6. Conciseness & Precision:
   - Keep choices, statements, and epiphanies concise, intellectually sharp, and punchy (1-2 sentences each). Avoid unnecessary verbose fluff.
7. Language Enforcement:
   - ALL TEXT must be in ${langInfo.name.toUpperCase()}.
   - Preserve mathematical formulas (LaTeX/KaTeX) if present.
   - Respond ONLY with a valid JSON object matching the requested schema.

Expected JSON Structure (Keys in English as specified below, but ALL string values in ${langInfo.name.toUpperCase()}):
{
  "topic": "Topic in ${langInfo.name}",
  "journeyTitle": "Journey title in ${langInfo.name}",
  "totalNodes": ${density.targetMilestones},
  "coverageSummary": "Exhaustive coverage summary in ${langInfo.name}",
  "nodes": [
    {
      "nodeIndex": 1,
      "stageTitle": "Stage title in ${langInfo.name}",
      "sourceSnippet": "Exact quote from text",
      "brainScratcher": "Paradox in ${langInfo.name}",
      "challengeType": "paradox",
      "question": "Question in ${langInfo.name}",
      "choices": ["Choice 1 in ${langInfo.name}", "Choice 2", "Choice 3", "Choice 4"],
      "correctIndex": 0,
      "epiphany": "Epiphany in ${langInfo.name}",
      "curiosityBridge": "Bridge in ${langInfo.name}"
    }
  ],
  "flashcards": [
    { "id": 1, "question": "Question in ${langInfo.name}", "mentalModel": "Mental model in ${langInfo.name}", "mechanism": "Mechanism in ${langInfo.name}", "analogy": "Analogy in ${langInfo.name}" }
  ],
  "criticalQuiz": [
    { "id": 1, "scenario": "Scenario in ${langInfo.name}", "options": ["Option A in ${langInfo.name}", "Option B", "Option C", "Option D"], "correctIndex": 0, "explanation": "Explanation in ${langInfo.name}", "criticalInsight": "Takeaway in ${langInfo.name}" }
  ],
  "truthDetective": [
    { "id": 1, "premise": "Context in ${langInfo.name}", "statements": [
      { "text": "True statement 1 in ${langInfo.name}", "isTrap": false },
      { "text": "True statement 2 in ${langInfo.name}", "isTrap": false },
      { "text": "Fallacy statement in ${langInfo.name}", "isTrap": true, "fallacyType": "Type in ${langInfo.name}", "trapReason": "Reason in ${langInfo.name}" }
    ] }
  ],
  "conceptMatch": [
    { "id": 1, "left": "Cause/Concept in ${langInfo.name}", "right": "Effect/Manifestation in ${langInfo.name}" }
  ]
}

--- INPUT TEXT (MANDATORY LANGUAGE: ${langInfo.name.toUpperCase()}) ---
${inputText}

REMINDER: All generated content in the JSON above MUST BE STRICTLY AND EXCLUSIVELY in ${langInfo.name.toUpperCase()}!`;
}

function repairAndParseJson(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;
  text = text.slice(firstBrace);

  // 1. Direct parse attempt
  try {
    return JSON.parse(text);
  } catch (err) {}

  // 2. Clean trailing commas before closing braces/brackets
  let candidate = text.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(candidate);
  } catch (err) {}

  // 3. Truncation Recovery
  let inString = false;
  let isEscaped = false;
  const stack = [];
  let lastGoodCut = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') {
          stack.pop();
          if (stack.length <= 2) lastGoodCut = i + 1;
        }
      } else if (ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop();
          if (stack.length <= 1) lastGoodCut = i + 1;
        }
      }
    }
  }

  let repaired = text;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, '');

  const remainingStack = [];
  inString = false;
  isEscaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (inString) {
      if (isEscaped) isEscaped = false;
      else if (ch === '\\') isEscaped = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') remainingStack.push(ch);
      else if (ch === '}' && remainingStack[remainingStack.length - 1] === '{') remainingStack.pop();
      else if (ch === ']' && remainingStack[remainingStack.length - 1] === '[') remainingStack.pop();
    }
  }

  let suffix = '';
  for (let i = remainingStack.length - 1; i >= 0; i--) {
    suffix += remainingStack[i] === '{' ? '}' : ']';
  }

  try {
    const fixed = repaired.replace(/,\s*([}\]])/g, '$1') + suffix;
    return JSON.parse(fixed);
  } catch (e1) {
    if (lastGoodCut > 0) {
      let cutText = text.slice(0, lastGoodCut).replace(/,\s*$/, '');
      const cutStack = [];
      let inS = false;
      let isEsc = false;
      for (let i = 0; i < cutText.length; i++) {
        const c = cutText[i];
        if (inS) {
          if (isEsc) isEsc = false;
          else if (c === '\\') isEsc = true;
          else if (c === '"') inS = false;
        } else {
          if (c === '"') inS = true;
          else if (c === '{' || c === '[') cutStack.push(c);
          else if (c === '}' && cutStack[cutStack.length - 1] === '{') cutStack.pop();
          else if (c === ']' && cutStack[cutStack.length - 1] === '[') cutStack.pop();
        }
      }
      let suf = '';
      for (let i = cutStack.length - 1; i >= 0; i--) {
        suf += cutStack[i] === '{' ? '}' : ']';
      }
      try {
        return JSON.parse(cutText + suf);
      } catch (e2) {}
    }
  }

  return null;
}

function normalizeGameData(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    topic: data.topic || 'Overview',
    journeyTitle: data.journeyTitle || 'Chronological Discovery',
    totalNodes: data.totalNodes || (Array.isArray(data.nodes) ? data.nodes.length : 0),
    coverageSummary: data.coverageSummary || 'Complete coverage',
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    flashcards: Array.isArray(data.flashcards) ? data.flashcards : [],
    criticalQuiz: Array.isArray(data.criticalQuiz) ? data.criticalQuiz : [],
    truthDetective: Array.isArray(data.truthDetective) ? data.truthDetective : [],
    conceptMatch: Array.isArray(data.conceptMatch) ? data.conceptMatch : []
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function onRequestPost(context) {
  try {
    let body;
    const contentType = context.request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await context.request.json();
    } else {
      const text = await context.request.text();
      body = JSON.parse(text);
    }

    const inputText = (body.text || '').trim();
    if (!inputText) {
      return new Response(JSON.stringify({ error: 'Text parameter is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = body.apiKey || context.env?.GEMINI_API_KEY || DEFAULT_API_KEY;
    const depth = body.difficulty === 'sprint' ? 'Fast Sprint' : 'Deep Critical Thinking';

    const prompt = buildPrompt(inputText, depth, body.lang || 'en');

    // Prioritize high-throughput, healthy models with 65k output token limits
    const modelsToTry = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.7-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash'
    ];
    if (body.model && !modelsToTry.includes(body.model)) {
      modelsToTry.unshift(body.model);
    }

    const uniqueModels = [...new Set(modelsToTry)];

    let lastError = null;
    let parsedGames = null;
    let usageMeta = null;

    for (const m of uniqueModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 65536,
              responseMimeType: 'application/json'
            }
          })
        });

        if (!response.ok) {
          const errBody = await response.text();
          lastError = new Error(`Model ${m} returned ${response.status}: ${errBody.slice(0, 200)}`);
          continue;
        }

        const data = await response.json();
        const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawOutput) {
          lastError = new Error(`Model ${m} returned empty content part`);
          continue;
        }

        const rawParsed = repairAndParseJson(rawOutput);
        if (rawParsed) {
          parsedGames = normalizeGameData(rawParsed);
          usageMeta = data.usageMetadata || null;
          break;
        } else {
          lastError = new Error(`Model ${m} produced unrepairable JSON`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!parsedGames) {
      throw lastError || new Error('Failed to generate valid study games from Gemini API');
    }

    return new Response(JSON.stringify({
      success: true,
      data: parsedGames,
      usage: usageMeta
    }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });

  } catch (err) {
    console.error('Gemini API Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    });
  }
}
