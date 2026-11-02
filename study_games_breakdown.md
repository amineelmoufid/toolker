# Toolker Reader: Study Games (✓) Cognitive Architecture Breakdown

This document provides a comprehensive technical breakdown of the **Study Games** (`✓ Study Games` / `Brain Gym`) feature inside Toolker Reader. It details the underlying pedagogical theory, dynamic density scaling, the exact Gemini system prompt, multi-language enforcement, the 5 interactive cognitive micro-game modes, state management, and the resilient JSON repair pipeline.

---

## 1. Executive Summary & UI Lifecycle

The **Study Games** engine transforms any arbitrary article, textbook excerpt, paper, or video transcript pasted into Toolker Reader into an exhaustive cognitive playground designed for deep comprehension and active recall.

### The "✓" Checkmark Lifecycle
In the Reader top control bar, the button (`#btnOpenBrainGym`) transitions through three distinct reactive states:

```
┌─────────────────────────────────┐
│ State 1: IDLE                   │
│ Button: [ 📖 Study Games ]      │  Text is present in Reader, but games have not been generated yet.
└────────────────┬────────────────┘
                 │ User clicks button or loads text
                 ▼
┌─────────────────────────────────┐
│ State 2: GENERATING             │
│ Button: [ 🔄 Generating... ]    │  Gemini processes text at edge. Button displays animated spinner.
└────────────────┬────────────────┘
                 │ JSON payload received and validated
                 ▼
┌─────────────────────────────────┐
│ State 3: READY / CACHED         │
│ Button: [ ✓ Study Games ]       │  Games are fully generated, verified, and cached in browser memory.
└─────────────────────────────────┘
```

> **Automatic Invalidation:** If the user edits, deletes, or pastes significantly different text into the Reader canvas, `isBrainGymCacheValidForText()` automatically invalidates the cache, drops the `✓` checkmark, and resets the button to State 1 to ensure games always align with active content.

---

## 2. The Complete Gemini Master Prompt

The prompt is constructed dynamically by `buildPrompt(inputText, depth, fallbackLang)` in `functions/api/gemini.js` (and mirrored in `public/reader/app.js` for offline/direct client fallback).

### The Exact Prompt Template

```markdown
CRITICAL MANDATORY REQUIREMENT — ABSOLUTE LANGUAGE LOCK:
The source text is written in: {LANG_NAME} (code: {LANG_CODE}).
You MUST generate 100% of ALL JSON text content STRICTLY AND EXCLUSIVELY in {LANG_NAME}.
EVERY SINGLE title, topic, dilemma question, 4 choices, epiphany, curiosity bridge, flashcard, quiz scenario, and explanation MUST be written in {LANG_NAME}.
NEVER output in English unless the source text itself is English!
DO NOT translate to English. Zero English allowed when source text is {LANG_NAME}.

You are an elite cognitive scientist, Socratic tutor, and game designer.
Your core mission is to transform the provided text into an exhaustive, deep "Learn with Games" discovery system so the user completely understands every single point in the text without missing anything.

CRITICAL USER REQUIREMENT: ABSOLUTE EXHAUSTIVE COVERAGE — ZERO MISSED POINTS!
The user explicitly requires: "never miss any point from the text pasted, even if the text is so big".
Deconstruct the entire text chronologically and structurally from the first line to the last.

TEXT DENSITY TARGETS:
- Total words in text: {DENSITY_WORDS}
- Substantive sections/paragraphs: {DENSITY_PARAS}
- REQUIRED Discovery Journey Milestones: {TARGET_MILESTONES} (each covering its distinct chronological paragraph/argument with zero missed points)
- REQUIRED Critical Quiz Questions: {TARGET_QUIZZES} (scenarios testing different dilemmas across the entire text)
- REQUIRED 3D Flashcards: {TARGET_FLASHCARDS} (covering every fundamental law, mechanism, definition, and analogy)
- REQUIRED Truth Detective Rounds: {TARGET_DETECTIVES} (spotting subtle disguises and logical fallacies)
- REQUIRED Concept Match Pairs: {TARGET_MATCHES} (wiring causes, mechanisms, risks, and manifestations)

MODE: {DEPTH_MODE}  (Fast Sprint | Deep Critical Thinking)
LANGUAGE: STRICTLY {LANG_NAME}

RULES:
1. "Discovery Journey" Milestones:
   - Must cover the text chronologically from beginning to end without gaps.
   - For EACH of the {TARGET_MILESTONES} milestones:
     - "stageTitle": Catchy title in {LANG_NAME} for that distinct idea.
     - "sourceSnippet": Exact quote or excerpt from the input text unlocked by this milestone.
     - "brainScratcher": An intriguing paradox, mystery, or counter-intuitive dilemma in {LANG_NAME} that scratches the brain before discovering the truth.
     - "challengeType": "paradox".
     - "question": Socratic scenario or dilemma question in {LANG_NAME} testing the specific mechanism of that idea.
     - "choices": 4 distinct hypothesis choices in {LANG_NAME} (1 nuanced truth, 3 plausible cognitive traps).
     - "correctIndex": Integer (0 to 3).
     - "epiphany": The "Aha!" revelation in {LANG_NAME} explaining the mental model.
     - "curiosityBridge": Suspenseful cliffhanger in {LANG_NAME} connecting this milestone to the next.
2. "Critical Quiz":
   - Generate {TARGET_QUIZZES} scenario questions in {LANG_NAME} testing causal decisions, edge cases, and trade-offs across the text.
   - Each with "scenario" in {LANG_NAME}, 4 "options" in {LANG_NAME}, "correctIndex", "explanation" in {LANG_NAME}, and "criticalInsight" in {LANG_NAME}.
3. "Flashcards":
   - Generate {TARGET_FLASHCARDS} active recall cards in {LANG_NAME} covering fundamental principles, mechanisms, and real-world analogies.
4. "Truth Detective":
   - Generate {TARGET_DETECTIVES} rounds where the user spots the logical trap / imposter among truths (in {LANG_NAME}).
5. "Concept Match":
   - Generate {TARGET_MATCHES} pairs in {LANG_NAME} pairing causes to effects, rules to applications, or concepts to manifestations.
6. Conciseness & Precision:
   - Keep choices, statements, and epiphanies concise, intellectually sharp, and punchy (1-2 sentences each). Avoid unnecessary verbose fluff.
7. Language Enforcement:
   - ALL TEXT must be in {LANG_NAME}.
   - Preserve mathematical formulas (LaTeX/KaTeX) if present.
   - Respond ONLY with a valid JSON object matching the requested schema.

Expected JSON Structure:
{
  "topic": "Topic in {LANG_NAME}",
  "journeyTitle": "Journey title in {LANG_NAME}",
  "totalNodes": {TARGET_MILESTONES},
  "coverageSummary": "Exhaustive coverage summary in {LANG_NAME}",
  "nodes": [
    {
      "nodeIndex": 1,
      "stageTitle": "Stage title in {LANG_NAME}",
      "sourceSnippet": "Exact quote from text",
      "brainScratcher": "Paradox in {LANG_NAME}",
      "challengeType": "paradox",
      "question": "Question in {LANG_NAME}",
      "choices": ["Choice 1 in {LANG_NAME}", "Choice 2", "Choice 3", "Choice 4"],
      "correctIndex": 0,
      "epiphany": "Epiphany in {LANG_NAME}",
      "curiosityBridge": "Bridge in {LANG_NAME}"
    }
  ],
  "flashcards": [
    {
      "id": 1,
      "question": "Question in {LANG_NAME}",
      "mentalModel": "Mental model in {LANG_NAME}",
      "mechanism": "Mechanism in {LANG_NAME}",
      "analogy": "Analogy in {LANG_NAME}"
    }
  ],
  "criticalQuiz": [
    {
      "id": 1,
      "scenario": "Scenario in {LANG_NAME}",
      "options": ["Option A in {LANG_NAME}", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Explanation in {LANG_NAME}",
      "criticalInsight": "Takeaway in {LANG_NAME}"
    }
  ],
  "truthDetective": [
    {
      "id": 1,
      "premise": "Context in {LANG_NAME}",
      "statements": [
        { "text": "True statement 1 in {LANG_NAME}", "isTrap": false },
        { "text": "True statement 2 in {LANG_NAME}", "isTrap": false },
        { "text": "Fallacy statement in {LANG_NAME}", "isTrap": true, "fallacyType": "Type in {LANG_NAME}", "trapReason": "Reason in {LANG_NAME}" }
      ]
    }
  ],
  "conceptMatch": [
    { "id": 1, "left": "Cause/Concept in {LANG_NAME}", "right": "Effect/Manifestation in {LANG_NAME}" }
  ]
}

--- INPUT TEXT (MANDATORY LANGUAGE: {LANG_NAME}) ---
{SOURCE_TEXT}

REMINDER: All generated content in the JSON above MUST BE STRICTLY AND EXCLUSIVELY in {LANG_NAME}!
```

---

## 3. Dynamic Game Density Engine

Instead of hardcoding a static number of questions, `calculateGameDensity(text)` scales dynamically to guarantee **100% comprehensive coverage** without omitting sections:

| Text Size Category | Word Count Range | Milestones (Journey) | Critical Quizzes | Flashcards | Truth Detectives | Concept Matches |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Micro / Short** | $< 250$ words | 4 – 6 | 4 | 5 | 2 | 4 |
| **Standard Article** | $250 - 800$ words | 6 – 10 (`words / 60`) | 5 – 7 (`words / 80`) | 6 – 9 (`words / 65`) | 3 – 4 (`words / 150`) | 4 – 6 (`words / 90`) |
| **Deep Study / Paper** | $800 - 1800$ words | 10 – 14 (`words / 85`) | 6 – 9 (`words / 120`) | 8 – 12 (`words / 90`) | 4 – 5 (`words / 220`) | 5 – 7 (`words / 140`) |
| **Massive Chapter** | $1800+$ words | 14 – 18 (`words / 110`) | 8 – 10 (`words / 160`) | 10 – 14 (`words / 120`) | 4 – 6 (`words / 280`) | 6 – 8 (`words / 160`) |

---

## 4. Multi-Language Intelligence & Absolute Language Lock

To prevent models from inadvertently defaulting or translating content to English, `detectLanguageDetails(inputText, fallbackLang)` scans the source text across Unicode code-points and morphological markers:

1. **Arabic (`ar`)**: Checked via Unicode ranges `[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]`.
2. **French (`fr`)**: Accents (`é`, `è`, `ê`, `à`, `ç`, `œ`) and syntax particles (`l'attention`, `procédure`, `d'un`, `c'est`).
3. **Spanish (`es`)**: Accents (`á`, `é`, `í`, `ó`, `ú`, `ñ`) and grammatical markers (`del`, `al`, `este`, `esta`).
4. **German (`de`)**: Umlauts (`ä`, `ö`, `ü`, `ß`) and structural articles (`der`, `die`, `das`, `nicht`).
5. **English (`en`)**: Default fallback.

The resulting language is injected directly into the header, schema values, and trailer of the prompt as an **absolute language lock**.

---

## 5. Detailed Breakdown of the 5 Cognitive Game Modes

```
                       ┌───────────────────────────────┐
                       │   STUDY GAMES (BRAIN GYM)     │
                       └───────────────┬───────────────┘
         ┌───────────────┬─────────────┼─────────────┬───────────────┐
         ▼               ▼             ▼             ▼               ▼
   [1] CURIOSITY   [2] 3D ACTIVE  [3] CRITICAL   [4] TRUTH       [5] NEURAL
       JOURNEY       FLASHCARDS       QUIZ        DETECTIVE       CONNECTOR
```

### Mode 1: Progressive Curiosity Journey (Flagship)
- **Pedagogical Concept**: Socratic inquiry and sequential mental modeling.
- **Components**:
  - **Roadmap Stepper Header (`#journeyStepperTrack`)**: Chronological sequence of milestones (`1` to `N`). Completed milestones earn a checkmark (`✓`); locked milestones remain disabled until preceding nodes are unlocked.
  - **Brain Scratcher / Dilemma**: A counter-intuitive paradox or dilemma extracted directly from the paragraph.
  - **4 Hypothesis Buttons**: 1 nuanced truth and 3 seductive cognitive traps.
  - **Epiphany Reveal**: Upon selecting the correct hypothesis, the card reveals the underlying mental model with an "Aha!" explanation.
  - **Source Passage Spotlight (`spotlightSnippetOnCanvas`)**: One-click button that scrolls to and highlights the exact sentence in the main reading canvas.
  - **Curiosity Bridge**: A narrative cliffhanger that primes the reader's attention for the next chronological milestone.

### Mode 2: 3D Active Recall Flashcards
- **Pedagogical Concept**: Spaced repetition, testing effect, and multi-perspective abstraction.
- **Components**:
  - **3D CSS Flip Card**: Uses CSS perspective (`transform: rotateY(180deg)`) triggered by clicking or pressing `<Space>`.
  - **Front Face**: Active recall prompt / fundamental question.
  - **Back Face**: Structured knowledge triad:
    1. *Core Mental Model* (High-level law/principle).
    2. *Causal Mechanism* (How and why it functions).
    3. *Real-World Analogy* (Concrete sensory anchor).
  - **Mastery Tracker**: "Need Review" vs. "✓ Mastered" rating buttons (+50 XP per card).

### Mode 3: Critical Thinking Quiz
- **Pedagogical Concept**: Decision-making under uncertainty, edge case analysis, and causal trade-offs.
- **Components**:
  - **Scenario Card**: Practical, applied dilemma rather than basic trivia.
  - **Options A, B, C, D**: Instant feedback highlighting (correct turns emerald `#10b981`, incorrect turns red `#ef4444`).
  - **Feedback Analysis**: Detailed explanation explaining why the trap options fail, concluding with a "Core Insight" takeaway.

### Mode 4: Truth Detective
- **Pedagogical Concept**: Epistemological vigilance, logical fallacy identification, and cognitive bias suppression.
- **Components**:
  - **Premise**: Contextual ground-truth based on the text.
  - **3 Detective Statements**: 2 valid, rigorously deduced statements, and 1 plausible logical fallacy / imposter.
  - **User Objective**: Identify and "catch" the trap statement.
  - **Resolution Card**: Categorizes the fallacy type (e.g., *False Equivalence*, *Causal Reversal*, *Hasty Generalization*) and provides the deductive rationale.

### Mode 5: Neural Connector (Concept Match)
- **Pedagogical Concept**: Relational cognitive mapping and associational fluency.
- **Components**:
  - **Active Shuffled Grid**: Randomized grid combining concept origins (causes, rules, inputs) with targets (effects, applications, manifestations).
  - **Interactive Pairing**: Click-to-select matching mechanism with dynamic state borders.
  - **Streak & Combo Multiplier**: Correct pairs chime and lock in place; incorrect matches trigger a momentary red highlight and reset.

---

## 6. Audio Ergonomics & Gamification Telemetry

- **Synthesized Audio Engine**:
  - `playChime()`: Web Audio API sine oscillators creating an ascending major triad for correct resolutions.
  - `playTapTone()`: Subtle tactile click on UI interactions.
  - `playTrapTone()`: Low-frequency descending buzz for incorrect attempts.
- **Dialect-Matched Text-to-Speech (TTS)**:
  - Users can click any dilemma, epiphany, or flashcard to trigger Web Speech API narration in native accents matching the detected language.
- **HUD Telemetry**:
  - **XP Counter**: Increments across all modes (+100 XP for Journey milestones and Quizzes, +50 XP for Flashcards, +150 XP for Detective rounds, +40 XP per matched pair).
  - **Streak Multiplier**: Tracks unbroken streaks (`1x`, `2x`, `3x`...). Resets to `1x` on failed attempts.
- **Keyboard Navigation Controls**:
  - `1` – Switch to Journey
  - `2` – Switch to Flashcards
  - `3` – Switch to Quiz
  - `4` – Switch to Truth Detective
  - `5` – Switch to Concept Match
  - `Space` – Action / Flip Card / Next Milestone
  - `Esc` – Close Study Games modal

---

## 7. Resilient Edge Pipeline & Truncation Recovery

### Multi-Model Fallback Chain
Calls are routed through Cloudflare Pages Edge Functions (`/api/gemini`) with failover across the following models:
1. `gemini-3.5-flash-lite`
2. `gemini-flash-lite-latest`
3. `gemini-3.7-flash`
4. `gemini-3.1-flash-lite`
5. `gemini-3.5-flash`
6. `gemini-3.8-flash`

Configured with `temperature: 0.2`, `maxOutputTokens: 65536`, and `responseMimeType: "application/json"`.

### Algorithmic JSON Repair Engine (`repairAndParseJson`)
If network instability or extreme text lengths cut off the output token stream:
1. **Direct Parse**: Cleans Markdown code blocks (````json ... ````).
2. **Trailing Comma Stripping**: Removes dangling commas before `}` and `]`.
3. **Stack-Based Truncation Recovery**: Scans open braces and quotes, closes unclosed strings, synthesizes matching closing brackets in reverse order, and recovers partial structured data without throwing parsing exceptions.

---

## 8. Summary Table: File Architecture

| File Path | Primary Responsibility |
| :--- | :--- |
| [`functions/api/gemini.js`](file:///c:/Users/amine/Desktop/tools/toolkerpro/functions/api/gemini.js) | Serverless Cloudflare Edge Function, model fallback pool, master prompt builder, JSON repair algorithm |
| [`public/reader/app.js`](file:///c:/Users/amine/Desktop/tools/toolkerpro/public/reader/app.js) | Client-side game engine, HUD state, DOM rendering for all 5 modes, audio synthesizers, cache invalidation |
| [`components/reader/focusFlowTemplate.ts`](file:///c:/Users/amine/Desktop/tools/toolkerpro/components/reader/focusFlowTemplate.ts) | Native DOM chassis template containing `#brainGymModal`, steppers, buttons, and responsive layout |
| [`components/reader/FocusReaderStudio.tsx`](file:///c:/Users/amine/Desktop/tools/toolkerpro/components/reader/FocusReaderStudio.tsx) | React wrapper bridging Toolker chassis navigation, room sync, and full-screen controls |
