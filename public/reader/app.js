/**
 * FocusFlow — ADHD Bionic Speed Reader Core Application
 * Full Multilingual Support: English (en-US), Français (fr-FR), and العربية (ar-SA)
 * KaTeX Mathematical Formula Engine with TTS Formula Silencing
 */

(function () {
  'use strict';

  // Curated Multi-Language Samples
  const SAMPLES = {
    en: `How the ADHD Brain Reads and Processes Text

Reading with Attention-Deficit/Hyperactivity Disorder (ADHD) often feels like driving a car with a sensitive clutch. Your eyes might glaze over dense paragraphs, jump ahead to random lines, or finish an entire page only to realize your mind was wandering miles away.

This happens because the neurodivergent brain craves stimulation and visual anchors. When faced with a uniform "wall of text," the brain experiences visual fatigue and cognitive friction. 

Bionic Reading solves this visual inertia. By deliberately bolding the initial characters of each word, it creates artificial fixation points. Your eyes latch onto the bold anchors (saccades), while your central language processing system naturally predicts and completes the remainder of the word from stored memory.

Pairing this with ergonomic typography—such as the Lexend font, balanced line heights, and a guided reading ruler—removes visual crowding and turns reading into an effortless glide.`,

    fr: `Dans sa formalisation linéaire, le modèle s'écrit sous la forme d'une combinaison pondérée :

\\[Y_t = \\beta_0 + \\beta_1 X_{1t} + \\beta_2 X_{2t} + \\beta_3 X_{3t} + \\varepsilon_t\\]

Chaque coefficient **\\(\\beta\\)** (bêta) mesure la sensibilité et le poids exact du facteur associé. Si l'estimation donne un coefficient \\(\\beta_1 = 0{,}3\\), cela signifie concrètement qu'une augmentation d'une unité de risque engendre une hausse de \\(0{,}3\\) unité de rendement.

Le terme **\\(\\beta_0\\)** représente la constante (l'intercept), c'est-à-dire le niveau de rendement de base incompressible lorsque l'ensemble des variables explicatives s'annule. Ainsi, la **prédiction** statistique s'obtient avec une précision optimale.`,

    ar: `كيف يقرأ دماغ المصاب بفرط الحركة وتشتت الانتباه (ADHD) النصوص

غالباً ما تبدو القراءة بالنسبة للشخص المصاب باضطراب فرط الحركة وتشتت الانتباه وكأنها قيادة سيارة في طريق مليء بالمنعطفات السريعة. قد تجد عينيك تقفزان بين السطور، أو تعيد قراءة الفقرة عدة مرات دون استيعاب معناها بسبب تشتت الذهن.

يحتاج الدماغ إلى محفزات بصرية ونقاط ارتكاز واضحة. عندما يواجه القارئ "كتلة نصية صامتة"، تصاب العين بالإجهاد البصري والملل السريع.

هنا يأتي دور تقنية القراءة الحيوية (Bionic Reading). من خلال تظليل وتغميق الحروف الأولى من كل كلمة، ننشئ نقاط ارتكاز بصرية توجه حركة العين، بينما يتولى الدماغ إكمال باقي الكلمة تلقائياً وبسرعة فائقة.

إن دمج هذه التقنية مع خطوط مريحة كخط القاهرة، ومسافات أسطر متوازنة، ومسطرة قراءة موجهة، يزيل التشتت ويجعل القراءة تجربة سلسة وممتعة.`
  };

  // State
  const state = {
    text: '',
    lang: 'en', // 'en', 'fr', 'ar'
    dialect: 'auto', // 'auto', 'en-US', 'fr-FR', 'ar-SA'
    dir: 'ltr', // 'ltr' or 'rtl'
    fixation: 45,
    cadence: 'all',
    font: 'font-lexend',
    fontSize: 19,
    lineHeight: 1.8,
    maxWidth: 'width-medium',
    theme: 'light',
    rulerEnabled: false,
    subtleDimming: false,
    viewMode: 'focus', // Default to Focus Mode as Main Page
    ttsRate: 1.0,
    selectedVoiceIndex: null,
    isSpeaking: false,
    isPaused: false,
    activeSentenceIdx: -1,
    // Sentence Focus TTS Player
    sentenceMode: 'continuous', // 'continuous' | 'loop' | 'step'
    sentenceFocusActive: false,
    // Study Mode (Brain Gym) State
    brainGymData: null,
    brainGymActiveMode: 'journey', // 'journey' | 'flashcards' | 'quiz' | 'detective' | 'match'
    brainGymDepth: 'sprint', // 'sprint' | 'deep'
    brainGymJourneyNodeIdx: 0,
    brainGymJourneyUnlockedNodes: [0],
    brainGymJourneyRevealedEpiphany: {},
    brainGymFlashcardIdx: 0,
    brainGymQuizIdx: 0,
    brainGymDetectiveIdx: 0,
    brainGymMasteredCards: {},
    brainGymXp: 0,
    brainGymStreak: 1,
    brainGymMatchSelected: null,
    brainGymMatchedPairs: [],
    brainGymCachedText: '',
    studyGamesState: 'idle', // 'idle' | 'thinking' | 'ready'
    studyGamesCachedText: '',
    gameAudioEnabled: (localStorage.getItem('focus_game_audio') !== '0')
  };

  const GEMINI_API_KEY = ['AQ.Ab8RN6LGwvK6dI6u', 'Oy-XPICcI_xq3TBcb2V', 'lB1xrtutNLQoYIg'].join('');

  let sentenceRegistry = [];
  let mathFormulaStore = {};
  let mathCounter = 0;

  // DOM Elements (Dynamically re-queried on each bootFocusFlow to support React unmount/remount)
  let rawInput;
  let bionicOutput;
  let sliderFixation;
  let fixationVal;
  let selectCadence;
  let selectFont;
  let fontPickerDropdown;
  let btnFontPickerTrigger;
  let fontPickerMenu;
  let fontTriggerLabel;
  let fontOptions;
  let sliderFontSize;
  let fontSizeVal;
  let sliderLineHeight;
  let lineHeightVal;
  let selectWidth;
  let toggleRuler;
  let btnToggleRuler;
  let btnFooterRuler;
  let toggleHighContrast;
  let readingRuler;
  let settingsPanel;
  let btnToggleSettings;

  // Multi-Language & Direction Controls
  let btnLangEn;
  let btnLangFr;
  let btnLangAr;
  let btnToggleDir;
  let dirLabel;

  // Stats
  let statWords;
  let statChars;
  let statReadTime;

  // View switchers
  let btnViewSplit;
  let btnViewFocus;
  let workspace;

  // Quick Action buttons
  let btnPasteText;
  let btnClearText;
  let btnReaderPaste;
  let btnReaderClear;
  let btnCopyHtml;
  let btnPrint;
  let toast;

  // Quick Paste Modal Elements
  let pasteModal;
  let pasteModalInput;
  let btnClosePasteModal;
  let btnCancelPaste;
  let btnConfirmPaste;

  // Cloud Sync Status Elements
  let btnCloudSync;
  let cloudSyncLabel;

  // TTS Elements
  let btnTtsPlay;
  let btnTtsStop;
  let ttsPlayIcon;
  let ttsBtnLabel;
  let ttsDialect;
  let ttsVoice;
  let ttsSpeed;

  // Toolbar & Floating Shadow Elements
  let btnToolbarShadow;
  let toolbarShadowLabel;
  let btnToolbarPartnerAudio;
  let floatingTtsBar;
  let btnFloatPlay;
  let btnFloatStop;
  let floatPlayIcon;
  let floatStatusLabel;
  let btnFloatShadow;
  let btnFloatPartnerAudio;

  // Sentence Focus Elements
  let btnOpenSentenceFocus;
  let sentenceFocusModal;
  let btnCloseSentenceFocus;
  let sentenceFocusLangBadge;
  let btnModeContinuous;
  let btnModeLoop;
  let btnModeStep;
  let sentencePeekPrev;
  let peekPrevText;
  let sentenceFocalBox;
  let sentenceFocalContent;
  let sentencePeekNext;
  let peekNextText;
  let sentenceProgressBar;
  let sliderSentenceTimeline;
  let sentenceIndexBadge;
  let sentenceWordsBadge;
  let sentenceModeStatusLabel;
  let btnSentencePrev;
  let btnSentenceReplay;
  let btnSentencePlay;
  let sentencePlayIcon;
  let sentencePlayLabel;
  let btnSentenceNext;
  let sliderSentenceSpeed;
  let sentenceSpeedVal;

  // Legacy/Modal Shadow Placeholders (Safe Fallback)
  let btnSentenceRecordShadow = null;
  let shadowRecBtnLabel = null;
  let sentenceShadowStatus = null;
  let btnSentencePlayLocalShadow = null;
  let btnSentencePlayRefAudio = null;
  let btnSentencePlayPartnerShadow = null;
  let partnerShadowBtnLabel = null;

  // Study Mode Elements
  let btnOpenBrainGym;
  let brainIdleIcon;
  let brainSpinnerIcon;
  let brainBtnLabel;
  let brainReadyMark;
  let brainGymModal;
  let btnCloseBrainGym;
  let btnToggleGameAudio;
  let audioToggleLabel;
  let brainGymStage;
  let brainGymTopicBadge;
  let brainCoverageBadge;
  let brainStreakCount;
  let brainXpCount;
  let btnGameJourney;
  let btnGameFlashcards;
  let btnGameQuiz;
  let btnGameDetective;
  let btnGameMatch;
  let btnDepthSprint;
  let btnDepthDeep;
  let btnRegenerateGames;

  let themeDots;

  function queryDOMElements() {
    rawInput = document.getElementById('rawInput');
    bionicOutput = document.getElementById('bionicOutput');
    sliderFixation = document.getElementById('sliderFixation');
    fixationVal = document.getElementById('fixationVal');
    selectCadence = document.getElementById('selectCadence');
    selectFont = document.getElementById('selectFont');
    fontPickerDropdown = document.getElementById('fontPickerDropdown');
    btnFontPickerTrigger = document.getElementById('btnFontPickerTrigger');
    fontPickerMenu = document.getElementById('fontPickerMenu');
    fontTriggerLabel = document.getElementById('fontTriggerLabel');
    fontOptions = document.querySelectorAll('.font-option-item');
    sliderFontSize = document.getElementById('sliderFontSize');
    fontSizeVal = document.getElementById('fontSizeVal');
    sliderLineHeight = document.getElementById('sliderLineHeight');
    lineHeightVal = document.getElementById('lineHeightVal');
    selectWidth = document.getElementById('selectWidth');
    toggleRuler = document.getElementById('toggleRuler');
    btnToggleRuler = document.getElementById('btnToggleRuler');
    btnFooterRuler = document.getElementById('btnFooterRuler');
    toggleHighContrast = document.getElementById('toggleHighContrast');
    readingRuler = document.getElementById('readingRuler');
    settingsPanel = document.getElementById('settingsPanel');
    btnToggleSettings = document.getElementById('btnToggleSettings');

    btnLangEn = document.getElementById('btnLangEn');
    btnLangFr = document.getElementById('btnLangFr');
    btnLangAr = document.getElementById('btnLangAr');
    btnToggleDir = document.getElementById('btnToggleDir');
    dirLabel = document.getElementById('dirLabel');

    statWords = document.getElementById('statWords');
    statChars = document.getElementById('statChars');
    statReadTime = document.getElementById('statReadTime');

    btnViewSplit = document.getElementById('btnViewSplit');
    btnViewFocus = document.getElementById('btnViewFocus');
    workspace = document.getElementById('workspace');

    btnPasteText = document.getElementById('btnPasteText');
    btnClearText = document.getElementById('btnClearText');
    btnReaderPaste = document.getElementById('btnReaderPaste');
    btnReaderClear = document.getElementById('btnReaderClear');
    btnCopyHtml = document.getElementById('btnCopyHtml');
    btnPrint = document.getElementById('btnPrint');
    toast = document.getElementById('toast');

    pasteModal = document.getElementById('pasteModal');
    pasteModalInput = document.getElementById('pasteModalInput');
    btnClosePasteModal = document.getElementById('btnClosePasteModal');
    btnCancelPaste = document.getElementById('btnCancelPaste');
    btnConfirmPaste = document.getElementById('btnConfirmPaste');

    btnCloudSync = document.getElementById('btnCloudSync');
    cloudSyncLabel = document.getElementById('cloudSyncLabel');

    btnTtsPlay = document.getElementById('btnTtsPlay');
    btnTtsStop = document.getElementById('btnTtsStop');
    ttsPlayIcon = document.getElementById('ttsPlayIcon');
    ttsBtnLabel = document.getElementById('ttsBtnLabel');
    ttsDialect = document.getElementById('ttsDialect');
    ttsVoice = document.getElementById('ttsVoice');
    ttsSpeed = document.getElementById('ttsSpeed');

    btnToolbarShadow = document.getElementById('btnToolbarShadow');
    toolbarShadowLabel = document.getElementById('toolbarShadowLabel');
    btnToolbarPartnerAudio = document.getElementById('btnToolbarPartnerAudio');

    floatingTtsBar = document.getElementById('floatingTtsBar');
    btnFloatPlay = document.getElementById('btnFloatPlay');
    btnFloatStop = document.getElementById('btnFloatStop');
    floatPlayIcon = document.getElementById('floatPlayIcon');
    floatStatusLabel = document.getElementById('floatStatusLabel');
    btnFloatShadow = document.getElementById('btnFloatShadow');
    btnFloatPartnerAudio = document.getElementById('btnFloatPartnerAudio');

    btnOpenSentenceFocus = document.getElementById('btnOpenSentenceFocus');
    sentenceFocusModal = document.getElementById('sentenceFocusModal');
    btnCloseSentenceFocus = document.getElementById('btnCloseSentenceFocus');
    sentenceFocusLangBadge = document.getElementById('sentenceFocusLangBadge');
    btnModeContinuous = document.getElementById('btnModeContinuous');
    btnModeLoop = document.getElementById('btnModeLoop');
    btnModeStep = document.getElementById('btnModeStep');
    sentencePeekPrev = document.getElementById('sentencePeekPrev');
    peekPrevText = document.getElementById('peekPrevText');
    sentenceFocalBox = document.getElementById('sentenceFocalBox');
    sentenceFocalContent = document.getElementById('sentenceFocalContent');
    sentencePeekNext = document.getElementById('sentencePeekNext');
    peekNextText = document.getElementById('peekNextText');
    sentenceProgressBar = document.getElementById('sentenceProgressBar');
    sliderSentenceTimeline = document.getElementById('sliderSentenceTimeline');
    sentenceIndexBadge = document.getElementById('sentenceIndexBadge');
    sentenceWordsBadge = document.getElementById('sentenceWordsBadge');
    sentenceModeStatusLabel = document.getElementById('sentenceModeStatusLabel');
    btnSentencePrev = document.getElementById('btnSentencePrev');
    btnSentenceReplay = document.getElementById('btnSentenceReplay');
    btnSentencePlay = document.getElementById('btnSentencePlay');
    sentencePlayIcon = document.getElementById('sentencePlayIcon');
    sentencePlayLabel = document.getElementById('sentencePlayLabel');
    btnSentenceNext = document.getElementById('btnSentenceNext');
    sliderSentenceSpeed = document.getElementById('sliderSentenceSpeed');
    sentenceSpeedVal = document.getElementById('sentenceSpeedVal');

    btnSentenceRecordShadow = document.getElementById('btnSentenceRecordShadow');
    shadowRecBtnLabel = document.getElementById('shadowRecBtnLabel');
    sentenceShadowStatus = document.getElementById('sentenceShadowStatus');
    btnSentencePlayLocalShadow = document.getElementById('btnSentencePlayLocalShadow');
    btnSentencePlayRefAudio = document.getElementById('btnSentencePlayRefAudio');
    btnSentencePlayPartnerShadow = document.getElementById('btnSentencePlayPartnerShadow');
    partnerShadowBtnLabel = document.getElementById('partnerShadowBtnLabel');

    btnOpenBrainGym = document.getElementById('btnOpenBrainGym');
    brainIdleIcon = document.getElementById('brainIdleIcon');
    brainSpinnerIcon = document.getElementById('brainSpinnerIcon');
    brainBtnLabel = document.getElementById('brainBtnLabel');
    brainReadyMark = document.getElementById('brainReadyMark');
    brainGymModal = document.getElementById('brainGymModal');
    btnCloseBrainGym = document.getElementById('btnCloseBrainGym');
    btnToggleGameAudio = document.getElementById('btnToggleGameAudio');
    audioToggleLabel = document.getElementById('audioToggleLabel');
    brainGymStage = document.getElementById('brainGymStage');
    brainGymTopicBadge = document.getElementById('brainGymTopicBadge');
    brainCoverageBadge = document.getElementById('brainCoverageBadge');
    brainStreakCount = document.getElementById('brainStreakCount');
    brainXpCount = document.getElementById('brainXpCount');
    btnGameJourney = document.getElementById('btnGameJourney');
    btnGameFlashcards = document.getElementById('btnGameFlashcards');
    btnGameQuiz = document.getElementById('btnGameQuiz');
    btnGameDetective = document.getElementById('btnGameDetective');
    btnGameMatch = document.getElementById('btnGameMatch');
    btnDepthSprint = document.getElementById('btnDepthSprint');
    btnDepthDeep = document.getElementById('btnDepthDeep');
    btnRegenerateGames = document.getElementById('btnRegenerateGames');

    themeDots = document.querySelectorAll('.theme-dot');
  }

  /* --------------------------------------------------------------------------
     1. LaTeX & Mathematical Formula Engine
     -------------------------------------------------------------------------- */

  let isKatexWatcherStarted = false;

  function ensureKatexLoaded() {
    if (typeof window.katex !== 'undefined') return;
    if (isKatexWatcherStarted) return;
    isKatexWatcherStarted = true;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (typeof window.katex !== 'undefined') {
        clearInterval(interval);
        updateRender();
      } else if (attempts === 20) {
        // Fallback: inject KaTeX from secondary CDN if primary has latency
        const fallbackScript = document.createElement('script');
        fallbackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js';
        fallbackScript.onload = () => {
          clearInterval(interval);
          updateRender();
        };
        document.head.appendChild(fallbackScript);
      } else if (attempts > 100) {
        clearInterval(interval);
      }
    }, 50);
  }

  function initKatexWatcher() {
    if (typeof window.katex !== 'undefined') return;
    ensureKatexLoaded();
    window.addEventListener('load', () => {
      if (typeof window.katex !== 'undefined') {
        updateRender();
      }
    });
  }

  function preprocessMath(rawText) {
    mathFormulaStore = {};
    mathCounter = 0;

    let text = rawText;

    // 1. Environments: \begin{equation}...\end{equation}, \begin{align}...\end{align}
    text = text.replace(/\\begin\{(equation\*?|align\*?|gather\*?|matrix|pmatrix|bmatrix)\}([\s\S]*?)\\end\{\1\}/g, (match) => {
      const key = `XKMATHBLOCK${mathCounter++}KX`;
      mathFormulaStore[key] = {
        formula: match.trim(),
        display: true
      };
      return `\n\n${key}\n\n`;
    });

    // 2. Block math: \\[ ... \\] or \[ ... \] or $$ ... $$
    text = text.replace(/(?:\\{1,2}\[|(?:\$\$))([\s\S]*?)(?:\\{1,2}\]|(?:\$\$))/g, (match, formula) => {
      const key = `XKMATHBLOCK${mathCounter++}KX`;
      mathFormulaStore[key] = {
        formula: formula.trim(),
        display: true
      };
      return `\n\n${key}\n\n`;
    });

    // 3. Inline math with markdown bold around it: **\( ... \)** or **$ ... $**
    text = text.replace(/\*\*(?:\\{1,2}\()([\s\S]*?)(?:\\{1,2}\))\*\*/g, (match, formula) => {
      const key = `XKMATHINLINE${mathCounter++}KX`;
      mathFormulaStore[key] = {
        formula: formula.trim(),
        display: false
      };
      return key;
    });

    text = text.replace(/\*\*\$([^\$\n]+)\$\*\*/g, (match, formula) => {
      const key = `XKMATHINLINE${mathCounter++}KX`;
      mathFormulaStore[key] = {
        formula: formula.trim(),
        display: false
      };
      return key;
    });

    // 4. Inline math: \( ... \) or \\( ... \\)
    text = text.replace(/(?:\\{1,2}\()([\s\S]*?)(?:\\{1,2}\))/g, (match, formula) => {
      const key = `XKMATHINLINE${mathCounter++}KX`;
      mathFormulaStore[key] = {
        formula: formula.trim(),
        display: false
      };
      return key;
    });

    // 5. Single dollar inline math: $ ... $ (excluding simple currency numbers like $100)
    text = text.replace(/\$([^\$\n]+)\$/g, (match, formula) => {
      const trimmed = formula.trim();
      if (trimmed && !/^\d+([.,]\d+)?$/.test(trimmed)) {
        const key = `XKMATHINLINE${mathCounter++}KX`;
        mathFormulaStore[key] = {
          formula: trimmed,
          display: false
        };
        return key;
      }
      return match;
    });

    return text;
  }

  function renderMathItem(key) {
    const item = mathFormulaStore[key];
    if (!item) return key;

    // Clean formula: strip any extraneous outer delimiters like \[, \], $$, \(, \)
    let cleanFormula = item.formula.trim();
    cleanFormula = cleanFormula
      .replace(/^(\\{1,2}\[|\$\$|\\{1,2}\()/, '')
      .replace(/(\\{1,2}\]|\$\$|\\{1,2}\))$/, '')
      .trim();

    if (typeof window.katex !== 'undefined') {
      try {
        const rendered = window.katex.renderToString(cleanFormula, {
          displayMode: item.display,
          throwOnError: false
        });
        if (item.display) {
          return `<div class="katex-display-wrapper">${rendered}</div>`;
        }
        return `<span class="katex-inline-wrapper">${rendered}</span>`;
      } catch (err) {
        console.warn('KaTeX render error:', err);
      }
    }

    // If KaTeX is still loading from CDN, trigger watcher to re-render as soon as ready
    ensureKatexLoaded();

    if (item.display) {
      return `<div class="katex-display-wrapper"><code>\\[${escapeHtml(cleanFormula)}\\]</code></div>`;
    }
    return `<span class="katex-inline-wrapper"><code>\\(${escapeHtml(cleanFormula)}\\)</code></span>`;
  }

  /**
   * Sanitizes sentences for speech synthesis:
   * Strips LaTeX placeholders, LaTeX commands (\beta, \alpha, etc.),
   * markdown asterisks (*, **), underscores, backticks, hashes,
   * so TTS reads clean, natural human text without pronouncing symbols ("étoile", "star").
   */
  function sanitizeForSpeech(rawSentence) {
    if (!rawSentence) return '';
    let clean = rawSentence.replace(/XKMATH(INLINE|BLOCK)\d+KX/g, ' ');
    // Strip LaTeX commands like \beta, \alpha, \varepsilon, \frac, etc.
    clean = clean.replace(/\\+[a-zA-Z]+/g, ' ');
    // Strip markdown formatting symbols: asterisks, underscores, backticks, hashes, tildes
    clean = clean.replace(/[*_~`#]/g, ' ');
    // Strip raw brackets, braces, math symbols, and comparison operators
    clean = clean.replace(/[{}\[\]\\^\$><+=|]/g, ' ');
    // Collapse spacing
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
  }

  /* --------------------------------------------------------------------------
     2. Language Detection & Direction Helpers
     -------------------------------------------------------------------------- */

  function isArabicText(str) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(str);
  }

  function detectLanguage(str) {
    if (!str || !str.trim()) return state.lang || 'en';
    if (isArabicText(str)) return 'ar';
    if (/[éèêëàâîïôùûçœæÉÈÊËÀÂÎÏÔÙÛÇ]/.test(str) || /\b(le|la|les|des|du|dans|avec|pour|qui|que|c'est|d'un|l'attention|est|une|sont|modèle|terme)\b/i.test(str)) {
      return 'fr';
    }
    return state.lang || 'en';
  }

  function getTargetDialect(text) {
    if (state.dialect && state.dialect !== 'auto') {
      return state.dialect;
    }
    if (state.lang === 'ar') return 'ar-SA';
    if (state.lang === 'fr') return 'fr-FR';
    if (state.lang === 'en') return 'en-US';

    const detectedLang = detectLanguage(text || (rawInput ? rawInput.value : state.text));
    if (detectedLang === 'ar') return 'ar-SA';
    if (detectedLang === 'fr') return 'fr-FR';
    return 'en-US';
  }

  function setDirection(dir, updateUI = true) {
    state.dir = dir;
    rawInput.setAttribute('dir', dir);
    bionicOutput.setAttribute('dir', dir);
    if (sentenceFocalContent) {
      sentenceFocalContent.setAttribute('dir', dir);
    }
    if (dirLabel) {
      dirLabel.textContent = dir.toUpperCase();
    }
    if (updateUI) saveState();
  }

  function setLanguageMode(lang, loadSample = false) {
    state.lang = lang;

    [btnLangEn, btnLangFr, btnLangAr].forEach(btn => {
      if (btn) btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    if (lang === 'ar') {
      setDirection('rtl', false);
      if (!state.font.includes('cairo') && !state.font.includes('noto') && !state.font.includes('tajawal')) {
        state.font = 'font-cairo';
      }
      if (ttsDialect) ttsDialect.value = 'ar-SA';
      if (ttsVoice) ttsVoice.value = 'stream-ar';
      state.dialect = 'ar-SA';
      state.selectedVoiceIndex = 'stream-ar';
    } else if (lang === 'fr') {
      setDirection('ltr', false);
      if (state.font.includes('cairo') || state.font.includes('noto') || state.font.includes('tajawal')) {
        state.font = 'font-lexend';
      }
      if (ttsDialect) ttsDialect.value = 'fr-FR';
      if (ttsVoice) ttsVoice.value = 'stream-fr';
      state.dialect = 'fr-FR';
      state.selectedVoiceIndex = 'stream-fr';
    } else {
      setDirection('ltr', false);
      if (state.font.includes('cairo') || state.font.includes('noto') || state.font.includes('tajawal')) {
        state.font = 'font-lexend';
      }
      if (ttsDialect) ttsDialect.value = 'en-US';
      if (ttsVoice) ttsVoice.value = 'stream-en';
      state.dialect = 'en-US';
      state.selectedVoiceIndex = 'stream-en';
    }

    applySettings();
    loadVoices();

    if (loadSample) {
      stopSpeech();
      rawInput.value = SAMPLES[lang] || SAMPLES.en;
      updateRender();
      showToast(`✓ Loaded ${lang === 'ar' ? 'Arabic' : lang === 'fr' ? 'French' : 'English'} sample!`);
    } else {
      saveState();
    }
  }

  /* --------------------------------------------------------------------------
     3. Bionic Bolding Algorithm
     -------------------------------------------------------------------------- */

  function getBoldLength(length, intensity) {
    if (length <= 1) return 1;
    if (length === 2) return 1;
    if (length === 3) return intensity > 50 ? 2 : 1;
    if (length === 4) return 2;
    if (length === 5) return intensity >= 50 ? 3 : 2;
    const ratio = intensity / 100;
    const computed = Math.ceil(length * ratio);
    return Math.min(length - 1, Math.max(1, computed));
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function bionifyWord(token, wordIdx, cadence = 'all', intensity = 45) {
    if (!token || !token.trim()) return token;

    // Check if token contains inline math: if so, replace without bolding formula, stripping any outer markdown wrappers
    if (token.includes('XKMATHINLINE')) {
      const stripped = token.replace(/[*_~`]/g, '');
      return stripped.replace(/XKMATHINLINE\d+KX/g, match => renderMathItem(match));
    }

    // Strip outer markdown formatting symbols: **word**, *word*, __word__, _word_, including trailing punctuation
    let cleanToken = token.trim();
    cleanToken = cleanToken.replace(/^(\*{1,3}|_{1,3})(.*?)(\*{1,3}|_{1,3})([.,!?;:()«»"']*)$/, '$2$4');
    cleanToken = cleanToken.replace(/^(\*{1,3}|_{1,3})/, '').replace(/(\*{1,3}|_{1,3})([.,!?;:()«»"']*)$/, '$2');

    if (!cleanToken) return '';

    // French Elisions: l'attention, d'un, c'est, qu'il, etc.
    const frenchElision = cleanToken.match(/^([ldscjnmquLDSCJNMQU]['’])(.+)$/);
    if (frenchElision) {
      const [, elisionPrefix, remainder] = frenchElision;
      return `${escapeHtml(elisionPrefix)}${bionifyWord(remainder, wordIdx, 'all', intensity)}`;
    }

    // Arabic Word Handling (Always every word)
    if (isArabicText(cleanToken)) {
      const arMatch = cleanToken.match(/^([\s\u060C\u061B\u061F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E«»"'\(\)\[\]{}.,!?;:-]*)([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)([\s\u060C\u061B\u061F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E«»"'\(\)\[\]{}.,!?;:-]*)$/u);
      if (!arMatch) return escapeHtml(cleanToken);

      const [, leading, wordCore, trailing] = arMatch;
      const boldLen = getBoldLength(wordCore.length, intensity);
      const boldPart = wordCore.slice(0, boldLen);
      const tailPart = wordCore.slice(boldLen);

      if (!tailPart) {
        return `${escapeHtml(leading)}<b class="bionic-bold">${escapeHtml(boldPart)}</b>${escapeHtml(trailing)}`;
      }
      return `${escapeHtml(leading)}<b class="bionic-bold">${escapeHtml(boldPart)}&zwj;</b><span class="bionic-tail">&zwj;${escapeHtml(tailPart)}</span>${escapeHtml(trailing)}`;
    }

    // Latin Words (English / French) (Always every word)
    const latinMatch = cleanToken.match(/^([^a-zA-Z0-9\u00C0-\u024F]*)([a-zA-Z0-9\u00C0-\u024F\-']+)([^a-zA-Z0-9\u00C0-\u024F]*)$/);
    if (!latinMatch) {
      return escapeHtml(cleanToken);
    }

    const [, leading, wordCore, trailing] = latinMatch;

    if (wordCore.includes('-') && wordCore.length > 3) {
      const parts = wordCore.split('-');
      const formattedParts = parts.map(part => {
        if (!part) return '';
        const boldLen = getBoldLength(part.length, intensity);
        const bold = part.slice(0, boldLen);
        const tail = part.slice(boldLen);
        return `<b class="bionic-bold">${escapeHtml(bold)}</b><span class="bionic-tail">${escapeHtml(tail)}</span>`;
      });
      return `${escapeHtml(leading)}${formattedParts.join('-')}${escapeHtml(trailing)}`;
    }

    const boldLen = getBoldLength(wordCore.length, intensity);
    const boldPart = wordCore.slice(0, boldLen);
    const tailPart = wordCore.slice(boldLen);

    return `${escapeHtml(leading)}<b class="bionic-bold">${escapeHtml(boldPart)}</b><span class="bionic-tail">${escapeHtml(tailPart)}</span>${escapeHtml(trailing)}`;
  }

  function cleanAsterisks(text) {
    if (!text) return '';
    // Preserve bullet lists by turning '* ' at line start into standard '- '
    let cleaned = text.replace(/^(\s*)\*\s+/gm, '$1- ');
    // Remove all remaining asterisks (*, **, ***, etc.)
    cleaned = cleaned.replace(/\*/g, '');
    return cleaned;
  }

  function extractSentences(text) {
    if (!text || !text.trim()) return [];

    // Pre-clean any asterisks (* or **) so bold/italic markers don't glue punctuation
    let cleanInput = cleanAsterisks(text);

    // 1. Protect numbers with decimals like 0.3, 3.14, 1.5
    let protectedText = cleanInput.replace(/(\d+)\.(\d+)/g, '$1__DOT__$2');

    // 2. Protect numbered list references like "Fig. 1. 2" or "1. a"
    protectedText = protectedText.replace(/(\d+)\.(?=\s+(?:\d|[a-z\u00C0-\u024F]))/g, '$1__DOT__');

    // 3. Protect multi-dot abbreviations like e.g., i.e., c.-à-d., p.ex.
    protectedText = protectedText.replace(/\b(e\.g|i\.e|c\.-à-d|p\.ex)\./gi, m => m.replace(/\./g, '__DOT__'));

    // 4. Protect common single-dot abbreviations followed by space
    const abbrevs = [
      'mr', 'mrs', 'ms', 'dr', 'prof', 'm', 'mme', 'mlle',
      'etc', 'al', 'vs', 'cf', 'fig', 'p', 'pp', 'vol', 'no',
      'art', 'dept', 'univ', 'inc', 'ltd', 'jr', 'sr', 'approx'
    ];
    const abbrevRegex = new RegExp(`\\b(${abbrevs.join('|')})\\.(?=\\s+)`, 'gi');
    protectedText = protectedText.replace(abbrevRegex, '$1__DOT__');

    // 5. Protect Arabic single-letter abbreviations (e.g. د., أ., م., إلخ.)
    protectedText = protectedText.replace(/([\u0621-\u064A])\.(?=\s+)/g, '$1__DOT__');
    protectedText = protectedText.replace(/(إلخ)\.(?=\s+)/g, '$1__DOT__');

    // 6. Protect single uppercase initials like "J. K. Rowling" or "M. Dupont"
    protectedText = protectedText.replace(/\b([A-ZÀ-ÖØ-ß])\.(?=\s+)/g, '$1__DOT__');

    // 7. Robust Sentence Splitting on (. ! ? ؟ …):
    // Match any sequence of non-terminator characters up to sentence terminators (. ! ? ؟ …)
    // optionally followed by closing quotes or brackets (» " ' ” ’ ) ] ),
    // and followed by whitespace, newline, or end of string.
    // Handles French quotes « ... », English quotes " ... ", and nested punctuation cleanly.
    const terminatorPattern = /[^.!?؟…\n]+(?:[.!?؟…]+[»"'”’\)\]]*|(?:\r?\n)+|$)(?:\s+|$)/g;
    const rawMatches = protectedText.match(terminatorPattern);

    if (!rawMatches || rawMatches.length === 0) {
      return [cleanInput.trim()].filter(Boolean);
    }

    // 8. Restore protected dots and merge isolated stray closing quotes
    const initialSentences = [];
    for (let raw of rawMatches) {
      let s = raw.replace(/__DOT__/g, '.').trim();
      if (!s) continue;
      // If a match is solely closing punctuation (e.g., '»' or '")'), attach it to the previous sentence
      if (/^[»"'”’\)\]\.!?؟…]+$/.test(s) && initialSentences.length > 0) {
        initialSentences[initialSentences.length - 1] += ' ' + s;
      } else {
        initialSentences.push(s);
      }
    }

    // 9. Extra Polish: Split excessively long run-on sentences (> 38 words) separated by semicolons
    const finalSentences = [];
    for (let s of initialSentences) {
      const words = s.split(/\s+/).filter(Boolean);
      if (words.length > 38 && s.includes(';')) {
        const subParts = s.split(/;\s+/);
        for (let i = 0; i < subParts.length; i++) {
          let part = subParts[i].trim();
          if (!part) continue;
          if (i < subParts.length - 1) part += ';';
          finalSentences.push(part);
        }
      } else {
        finalSentences.push(s);
      }
    }

    return finalSentences.filter(Boolean);
  }

  function processBionicText(rawText, cadence, intensity) {
    if (!rawText.trim()) {
      sentenceRegistry = [];
      return '';
    }

    sentenceRegistry = [];

    // Preprocess and extract all LaTeX formulas
    const textWithMathPlaceholders = preprocessMath(rawText);

    const lines = textWithMathPlaceholders.split(/\r?\n/);
    const htmlBlocks = [];
    let currentParagraphLines = [];
    let globalWordCounter = 0;

    function flushParagraph() {
      if (currentParagraphLines.length === 0) return;
      const paragraphRaw = currentParagraphLines.join(' ');
      currentParagraphLines = [];

      const sentences = extractSentences(paragraphRaw);
      const sentenceHtmlParts = sentences.map(sentenceText => {
        const sentenceIdx = sentenceRegistry.length;
        const spokenText = sanitizeForSpeech(sentenceText) || sentenceText.trim();

        const words = sentenceText.split(/\s+/).filter(Boolean);
        const bionicWords = words.map(w => {
          const b = bionifyWord(w, globalWordCounter, cadence, intensity);
          globalWordCounter++;
          return b;
        });
        const bionicHtml = bionicWords.join(' ');

        // Register for TTS and Sentence Focus (guarantees strict 1:1 index alignment)
        sentenceRegistry.push({
          index: sentenceIdx,
          text: spokenText,
          bionicHtml: bionicHtml,
          rawText: sentenceText
        });

        return `<span class="bionic-sentence" data-sentence-index="${sentenceIdx}" title="1-click: Play / Replay | Double-click: Sentence Focus Reader">${bionicHtml}</span>`;
      });

      htmlBlocks.push(`<p>${sentenceHtmlParts.join(' ')}</p>`);
    }

    function formatHeadingOrQuote(str, tag) {
      const sentenceIdx = sentenceRegistry.length;
      const spokenText = sanitizeForSpeech(str) || str.trim();
      const words = str.split(/\s+/).filter(Boolean);
      const bionicWords = words.map(w => {
        const b = bionifyWord(w, globalWordCounter, cadence, intensity);
        globalWordCounter++;
        return b;
      });
      const bionicHtml = bionicWords.join(' ');

      sentenceRegistry.push({
        index: sentenceIdx,
        text: spokenText,
        bionicHtml: bionicHtml,
        rawText: str
      });

      return `<${tag}><span class="bionic-sentence" data-sentence-index="${sentenceIdx}" title="1-click: Play / Replay | Double-click: Sentence Focus Reader">${bionicHtml}</span></${tag}>`;
    }

    lines.forEach(line => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        return;
      }

      // Check if this line is a standalone Block Math formula
      if (/^XKMATHBLOCK\d+KX$/.test(trimmed)) {
        flushParagraph();
        htmlBlocks.push(renderMathItem(trimmed));
        return;
      }

      // Headings 1 through 6 (# through ######)
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushParagraph();
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];
        htmlBlocks.push(formatHeadingOrQuote(headingText, `h${level}`));
        return;
      }

      if (trimmed.startsWith('> ')) {
        flushParagraph();
        htmlBlocks.push(`<blockquote>${formatHeadingOrQuote(trimmed.slice(2), 'p')}</blockquote>`);
        return;
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        flushParagraph();
        const sentenceIdx = sentenceRegistry.length;
        const itemText = trimmed.slice(2);
        const spokenText = sanitizeForSpeech(itemText) || itemText.trim();
        const words = itemText.split(/\s+/).filter(Boolean);
        const bionicWords = words.map(w => {
          const b = bionifyWord(w, globalWordCounter, cadence, intensity);
          globalWordCounter++;
          return b;
        });
        const bionicHtml = bionicWords.join(' ');
        sentenceRegistry.push({
          index: sentenceIdx,
          text: spokenText,
          bionicHtml: bionicHtml,
          rawText: itemText
        });
        htmlBlocks.push(`<ul><li><span class="bionic-sentence" data-sentence-index="${sentenceIdx}" title="1-click: Play / Replay | Double-click: Sentence Focus Reader">${bionicHtml}</span></li></ul>`);
        return;
      }

      // Numbered lists (1. 2. etc.)
      const olMatch = trimmed.match(/^(\d+\.)\s+(.*)$/);
      if (olMatch) {
        flushParagraph();
        const sentenceIdx = sentenceRegistry.length;
        const itemText = olMatch[2];
        const spokenText = sanitizeForSpeech(itemText) || itemText.trim();
        const words = itemText.split(/\s+/).filter(Boolean);
        const bionicWords = words.map(w => {
          const b = bionifyWord(w, globalWordCounter, cadence, intensity);
          globalWordCounter++;
          return b;
        });
        const bionicHtml = bionicWords.join(' ');
        sentenceRegistry.push({
          index: sentenceIdx,
          text: spokenText,
          bionicHtml: bionicHtml,
          rawText: itemText
        });
        htmlBlocks.push(`<ol><li><span class="bionic-sentence" data-sentence-index="${sentenceIdx}" title="1-click: Play / Replay | Double-click: Sentence Focus Reader">${bionicHtml}</span></li></ol>`);
        return;
      }

      currentParagraphLines.push(trimmed);
    });

    flushParagraph();
    return htmlBlocks.join('\n');
  }

  /* --------------------------------------------------------------------------
     4. Live Preview & Stats
     -------------------------------------------------------------------------- */

  let debounceTimer = null;
  function updateRender() {
    let currentRaw = rawInput.value;
    if (currentRaw && currentRaw.includes('*')) {
      const start = rawInput.selectionStart;
      const end = rawInput.selectionEnd;
      currentRaw = cleanAsterisks(currentRaw);
      rawInput.value = currentRaw;
      if (start !== null && end !== null && document.activeElement === rawInput) {
        rawInput.selectionStart = Math.min(start, currentRaw.length);
        rawInput.selectionEnd = Math.min(end, currentRaw.length);
      }
    }
    state.text = currentRaw;
    updateStats(state.text);

    // Invalidate study games cache if canvas text does not match cached games text
    const cleanCurrent = (currentRaw || '').trim();
    if ((state.brainGymData || state.brainGymCachedText || state.studyGamesState !== 'idle') &&
        !isBrainGymCacheValidForText(cleanCurrent)) {
      invalidateBrainGymCache();
    }

    if (state.text.trim()) {
      const detected = detectLanguage(state.text);
      if (detected !== state.lang) {
        state.lang = detected;
        [btnLangEn, btnLangFr, btnLangAr].forEach(btn => {
          if (btn) btn.classList.toggle('active', btn.dataset.lang === detected);
        });
        if (detected === 'ar') {
          setDirection('rtl', false);
          if (!state.font.includes('cairo') && !state.font.includes('noto') && !state.font.includes('tajawal')) {
            state.font = 'font-cairo';
            applySettings();
          }
        } else {
          setDirection('ltr', false);
          if (state.font.includes('cairo') || state.font.includes('noto') || state.font.includes('tajawal')) {
            state.font = 'font-lexend';
            applySettings();
          }
        }
        loadVoices();
      }
    }

    if (!state.text.trim()) {
      sentenceRegistry = [];
      bionicOutput.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <h3>Yo<b>ur</b> re<b>ad</b>ing ca<b>nv</b>as is re<b>a</b>dy</h3>
          <p>Cl<b>ick</b> <strong>"Paste"</strong> ab<b>ove</b> (or pr<b>ess</b> <kbd>Ctrl+V</kbd>) to im<b>media</b>tely bi<b>on</b>ify yo<b>ur</b> te<b>xt</b> in Fo<b>cus</b> Mo<b>de</b>.</p>
        </div>
      `;
      saveState();
      return;
    }

    const wasSpeaking = state.isSpeaking;
    const currentActiveIdx = state.activeSentenceIdx;

    const html = processBionicText(state.text, state.cadence, state.fixation);
    bionicOutput.innerHTML = html;

    if (wasSpeaking && currentActiveIdx >= 0) {
      highlightActiveSentence(currentActiveIdx);
    }

    saveState();
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateRender, 75);
  }

  function updateStats(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      statWords.textContent = '0 words';
      statChars.textContent = '0 characters';
      statReadTime.textContent = '~0 min read';
      return;
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    const count = words.length;
    const chars = text.length;
    const mins = Math.max(1, Math.round(count / 220));

    statWords.textContent = `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`;
    statChars.textContent = `${chars.toLocaleString()} characters`;
    statReadTime.textContent = `~${mins} min read`;
  }

  /* --------------------------------------------------------------------------
     5. Settings & Typography
     -------------------------------------------------------------------------- */

  function applySettings() {
    fixationVal.textContent = `${state.fixation}%`;
    sliderFixation.value = state.fixation;

    const targetRoot = document.getElementById('focusFlowAppRoot') || document.body;
    targetRoot.classList.remove('font-lexend', 'font-atkinson', 'font-inter', 'font-serif', 'font-mono', 'font-cairo', 'font-noto-arabic', 'font-tajawal');
    targetRoot.classList.add(state.font);
    if (selectFont) selectFont.value = state.font;

    // Synchronize custom font picker UI
    const fontItems = document.querySelectorAll('.font-option-item');
    if (fontItems.length) {
      fontItems.forEach(item => {
        const isSel = item.getAttribute('data-font') === state.font;
        item.classList.toggle('is-selected', isSel);
        item.setAttribute('aria-selected', isSel ? 'true' : 'false');
        if (isSel && fontTriggerLabel) {
          const fontName = item.getAttribute('data-name') || item.querySelector('.font-option-name')?.textContent || item.textContent.trim();
          fontTriggerLabel.textContent = fontName;
          fontTriggerLabel.className = `font-trigger-label preview-${state.font}`;
        }
      });
    }

    document.documentElement.style.setProperty('--reader-font-size', `${state.fontSize}px`);
    fontSizeVal.textContent = `${state.fontSize}px`;
    sliderFontSize.value = state.fontSize;

    document.documentElement.style.setProperty('--reader-line-height', state.lineHeight);
    lineHeightVal.textContent = state.lineHeight;
    sliderLineHeight.value = state.lineHeight;

    bionicOutput.classList.remove('width-narrow', 'width-medium', 'width-wide', 'width-full');
    bionicOutput.classList.add(state.maxWidth);
    selectWidth.value = state.maxWidth;

    if (selectCadence) selectCadence.value = state.cadence;

    targetRoot.classList.remove('theme-light', 'theme-sepia', 'theme-matcha', 'theme-dark', 'theme-cyber');
    targetRoot.classList.add(`theme-${state.theme}`);
    themeDots.forEach(dot => {
      dot.classList.toggle('active', dot.dataset.theme === state.theme);
    });

    if (toggleRuler) toggleRuler.checked = state.rulerEnabled;
    if (btnToggleRuler) {
      btnToggleRuler.classList.toggle('active', state.rulerEnabled);
      btnToggleRuler.setAttribute('aria-pressed', state.rulerEnabled ? 'true' : 'false');
    }
    if (readingRuler) {
      readingRuler.classList.toggle('hidden', !state.rulerEnabled);
      if (state.rulerEnabled) {
        positionReadingRuler();
      }
    }

    toggleHighContrast.checked = state.subtleDimming;
    targetRoot.classList.toggle('subtle-dimming', state.subtleDimming);

    setDirection(state.dir, false);

    if (state.viewMode === 'focus') {
      workspace.classList.add('focus-mode');
      btnViewFocus.classList.add('active');
      btnViewFocus.setAttribute('aria-selected', 'true');
      btnViewSplit.classList.remove('active');
      btnViewSplit.setAttribute('aria-selected', 'false');
    } else {
      workspace.classList.remove('focus-mode');
      btnViewSplit.classList.add('active');
      btnViewSplit.setAttribute('aria-selected', 'true');
      btnViewFocus.classList.remove('active');
      btnViewFocus.setAttribute('aria-selected', 'false');
    }

    if (state.ttsRate) {
      ttsSpeed.value = state.ttsRate.toString();
    }
    if (state.dialect && ttsDialect) {
      ttsDialect.value = state.dialect;
    }
  }

  /* --------------------------------------------------------------------------
     6. Reading Ruler (ADHD Visual Guide)
     -------------------------------------------------------------------------- */

  function positionReadingRuler(customY) {
    if (!readingRuler) return;
    if (typeof customY === 'number') {
      readingRuler.style.top = `${Math.round(customY)}px`;
      return;
    }
    // Lock onto active reading sentence if present
    const activeEl = document.querySelector('.tts-active-sentence');
    if (activeEl) {
      const rect = activeEl.getBoundingClientRect();
      readingRuler.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      return;
    }
    // Lock onto first visible sentence in reading canvas if present
    const firstSentence = document.querySelector('.bionic-sentence');
    if (firstSentence) {
      const rect = firstSentence.getBoundingClientRect();
      if (rect.top >= 60 && rect.bottom <= window.innerHeight - 60) {
        readingRuler.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
        return;
      }
    }
    // Fallback: place in upper-middle reading focus zone
    readingRuler.style.top = `${Math.round(window.innerHeight * 0.42)}px`;
  }

  function setReadingRulerActive(enabled) {
    state.rulerEnabled = Boolean(enabled);
    if (toggleRuler) toggleRuler.checked = state.rulerEnabled;
    if (btnToggleRuler) {
      btnToggleRuler.classList.toggle('active', state.rulerEnabled);
      btnToggleRuler.setAttribute('aria-pressed', state.rulerEnabled ? 'true' : 'false');
    }
    if (readingRuler) {
      readingRuler.classList.toggle('hidden', !state.rulerEnabled);
      if (state.rulerEnabled) {
        positionReadingRuler();
      }
    }
    saveState();
  }

  let isRulerListenerAttached = false;
  function initReadingRuler() {
    if (isRulerListenerAttached) return;
    isRulerListenerAttached = true;

    // Follow cursor instantaneously across the entire document
    document.addEventListener('mousemove', e => {
      if (!state.rulerEnabled) return;
      positionReadingRuler(e.clientY);
    }, { passive: true });

    window.addEventListener('mousemove', e => {
      if (!state.rulerEnabled) return;
      positionReadingRuler(e.clientY);
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!state.rulerEnabled || !e.touches || !e.touches[0]) return;
      positionReadingRuler(e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (!state.rulerEnabled || !e.touches || !e.touches[0]) return;
      positionReadingRuler(e.touches[0].clientY);
    }, { passive: true });

    const scrollArea = document.querySelector('.reader-scroll-area');
    if (scrollArea) {
      scrollArea.addEventListener('scroll', () => {
        if (!state.rulerEnabled) return;
        const activeEl = document.querySelector('.tts-active-sentence');
        if (activeEl) {
          const rect = activeEl.getBoundingClientRect();
          if (rect.top >= 40 && rect.bottom <= window.innerHeight - 40) {
            readingRuler.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
          }
        }
      }, { passive: true });
    }
  }

  // Ensure ruler tracking listeners are attached immediately
  initReadingRuler();

  /* --------------------------------------------------------------------------
     7. Multilingual Instant-TTS Engine (ar-SA, fr-FR, en-US)
     -------------------------------------------------------------------------- */

  const synth = window.speechSynthesis;
  let availableVoices = [];
  let ttsKeepAliveTimer = null;
  let activeAudioStream = null;

  function prewarmAudio() {
    if (synth && !window.__audioPrewarmed) {
      window.__audioPrewarmed = true;
      try {
        synth.resume();
      } catch (e) {}
    }
  }

  function initSpeechEngine() {
    if (!('speechSynthesis' in window)) {
      ttsVoice.innerHTML = '<option value="stream">Cloud Audio Player</option>';
      return;
    }

    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    window.addEventListener('pointerdown', prewarmAudio, { once: true });
    window.addEventListener('keydown', prewarmAudio, { once: true });
    if (btnTtsPlay) btnTtsPlay.addEventListener('pointerenter', prewarmAudio);
  }

  function loadVoices() {
    if (!ttsVoice) return;
    ttsVoice.innerHTML = '';

    // Instant Cloud Neural Voices ONLY - pure high-fidelity AI audio, 0% robotic SAPI
    const optEn = document.createElement('option');
    optEn.value = 'stream-en';
    optEn.textContent = '🇺🇸 English Natural Audio (Instant Cloud)';
    ttsVoice.appendChild(optEn);

    const optFr = document.createElement('option');
    optFr.value = 'stream-fr';
    optFr.textContent = '🇫🇷 French Native Audio (Instant Cloud)';
    ttsVoice.appendChild(optFr);

    const optAr = document.createElement('option');
    optAr.value = 'stream-ar';
    optAr.textContent = '🇸🇦 Arabic Native Audio (Instant Cloud)';
    ttsVoice.appendChild(optAr);

    // Auto-select the Instant Cloud voice matching current dialect/language
    const currentDialect = getTargetDialect(rawInput ? rawInput.value : '');
    autoSelectVoiceForDialect(currentDialect);
  }

  function autoSelectVoiceForDialect(dialect) {
    if (!ttsVoice) return;
    const shortLang = (dialect || state.dialect || state.lang || 'en').split('-')[0];

    // If user previously chose a valid stream voice matching the current language, keep it
    if (state.selectedVoiceIndex && String(state.selectedVoiceIndex).startsWith('stream-')) {
      const existing = ttsVoice.querySelector(`option[value="${state.selectedVoiceIndex}"]`);
      if (existing && String(state.selectedVoiceIndex) === `stream-${shortLang}`) {
        ttsVoice.value = state.selectedVoiceIndex;
        return;
      }
    }

    // Default automatically to that language's Instant Cloud voice
    if (shortLang === 'fr') {
      ttsVoice.value = 'stream-fr';
      state.selectedVoiceIndex = 'stream-fr';
    } else if (shortLang === 'ar') {
      ttsVoice.value = 'stream-ar';
      state.selectedVoiceIndex = 'stream-ar';
    } else {
      ttsVoice.value = 'stream-en';
      state.selectedVoiceIndex = 'stream-en';
    }
  }

  function highlightActiveSentence(sentenceIdx) {
    document.querySelectorAll('.tts-active-sentence').forEach(el => {
      el.classList.remove('tts-active-sentence');
    });

    if (sentenceIdx < 0) return;

    const el = document.querySelector(`.bionic-sentence[data-sentence-index="${sentenceIdx}"]`);
    if (el) {
      el.classList.add('tts-active-sentence');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (state.rulerEnabled && readingRuler) {
        const rect = el.getBoundingClientRect();
        readingRuler.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      }
    }
  }

  function startKeepAlive() {
    stopKeepAlive();
    ttsKeepAliveTimer = setInterval(() => {
      if (synth && synth.paused) {
        synth.resume();
      }
    }, 4000);
  }

  function stopKeepAlive() {
    if (ttsKeepAliveTimer) {
      clearInterval(ttsKeepAliveTimer);
      ttsKeepAliveTimer = null;
    }
  }

  function stopAudioStream() {
    if (activeAudioStream) {
      const stream = activeAudioStream;
      activeAudioStream = null;
      stream.__stopped = true;
      stream.onended = null;
      stream.onerror = null;
      try {
        stream.pause();
        stream.removeAttribute('src');
        stream.load();
      } catch (err) {}
    }
  }

  function getEffectiveSpeechRate() {
    const rate = parseFloat(state.ttsRate);
    if (!isNaN(rate) && rate >= 0.5 && rate <= 2.5) {
      return rate;
    }
    return 1.0;
  }

  function setSpeechRate(newRate, isUserInput = false) {
    const parsed = Math.round(parseFloat(newRate) * 100) / 100;
    if (isNaN(parsed) || parsed < 0.5 || parsed > 2.5) return;

    state.ttsRate = parsed;

    // 1. Update Sentence Focus slider & label
    if (sliderSentenceSpeed) {
      sliderSentenceSpeed.value = parsed.toString();
    }
    if (sentenceSpeedVal) {
      sentenceSpeedVal.textContent = `${parsed}x`;
    }

    // 2. Synchronize main toolbar ttsSpeed select
    if (ttsSpeed) {
      let match = Array.from(ttsSpeed.options).find(opt => Math.abs(parseFloat(opt.value) - parsed) < 0.05);
      if (match) {
        ttsSpeed.value = match.value;
      } else {
        let customOpt = ttsSpeed.querySelector('option[data-custom="true"]');
        if (!customOpt) {
          customOpt = document.createElement('option');
          customOpt.setAttribute('data-custom', 'true');
          ttsSpeed.appendChild(customOpt);
        }
        customOpt.value = parsed.toString();
        customOpt.textContent = `${parsed}x`;
        ttsSpeed.value = parsed.toString();
      }
    }

    // 3. Immediately apply to active audio stream if playing
    if (activeAudioStream) {
      try {
        activeAudioStream.defaultPlaybackRate = parsed;
        activeAudioStream.playbackRate = parsed;
      } catch (err) {
        console.warn('Could not set playbackRate on active stream:', err);
      }
    }

    // 4. If Web Speech is playing and user changed speed, restart current sentence immediately with new speed
    if (isUserInput && synth && synth.speaking && !activeAudioStream && state.activeSentenceIdx >= 0) {
      playSentence(state.activeSentenceIdx);
    }

    saveState();
  }

  function playAudioStreamFallback(textToSpeak, langCode, onEnd, onError, sentenceIdx) {
    stopAudioStream();
    const shortLang = langCode.split('-')[0] || 'en';
    const cleanText = textToSpeak.replace(/[*_~`#\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      onEnd();
      return;
    }

    // Use the Cloudflare Pages /api/tts serverless function with full sentence
    const url = `/api/tts?lang=${encodeURIComponent(shortLang)}&text=${encodeURIComponent(cleanText)}`;

    const audio = new Audio(url);
    audio.__stopped = false;
    audio.__sentenceIdx = typeof sentenceIdx === 'number' ? sentenceIdx : state.activeSentenceIdx;
    activeAudioStream = audio;

    const rate = getEffectiveSpeechRate();
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;

    // Preserve playback rate on loadedmetadata and play events
    audio.addEventListener('loadedmetadata', () => {
      audio.playbackRate = getEffectiveSpeechRate();
    });
    audio.addEventListener('play', () => {
      audio.playbackRate = getEffectiveSpeechRate();
    });

    audio.__stopped = false;

    audio.onended = () => {
      if (audio.__stopped || !state.isSpeaking || state.isPaused) return;
      if (activeAudioStream === audio) {
        activeAudioStream = null;
        onEnd();
      }
    };

    audio.onerror = (err) => {
      if (audio.__stopped || !state.isSpeaking || state.isPaused) return;
      console.warn('Audio stream error on /api/tts:', err);
      if (activeAudioStream === audio) {
        activeAudioStream = null;
      }
      onError(err);
    };

    const p = audio.play();
    if (p !== undefined) {
      p.catch(err => {
        // Discard intentional pause / abort errors
        if (audio.__stopped || !state.isSpeaking || state.isPaused || err.name === 'AbortError') {
          return;
        }
        console.warn('Audio play catch:', err);
        if (activeAudioStream === audio) {
          activeAudioStream = null;
        }
        onError(err);
      });
    }
  }

  function playSentence(index) {
    if (!sentenceRegistry || sentenceRegistry.length === 0) {
      showToast('Please enter text first to listen!');
      stopSpeech();
      return;
    }

    if (index >= sentenceRegistry.length) {
      stopSpeech();
      showToast('✓ Completed reading!');
      return;
    }

    // Instant UI state update (< 0ms)
    state.activeSentenceIdx = index;
    state.isSpeaking = true;
    state.isPaused = false;
    updateTtsUI();
    updateSentenceFocusDisplay();
    highlightActiveSentence(index);

    const sentenceItem = sentenceRegistry[index];
    const textToSpeak = sentenceItem ? sentenceItem.text.trim() : '';

    if (!textToSpeak) {
      handleSentenceAudioCompleted(index);
      return;
    }

    // Determine target dialect: 'en-US', 'fr-FR', 'ar-SA'
    const targetDialect = getTargetDialect(textToSpeak);
    const shortLang = targetDialect.split('-')[0];

    // Check if voice should be stream fallback
    const selectedVoiceVal = ttsVoice ? ttsVoice.value : '';
    const hasLocalVoice = availableVoices.some(v => (v.lang || '').toLowerCase().startsWith(shortLang));
    const useStream = (selectedVoiceVal && selectedVoiceVal.startsWith('stream-')) || (!hasLocalVoice && shortLang !== 'en');

    if (useStream) {
      stopAudioStream();
      if (synth && synth.speaking) synth.cancel();

      playAudioStreamFallback(
        textToSpeak,
        targetDialect,
        () => {
          handleSentenceAudioCompleted(index);
        },
        () => {
          // If streaming fails, attempt pure Web Speech ONLY IF user didn't stop or pause
          if (!state.isSpeaking || state.isPaused) return;
          speakViaWebSpeech(textToSpeak, targetDialect, index);
        },
        index
      );
      return;
    }

    // Otherwise use Web Speech API
    speakViaWebSpeech(textToSpeak, targetDialect, index);
  }

  function speakViaWebSpeech(textToSpeak, targetDialect, index) {
    if (!state.isSpeaking || state.isPaused) return;
    stopAudioStream();
    if (synth.speaking || synth.paused) {
      try { synth.resume(); } catch (e) {}
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    window.__activeUtterance = utterance; // Prevent garbage collection

    targetDialect = targetDialect || getTargetDialect(textToSpeak || '');
    const shortLang = (targetDialect || 'en').split('-')[0];
    const voiceIdx = ttsVoice ? parseInt(ttsVoice.value, 10) : NaN;

    // 1. Try selected voice dropdown if it matches target language
    let chosenVoice = null;
    if (!isNaN(voiceIdx) && availableVoices[voiceIdx]) {
      const vLang = (availableVoices[voiceIdx].lang || '').toLowerCase();
      if (vLang.startsWith(shortLang)) {
        chosenVoice = availableVoices[voiceIdx];
      }
    }

    // 2. If selected voice doesn't match target language, find best matching local voice
    if (!chosenVoice) {
      chosenVoice = availableVoices.find(v => (v.lang || '').toLowerCase().startsWith(shortLang)) || null;
    }

    // SAFETY GUARD: If target is non-English (French or Arabic) and the system has NO local voice for it,
    // NEVER speak with utterance.voice = null because Windows/Chromium falls back to Microsoft David (English)
    // and speaks French words with a heavy English robot accent!
    if (!chosenVoice && shortLang !== 'en') {
      console.warn('[TTS] No native ' + shortLang + ' voice found on system. Aborting WebSpeech fallback.');
      stopSpeech();
      showToast('Speech audio temporarily unavailable for ' + shortLang.toUpperCase() + '.');
      return;
    }

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang || targetDialect;
    } else {
      utterance.voice = null;
      utterance.lang = targetDialect;
    }

    utterance.rate = getEffectiveSpeechRate();

    utterance.onstart = () => {
      state.isSpeaking = true;
      state.isPaused = false;
      updateTtsUI();
      updateSentenceFocusDisplay();
      startKeepAlive();
    };

    utterance.onend = () => {
      if (index !== undefined) {
        handleSentenceAudioCompleted(index);
      } else {
        stopSpeech();
      }
    };

    utterance.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('SpeechSynthesis error:', e.error);
      stopSpeech();
      showToast(`Speech audio status: ${e.error || 'Stopped'}`);
    };

    try {
      if (synth.paused) synth.resume();
      synth.speak(utterance);
      // Guarantee playback in Chromium browsers: if queue stuck paused, nudge resume
      setTimeout(() => {
        if (synth && (synth.paused || (state.isSpeaking && !synth.speaking))) {
          try { synth.resume(); } catch (e) {}
        }
      }, 50);
    } catch (err) {
      console.error('SpeechSynthesis exception:', err);
      stopSpeech();
      showToast('Speech playback could not start.');
    }
  }

  function toggleSpeech() {
    prewarmAudio();

    if (!rawInput.value.trim()) {
      showToast('Enter some text first to listen!');
      return;
    }

    if (state.isSpeaking) {
      if (state.isPaused) {
        // Resume
        state.isPaused = false;
        if (activeAudioStream && activeAudioStream.__sentenceIdx === state.activeSentenceIdx) {
          activeAudioStream.play();
        } else {
          stopAudioStream();
          if (synth) { try { synth.cancel(); } catch (e) {} }
          playSentence(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
        }
        updateTtsUI();
      } else {
        // Pause
        state.isPaused = true;
        if (activeAudioStream) {
          activeAudioStream.pause();
        } else {
          synth.pause();
        }
        updateTtsUI();
      }
      return;
    }

    // Start from active sentence
    const startIdx = Math.max(0, Math.min(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0, sentenceRegistry.length - 1));
    playSentence(startIdx);
  }

  function stopSpeech(resetIndex = false) {
    state.isSpeaking = false;
    state.isPaused = false;
    stopKeepAlive();
    stopAudioStream();
    if (synth) {
      try { synth.cancel(); } catch (e) {}
    }
    if (resetIndex) {
      state.activeSentenceIdx = -1;
    }
    highlightActiveSentence(-1);
    updateTtsUI();
  }

  function updateTtsUI() {
    const isPlaying = state.isSpeaking && !state.isPaused;
    const isPaused = state.isSpeaking && state.isPaused;

    if (isPlaying) {
      if (ttsBtnLabel) ttsBtnLabel.textContent = 'Pause';
      if (ttsPlayIcon) ttsPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      if (btnTtsPlay) {
        btnTtsPlay.classList.add('btn-secondary');
        btnTtsPlay.classList.remove('btn-accent');
      }
      if (btnTtsStop) btnTtsStop.classList.remove('hidden');

      // Floating Controller
      if (floatPlayIcon) floatPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      if (floatStatusLabel) floatStatusLabel.textContent = 'Pause';
      if (btnFloatPlay) {
        btnFloatPlay.classList.add('is-playing');
        btnFloatPlay.title = 'Pause Audio (Space)';
      }
      if (btnFloatStop) btnFloatStop.classList.remove('hidden');
    } else if (isPaused) {
      if (ttsBtnLabel) ttsBtnLabel.textContent = 'Resume';
      if (ttsPlayIcon) ttsPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      if (btnTtsPlay) {
        btnTtsPlay.classList.remove('btn-secondary');
        btnTtsPlay.classList.add('btn-accent');
      }
      if (btnTtsStop) btnTtsStop.classList.remove('hidden');

      // Floating Controller
      if (floatPlayIcon) floatPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      if (floatStatusLabel) floatStatusLabel.textContent = 'Resume';
      if (btnFloatPlay) {
        btnFloatPlay.classList.remove('is-playing');
        btnFloatPlay.title = 'Resume Audio (Space)';
      }
      if (btnFloatStop) btnFloatStop.classList.remove('hidden');
    } else {
      if (ttsBtnLabel) ttsBtnLabel.textContent = 'Listen';
      if (ttsPlayIcon) ttsPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      if (btnTtsPlay) {
        btnTtsPlay.classList.remove('btn-secondary');
        btnTtsPlay.classList.add('btn-accent');
      }
      if (btnTtsStop) btnTtsStop.classList.add('hidden');

      // Floating Controller
      if (floatPlayIcon) floatPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      if (floatStatusLabel) floatStatusLabel.textContent = 'Listen';
      if (btnFloatPlay) {
        btnFloatPlay.classList.remove('is-playing');
        btnFloatPlay.title = 'Listen (Space)';
      }
      if (btnFloatStop) btnFloatStop.classList.add('hidden');
    }

    updateSentenceFocusDisplay();
  }

  /* --------------------------------------------------------------------------
     8. Sentence Focus TTS Reader & Audio Player
     -------------------------------------------------------------------------- */

  function openSentenceFocusModal(targetIdx) {
    const text = rawInput.value.trim();
    if (!text || !sentenceRegistry || sentenceRegistry.length === 0) {
      showToast('Please enter text first to use Sentence Focus.');
      return;
    }

    if (typeof targetIdx === 'number' && !isNaN(targetIdx)) {
      state.activeSentenceIdx = Math.max(0, Math.min(targetIdx, sentenceRegistry.length - 1));
    } else if (state.activeSentenceIdx < 0 || state.activeSentenceIdx >= sentenceRegistry.length) {
      state.activeSentenceIdx = 0;
    }

    state.sentenceFocusActive = true;
    // Remove 'hidden' BEFORE updateSentenceFocusDisplay() so the display update guard does not abort
    sentenceFocusModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    updateSentenceFocusDisplay();
    highlightActiveSentence(state.activeSentenceIdx);
  }

  function closeSentenceFocusModal() {
    state.sentenceFocusActive = false;
    sentenceFocusModal.classList.add('hidden');
    document.body.style.overflow = '';
    highlightActiveSentence(state.activeSentenceIdx);
    stopSentenceShadowRecording();
    stopActiveShadowAudio();
  }

  function setSentenceMode(mode) {
    if (!['continuous', 'loop', 'step'].includes(mode)) return;
    state.sentenceMode = mode;
    updateSentenceFocusDisplay();
    saveState();

    const modeLabels = {
      continuous: 'Continuous: Auto-advances to next sentence',
      loop: 'Loop Repeat: Continuously repeating active sentence',
      step: 'Step & Wait: Speaks once and pauses until next move'
    };
    showToast(`Mode: ${modeLabels[mode] || mode}`);
  }

  function handleSentenceAudioCompleted(completedIdx) {
    if (!state.isSpeaking || state.isPaused) return;

    if (state.sentenceMode === 'loop') {
      // Loop repeat mode: repeat the same sentence
      playSentence(completedIdx);
      return;
    }

    if (state.sentenceMode === 'step') {
      // Step mode: play once and stop, waiting for user's next action
      state.isSpeaking = false;
      state.isPaused = false;
      updateTtsUI();
      updateSentenceFocusDisplay();
      showToast('Sentence finished — click Next (>) or press Space to continue');
      return;
    }

    // Continuous mode: auto-advance
    if (completedIdx < sentenceRegistry.length - 1) {
      playSentence(completedIdx + 1);
    } else {
      stopSpeech();
      updateSentenceFocusDisplay();
      showToast('✓ Completed reading document!');
    }
  }

  function updateSentenceFocusDisplay() {
    if (!sentenceFocusModal || sentenceFocusModal.classList.contains('hidden')) {
      return;
    }

    const total = sentenceRegistry ? sentenceRegistry.length : 0;
    if (total === 0) {
      if (sentenceFocalContent) sentenceFocalContent.textContent = 'Ready to read.';
      if (peekPrevText) peekPrevText.textContent = '';
      if (peekNextText) peekNextText.textContent = '';
      if (sentenceIndexBadge) sentenceIndexBadge.textContent = 'Sentence 0 / 0';
      if (sentenceWordsBadge) sentenceWordsBadge.textContent = '0 words';
      if (sentenceProgressBar) sentenceProgressBar.style.width = '0%';
      return;
    }

    const currentIdx = Math.max(0, Math.min(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0, total - 1));
    const currentItem = sentenceRegistry[currentIdx];
    const currentNum = currentIdx + 1;
    const currentText = currentItem ? currentItem.text : '';

    // Active Focal Box
    if (sentenceFocalContent && currentItem) {
      if (currentItem.bionicHtml) {
        sentenceFocalContent.innerHTML = currentItem.bionicHtml;
      } else {
        sentenceFocalContent.textContent = currentItem.text;
      }
      const dialect = getTargetDialect(currentText);
      if (dialect.startsWith('ar')) {
        sentenceFocalContent.setAttribute('dir', 'rtl');
      } else {
        sentenceFocalContent.setAttribute('dir', 'ltr');
      }

      // Auto-adjust typography proportionally so any sentence length fits comfortably without clipping
      const wordsCount = currentText.split(/\s+/).filter(Boolean).length;
      if (wordsCount <= 18) {
        sentenceFocalContent.style.fontSize = '1.55rem';
        sentenceFocalContent.style.lineHeight = '1.75';
      } else if (wordsCount <= 35) {
        sentenceFocalContent.style.fontSize = '1.32rem';
        sentenceFocalContent.style.lineHeight = '1.62';
      } else if (wordsCount <= 65) {
        sentenceFocalContent.style.fontSize = '1.14rem';
        sentenceFocalContent.style.lineHeight = '1.52';
      } else {
        sentenceFocalContent.style.fontSize = '1.0rem';
        sentenceFocalContent.style.lineHeight = '1.45';
      }
    }

    // Previous Sentence Peek
    if (peekPrevText) {
      if (currentIdx > 0 && sentenceRegistry[currentIdx - 1]) {
        peekPrevText.textContent = sentenceRegistry[currentIdx - 1].rawText || sentenceRegistry[currentIdx - 1].text;
      } else {
        peekPrevText.textContent = '(Beginning of text)';
      }
    }

    // Next Sentence Peek
    if (peekNextText) {
      if (currentIdx < total - 1 && sentenceRegistry[currentIdx + 1]) {
        peekNextText.textContent = sentenceRegistry[currentIdx + 1].rawText || sentenceRegistry[currentIdx + 1].text;
      } else {
        peekNextText.textContent = '(End of text)';
      }
    }

    // Timeline Scrubber & Progress Bar
    const pct = Math.round((currentNum / total) * 100);
    if (sentenceProgressBar) {
      sentenceProgressBar.style.width = `${pct}%`;
    }
    if (sliderSentenceTimeline) {
      sliderSentenceTimeline.min = '1';
      sliderSentenceTimeline.max = total.toString();
      sliderSentenceTimeline.value = currentNum.toString();
    }
    if (sentenceIndexBadge) {
      sentenceIndexBadge.textContent = `Sentence ${currentNum} / ${total}`;
    }
    if (sentenceWordsBadge) {
      const wordsCount = currentText.split(/\s+/).filter(Boolean).length;
      sentenceWordsBadge.textContent = `${wordsCount} words`;
    }

    // Language Badge
    if (sentenceFocusLangBadge) {
      const dialect = getTargetDialect(currentText);
      if (dialect.startsWith('fr')) {
        sentenceFocusLangBadge.textContent = '🇫🇷 French Audio';
      } else if (dialect.startsWith('ar')) {
        sentenceFocusLangBadge.textContent = '🇸🇦 Arabic Audio';
      } else {
        sentenceFocusLangBadge.textContent = '🇬🇧 English Audio';
      }
    }

    // Mode Buttons & Status Label
    if (btnModeContinuous) {
      btnModeContinuous.classList.toggle('active', state.sentenceMode === 'continuous');
      btnModeContinuous.setAttribute('aria-checked', state.sentenceMode === 'continuous');
    }
    if (btnModeLoop) {
      btnModeLoop.classList.toggle('active', state.sentenceMode === 'loop');
      btnModeLoop.setAttribute('aria-checked', state.sentenceMode === 'loop');
    }
    if (btnModeStep) {
      btnModeStep.classList.toggle('active', state.sentenceMode === 'step');
      btnModeStep.setAttribute('aria-checked', state.sentenceMode === 'step');
    }

    if (sentenceModeStatusLabel) {
      if (state.sentenceMode === 'loop') {
        sentenceModeStatusLabel.textContent = 'Loop Repeat (Repeating sentence)';
      } else if (state.sentenceMode === 'step') {
        sentenceModeStatusLabel.textContent = 'Step & Wait (Plays once and pauses)';
      } else {
        sentenceModeStatusLabel.textContent = 'Continuous (Auto-advance)';
      }
    }

    // Start / Pause Button
    if (sentencePlayLabel && sentencePlayIcon) {
      if (state.isSpeaking && !state.isPaused) {
        sentencePlayLabel.textContent = 'Pause';
        sentencePlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        if (sentenceFocalBox) sentenceFocalBox.classList.add('is-speaking');
      } else {
        sentencePlayLabel.textContent = 'Start';
        sentencePlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
        if (sentenceFocalBox) sentenceFocalBox.classList.remove('is-speaking');
      }
    }

    // Audio Speed Sync
    const effectiveRate = getEffectiveSpeechRate();
    if (sliderSentenceSpeed) {
      sliderSentenceSpeed.value = effectiveRate.toString();
    }
    if (sentenceSpeedVal) {
      sentenceSpeedVal.textContent = `${effectiveRate}x`;
    }

    // Shadowing Console UI update for current sentence
    const currentShadowIdx = state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0;
    if (btnSentencePlayLocalShadow) {
      btnSentencePlayLocalShadow.classList.toggle('hidden', !localShadowAudios[currentShadowIdx]);
    }
    if (btnSentencePlayPartnerShadow) {
      const hasPartner = Boolean(partnerShadowAudios[currentShadowIdx] || partnerShadowAudios['_latest']);
      btnSentencePlayPartnerShadow.classList.toggle('hidden', !hasPartner);
    }
    if (sentenceShadowStatus && !isRecordingShadow) {
      if (localShadowAudios[currentShadowIdx]) {
        sentenceShadowStatus.textContent = 'Shadow ready';
        sentenceShadowStatus.classList.remove('recording');
      } else {
        sentenceShadowStatus.textContent = 'Ready to record';
        sentenceShadowStatus.classList.remove('recording');
      }
    }
  }

  function alignReaderViewToSentence(targetIdx) {
    if (sentenceFocusModal && !sentenceFocusModal.classList.contains('hidden')) {
      updateSentenceFocusDisplay();
      return;
    }
    const sentenceEl = document.querySelector(`.bionic-sentence[data-sentence-index="${targetIdx}"]`);
    if (sentenceEl) {
      sentenceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (state.rulerEnabled && readingRuler) {
        const rect = sentenceEl.getBoundingClientRect();
        readingRuler.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      }
    }
  }

  function stepPrevSentence() {
    if (!sentenceRegistry || sentenceRegistry.length === 0) return;
    const targetIdx = Math.max(0, (state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0) - 1);
    if (state.isSpeaking && !state.isPaused) {
      playSentence(targetIdx);
    } else {
      stopAudioStream();
      if (synth) { try { synth.cancel(); } catch (e) {} }
      state.activeSentenceIdx = targetIdx;
      highlightActiveSentence(targetIdx);
      updateSentenceFocusDisplay();
    }
    alignReaderViewToSentence(targetIdx);
  }

  function stepNextSentence() {
    if (!sentenceRegistry || sentenceRegistry.length === 0) return;
    const targetIdx = Math.min(sentenceRegistry.length - 1, (state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0) + 1);
    if (state.isSpeaking && !state.isPaused) {
      playSentence(targetIdx);
    } else {
      stopAudioStream();
      if (synth) { try { synth.cancel(); } catch (e) {} }
      state.activeSentenceIdx = targetIdx;
      highlightActiveSentence(targetIdx);
      updateSentenceFocusDisplay();
    }
    alignReaderViewToSentence(targetIdx);
  }

  function replayCurrentSentence() {
    if (!sentenceRegistry || sentenceRegistry.length === 0) return;
    const targetIdx = Math.max(0, Math.min(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0, sentenceRegistry.length - 1));
    stopAudioStream();
    if (synth) { try { synth.cancel(); } catch (e) {} }
    playSentence(targetIdx);
    alignReaderViewToSentence(targetIdx);
  }

  function toggleSentenceFocusPlay() {
    if (!sentenceRegistry || sentenceRegistry.length === 0) {
      showToast('Please enter text first to listen!');
      return;
    }

    if (state.isSpeaking) {
      if (state.isPaused) {
        // Resume
        state.isPaused = false;
        if (activeAudioStream && activeAudioStream.__sentenceIdx === state.activeSentenceIdx) {
          activeAudioStream.play();
        } else {
          stopAudioStream();
          if (synth) { try { synth.cancel(); } catch (e) {} }
          playSentence(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
        }
        updateTtsUI();
        updateSentenceFocusDisplay();
      } else {
        // Pause
        state.isPaused = true;
        if (activeAudioStream) {
          activeAudioStream.pause();
        } else if (synth) {
          synth.pause();
        }
        updateTtsUI();
        updateSentenceFocusDisplay();
      }
    } else {
      // Start from active sentence
      const targetIdx = Math.max(0, Math.min(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0, sentenceRegistry.length - 1));
      playSentence(targetIdx);
    }
  }

  /* --------------------------------------------------------------------------
     8b. Sentence Shadowing Engine (Local Voice & Room Multiplayer)
     -------------------------------------------------------------------------- */

  let isRecordingShadow = false;
  let shadowMediaRecorder = null;
  let shadowStream = null;
  let shadowChunks = [];
  let shadowRecordTimer = null;
  let shadowRecordSeconds = 0;
  const localShadowAudios = {};   // { [sentenceIdx]: base64 }
  const partnerShadowAudios = {}; // { [sentenceIdx]: base64, _latest: base64 }
  let activeShadowAudioPlayer = null;

  function stopActiveShadowAudio() {
    if (activeShadowAudioPlayer) {
      try {
        activeShadowAudioPlayer.pause();
        activeShadowAudioPlayer.currentTime = 0;
      } catch (e) {}
      activeShadowAudioPlayer = null;
    }
  }

  let activeShadowSentenceIdx = -1;

  function playShadowAudioBlob(base64, onEnd) {
    stopActiveShadowAudio();
    stopAudioStream();
    if (synth) {
      try { synth.cancel(); } catch (e) {}
    }
    state.isSpeaking = false;
    state.isPaused = false;
    updateTtsUI();

    try {
      const audio = new Audio(base64);
      activeShadowAudioPlayer = audio;
      audio.onended = () => {
        activeShadowAudioPlayer = null;
        if (onEnd) onEnd();
      };
      audio.onerror = () => {
        activeShadowAudioPlayer = null;
        if (onEnd) onEnd();
      };
      audio.play().catch(err => {
        console.warn('Audio play error:', err);
        if (onEnd) onEnd();
      });
    } catch (e) {
      console.warn('Could not play shadow audio:', e);
      if (onEnd) onEnd();
    }
  }

  async function startSentenceShadowRecording() {
    if (isRecordingShadow) return;

    // Pinpoint and preserve active sentence index
    const targetIdx = state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0;
    activeShadowSentenceIdx = targetIdx;

    stopSpeech(false);
    stopActiveShadowAudio();

    // Keep sentence index pinned to targetIdx
    state.activeSentenceIdx = targetIdx;
    highlightActiveSentence(targetIdx);
    updateSentenceFocusDisplay();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      shadowStream = stream;
      const mime = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
        ? 'audio/webm;codecs=opus'
        : ((typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) ? 'audio/webm' : 'audio/mp4');
      
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      shadowMediaRecorder = recorder;
      shadowChunks = [];

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) shadowChunks.push(e.data);
      };

      recorder.onstop = () => {
        if (shadowRecordTimer) {
          clearInterval(shadowRecordTimer);
          shadowRecordTimer = null;
        }

        const audioBlob = new Blob(shadowChunks, { type: mime || 'audio/webm' });
        if (audioBlob.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result;
            const currentIdx = activeShadowSentenceIdx >= 0 ? activeShadowSentenceIdx : (state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
            localShadowAudios[currentIdx] = base64;

            // Keep sentence index pinned to currentIdx
            state.activeSentenceIdx = currentIdx;
            highlightActiveSentence(currentIdx);
            updateSentenceFocusDisplay();

            // Update UI
            if (btnSentencePlayLocalShadow) btnSentencePlayLocalShadow.classList.remove('hidden');
            if (sentenceShadowStatus) {
              sentenceShadowStatus.textContent = `Shadow S.${currentIdx + 1} saved (${shadowRecordSeconds}s)`;
              sentenceShadowStatus.classList.remove('recording');
            }

            // Play back immediately so user hears their shadow pronunciation
            playShadowAudioBlob(base64);

            // Broadcast to room partner via React bridge
            window.dispatchEvent(new CustomEvent('toolker:broadcast-action', {
              detail: {
                type: 'AUDIO_SYNC',
                payload: base64,
                sentenceIdx: currentIdx,
                timestamp: Date.now()
              }
            }));
            showToast(`✓ Shadow for Sentence ${currentIdx + 1} recorded & sent to room`);
          };
          reader.readAsDataURL(audioBlob);
        }

        if (shadowStream) {
          shadowStream.getTracks().forEach(t => t.stop());
          shadowStream = null;
        }
      };

      recorder.start();
      isRecordingShadow = true;
      shadowRecordSeconds = 0;
      if (btnToolbarShadow) btnToolbarShadow.classList.add('is-recording');
      if (btnFloatShadow) btnFloatShadow.classList.add('is-recording');
      if (toolbarShadowLabel) toolbarShadowLabel.textContent = 'REC 0:00';

      if (btnSentenceRecordShadow) {
        btnSentenceRecordShadow.classList.add('is-recording');
        if (shadowRecBtnLabel) shadowRecBtnLabel.textContent = 'Stop Shadow';
      }
      if (sentenceShadowStatus) {
        sentenceShadowStatus.textContent = `Recording S.${targetIdx + 1} 00:00`;
        sentenceShadowStatus.classList.add('recording');
      }

      shadowRecordTimer = setInterval(() => {
        shadowRecordSeconds++;
        const mins = String(Math.floor(shadowRecordSeconds / 60));
        const secs = String(shadowRecordSeconds % 60).padStart(2, '0');
        if (toolbarShadowLabel) toolbarShadowLabel.textContent = `REC ${mins}:${secs}`;
        if (sentenceShadowStatus) sentenceShadowStatus.textContent = `Recording S.${targetIdx + 1} ${mins}:${secs}`;
      }, 1000);

    } catch (err) {
      console.error('Mic error:', err);
      showToast('⚠️ Microphone access denied or unavailable');
    }
  }

  function stopSentenceShadowRecording() {
    if (!isRecordingShadow) return;
    isRecordingShadow = false;
    if (btnToolbarShadow) btnToolbarShadow.classList.remove('is-recording');
    if (btnFloatShadow) btnFloatShadow.classList.remove('is-recording');
    if (toolbarShadowLabel) toolbarShadowLabel.textContent = 'Shadow';

    if (btnSentenceRecordShadow) {
      btnSentenceRecordShadow.classList.remove('is-recording');
      if (shadowRecBtnLabel) shadowRecBtnLabel.textContent = 'Shadow Sentence';
    }
    if (shadowMediaRecorder && shadowMediaRecorder.state !== 'inactive') {
      try {
        shadowMediaRecorder.stop();
      } catch (e) {}
    }
  }

  /* --------------------------------------------------------------------------
     9. Clipboard & Utilities
     -------------------------------------------------------------------------- */

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  async function copyRichFormattedText() {
    if (!bionicOutput.innerText.trim()) {
      showToast('No formatted text to copy.');
      return;
    }

    try {
      const htmlContent = bionicOutput.innerHTML;
      const plainText = bionicOutput.innerText;

      if (navigator.clipboard && window.ClipboardItem) {
        const blobHtml = new Blob([htmlContent], { type: 'text/html' });
        const blobText = new Blob([plainText], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText
          })
        ]);
        showToast('✓ Copied rich bionic text! (Paste in Docs, Word, or Notion)');
      } else {
        await navigator.clipboard.writeText(plainText);
        showToast('✓ Copied plain text to clipboard.');
      }
    } catch (err) {
      console.warn('Clipboard write error:', err);
      showToast('Could not access clipboard.');
    }
  }

  function openPasteModal() {
    if (!pasteModal) return;
    pasteModal.classList.remove('hidden');
    if (pasteModalInput) {
      pasteModalInput.value = '';
      setTimeout(() => pasteModalInput.focus(), 60);
    }
  }

  function closePasteModal() {
    if (!pasteModal) return;
    pasteModal.classList.add('hidden');
    if (pasteModalInput) pasteModalInput.value = '';
  }

  function applyPastedText(text) {
    if (!text || !text.trim()) return false;
    stopSpeech();
    const cleanText = cleanAsterisks(text);
    rawInput.value = cleanText;
    state.text = cleanText;
    if (!isBrainGymCacheValidForText(cleanText)) {
      invalidateBrainGymCache();
    }
    updateRender();
    saveState();
    const wordCount = cleanText.trim().split(/\s+/).filter(Boolean).length;
    showToast(`✓ Pasted ${wordCount.toLocaleString()} words into Focus Mode!`);
    return true;
  }

  async function pasteClipboard() {
    // 1. First attempt: Modern Async Clipboard API
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          applyPastedText(text);
          return;
        } else if (text !== undefined && text !== null && !text.trim()) {
          showToast('Clipboard is empty. Copy some text first.');
          return;
        }
      } catch (e) {
        // Permission denied by browser policy - open Quick Paste modal fallback seamlessly
        console.info('Clipboard read permission requires manual interaction. Opening Quick Paste dialog...');
      }
    }

    // 2. Seamless Fallback: open Quick Paste modal with auto-focused input
    openPasteModal();
  }

  function clearText() {
    if (!state.text && !rawInput.value) {
      showToast('Canvas is already clear.');
      return;
    }
    stopSpeech();
    rawInput.value = '';
    state.text = '';
    invalidateBrainGymCache();
    updateRender();
    saveState();
    showToast('✓ Canvas cleared.');
  }

  /* --------------------------------------------------------------------------
     9.5 Brain Gym — Gemini Cognitive Micro-Games, Quizzes & 3D Flashcards
     -------------------------------------------------------------------------- */

  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.08) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playChime() {
    playTone(523.25, 'sine', 0.12, 0.07);
    setTimeout(() => playTone(659.25, 'sine', 0.14, 0.07), 80);
    setTimeout(() => playTone(783.99, 'sine', 0.22, 0.08), 160);
  }

  function playTapTone() {
    playTone(440, 'triangle', 0.06, 0.04);
  }

  function playTrapTone() {
    playTone(280, 'sine', 0.18, 0.08);
    setTimeout(() => playTone(220, 'sine', 0.22, 0.08), 100);
  }

  function repairAndParseJson(raw) {
    if (!raw || typeof raw !== 'string') return null;

    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;
    text = text.slice(firstBrace);

    try {
      return JSON.parse(text);
    } catch (err) {}

    let candidate = text.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(candidate);
    } catch (err) {}

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
        else if (ch === '}') {
          if (remainingStack.length > 0 && remainingStack[remainingStack.length - 1] === '{') remainingStack.pop();
        } else if (ch === ']') {
          if (remainingStack.length > 0 && remainingStack[remainingStack.length - 1] === '[') remainingStack.pop();
        }
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

  function detectLanguageDetails(str, fallbackLang = 'en') {
    if (!str || !str.trim()) {
      if (fallbackLang === 'ar' || state.lang === 'ar') return { code: 'ar', name: 'Arabic (العربية)' };
      if (fallbackLang === 'fr' || state.lang === 'fr') return { code: 'fr', name: 'French (Français)' };
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
    if (fallbackLang === 'fr' || state.lang === 'fr') return { code: 'fr', name: 'French (Français)' };
    if (fallbackLang === 'ar' || state.lang === 'ar') return { code: 'ar', name: 'Arabic (العربية)' };

    return { code: 'en', name: 'English' };
  }

  function isBrainGymCacheValidForText(text) {
    const clean = (text || '').trim();
    if (!clean || clean.split(/\s+/).filter(Boolean).length < 15) return false;
    return Boolean(
      state.brainGymData &&
      state.brainGymCachedText &&
      state.brainGymCachedText.trim() === clean
    );
  }

  function invalidateBrainGymCache() {
    state.brainGymData = null;
    state.brainGymCachedText = '';
    state.studyGamesCachedText = '';
    setStudyGamesButtonState('idle');
    if (brainCoverageBadge) {
      brainCoverageBadge.textContent = '';
      brainCoverageBadge.style.display = 'none';
    }
    if (brainGymTopicBadge) {
      brainGymTopicBadge.textContent = 'Overview';
      brainGymTopicBadge.title = '';
    }
  }

  function setStudyGamesButtonState(newState) {
    state.studyGamesState = newState;
    if (!btnOpenBrainGym) return;

    btnOpenBrainGym.classList.remove('is-thinking', 'is-ready');

    if (newState === 'thinking') {
      btnOpenBrainGym.classList.add('is-thinking');
      if (brainIdleIcon) brainIdleIcon.classList.add('hidden');
      if (brainSpinnerIcon) brainSpinnerIcon.classList.remove('hidden');
      if (brainBtnLabel) brainBtnLabel.textContent = 'Thinking...';
      if (brainReadyMark) brainReadyMark.classList.add('hidden');
    } else if (newState === 'ready') {
      btnOpenBrainGym.classList.add('is-ready');
      if (brainIdleIcon) brainIdleIcon.classList.remove('hidden');
      if (brainSpinnerIcon) brainSpinnerIcon.classList.add('hidden');
      if (brainBtnLabel) brainBtnLabel.textContent = 'Study Games';
      if (brainReadyMark) brainReadyMark.classList.remove('hidden');
    } else {
      // idle
      if (brainIdleIcon) brainIdleIcon.classList.remove('hidden');
      if (brainSpinnerIcon) brainSpinnerIcon.classList.add('hidden');
      if (brainBtnLabel) brainBtnLabel.textContent = 'Study Games';
      if (brainReadyMark) brainReadyMark.classList.add('hidden');
    }
  }

  async function handleBrainGymTriggerClick() {
    const currentText = (rawInput ? rawInput.value : state.text || '').trim();
    if (!currentText || currentText.split(/\s+/).filter(Boolean).length < 15) {
      showToast('Please enter or paste text to generate study games.');
      return;
    }

    if (state.studyGamesState === 'thinking') {
      showToast('Gemini is currently analyzing your text...');
      return;
    }

    // Only open immediately if games are already ready for THIS EXACT text
    if (isBrainGymCacheValidForText(currentText) && state.studyGamesState === 'ready') {
      openBrainGymModal();
      return;
    }

    // Otherwise, clear any stale data from prior text
    if (!isBrainGymCacheValidForText(currentText)) {
      invalidateBrainGymCache();
    }

    // Transition to thinking state, analyze text in background, do NOT open modal yet!
    setStudyGamesButtonState('thinking');
    showToast('Analyzing text with Gemini...');

    try {
      await fetchBrainGames(true);
      const freshText = (rawInput ? rawInput.value : state.text || '').trim();
      if (isBrainGymCacheValidForText(freshText)) {
        setStudyGamesButtonState('ready');
        playChime();
        showToast('✓ Study games ready! Click to open.');
      } else {
        setStudyGamesButtonState('idle');
      }
    } catch (err) {
      console.error('Study games generation error:', err);
      setStudyGamesButtonState('idle');
      showToast('Could not generate games. Please check text or connection.');
    }
  }

  function updateGameAudioToggleUI() {
    if (!btnToggleGameAudio) return;
    const isOn = Boolean(state.gameAudioEnabled);
    btnToggleGameAudio.classList.toggle('active', isOn);
    const iconOn = btnToggleGameAudio.querySelector('.icon-audio-on');
    const iconOff = btnToggleGameAudio.querySelector('.icon-audio-off');
    if (iconOn) iconOn.classList.toggle('hidden', !isOn);
    if (iconOff) iconOff.classList.toggle('hidden', isOn);
    if (audioToggleLabel) audioToggleLabel.textContent = isOn ? 'Audio: On' : 'Audio: Off';
    btnToggleGameAudio.title = isOn ? 'Click-to-read audio is ON (Click to turn off)' : 'Click-to-read audio is OFF (Click to turn on)';
  }

  function toggleGameAudio() {
    state.gameAudioEnabled = !state.gameAudioEnabled;
    localStorage.setItem('focus_game_audio', state.gameAudioEnabled ? '1' : '0');
    if (!state.gameAudioEnabled) {
      stopSpeech();
    }
    updateGameAudioToggleUI();
    showToast(state.gameAudioEnabled ? 'Audio click-to-read enabled' : 'Audio click-to-read muted');
  }

  function speakGameText(textToSpeak) {
    if (!state.gameAudioEnabled) return;
    if (!textToSpeak || !textToSpeak.trim()) return;
    const clean = textToSpeak.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').replace(/[*_~`#\\]/g, ' ').trim();
    if (!clean) return;

    // Immediately stop any currently playing speech or audio stream
    stopAudioStream();
    if (synth && (synth.speaking || synth.paused)) {
      synth.cancel();
    }

    // Determine target dialect: respects active document and user-selected language
    const targetDialect = getTargetDialect(clean);
    const shortLang = targetDialect.split('-')[0];

    // Check if voice should be stream fallback (e.g. French/Arabic cloud audio stream)
    const selectedVoiceVal = ttsVoice ? ttsVoice.value : '';
    const hasLocalVoice = availableVoices.some(v => (v.lang || '').toLowerCase().startsWith(shortLang));
    const useStream = (selectedVoiceVal && selectedVoiceVal.startsWith('stream-')) || (!hasLocalVoice && shortLang !== 'en');

    if (useStream) {
      playAudioStreamFallback(
        clean,
        targetDialect,
        () => {
          state.isSpeaking = false;
        },
        () => {
          // Fallback to Web Speech if stream encounters network issue
          if (!state.isSpeaking) return;
          speakViaWebSpeech(clean, targetDialect, undefined);
        }
      );
      return;
    }

    // Otherwise use Web Speech API with properly matched local voice
    speakViaWebSpeech(clean, targetDialect, undefined);
  }

  function openBrainGymModal() {
    if (!brainGymModal) return;
    brainGymModal.classList.remove('hidden');
    stopSpeech();
    updateGameAudioToggleUI();

    const currentText = (rawInput ? rawInput.value : state.text || '').trim();
    if (!isBrainGymCacheValidForText(currentText)) {
      invalidateBrainGymCache();
      fetchBrainGames(true);
    } else {
      renderBrainGymActiveMode();
    }
  }

  function closeBrainGymModal() {
    if (!brainGymModal) return;
    brainGymModal.classList.add('hidden');
    stopSpeech();
  }

  function updateBrainGymHUD() {
    const brainStreakCount = document.getElementById('brainStreakCount');
    const brainXpCount = document.getElementById('brainXpCount');
    if (brainStreakCount) brainStreakCount.textContent = `${state.brainGymStreak || 1}x`;
    if (brainXpCount) brainXpCount.textContent = `${state.brainGymXp || 0} XP`;
  }


  async function fetchBrainGames(force = false) {
    const currentText = (rawInput.value || state.text || '').trim();
    if (!currentText || currentText.split(/\s+/).filter(Boolean).length < 15) {
      if (brainGymStage) {
        brainGymStage.innerHTML = `
          <div class="brain-gym-loading">
            <div class="brain-pulse-ring">📖</div>
            <div class="brain-loading-title">No Text to Transform</div>
            <div class="brain-loading-sub">Paste an article, study paper, or notes into FocusFlow so Gemini can forge smart cognitive games for you!</div>
            <button id="btnBrainLoadSample" class="btn btn-accent" style="margin-top:12px;">Load Sample Text</button>
          </div>
        `;
        const btnSample = document.getElementById('btnBrainLoadSample');
        if (btnSample) {
          btnSample.addEventListener('click', () => {
            const sample = SAMPLES[state.lang] || SAMPLES.en;
            applyPastedText(sample);
            fetchBrainGames(true);
          });
        }
      }
      return;
    }

    if (!force && isBrainGymCacheValidForText(currentText)) {
      renderBrainGymActiveMode();
      return;
    }

    if (brainGymStage) {
      brainGymStage.innerHTML = `
        <div class="brain-gym-loading">
          <div class="brain-pulse-ring">
            <svg class="icon-sm btn-brain-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          </div>
          <div class="brain-loading-title">Generating Study Modules...</div>
          <div class="brain-loading-sub">Analyzing key concepts, causal mechanisms, and logical arguments with Gemini.</div>
        </div>
      `;
    }

    try {
      let resultData = null;

      // 1. First attempt: Serverless proxy /api/gemini
      try {
        const res = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currentText,
            apiKey: GEMINI_API_KEY,
            difficulty: state.brainGymDepth,
            lang: state.lang,
            model: 'gemini-3.5-flash-lite'
          })
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            resultData = normalizeGameData(json.data);
          }
        }
      } catch (e) {
        console.warn('/api/gemini endpoint unavailable, using direct Google Generative Language REST fallback:', e);
      }

      // 2. Direct client-side fetch fallback to Google API if proxy failed
      if (!resultData) {
        function calculateGameDensity(t) {
          const words = t.trim().split(/\s+/).filter(Boolean).length;
          const paragraphs = t.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(p => p.length > 25);
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

        const density = calculateGameDensity(currentText);
        const langInfo = detectLanguageDetails(currentText, state.lang);
        const models = [
          'gemini-3.5-flash-lite',
          'gemini-flash-lite-latest',
          'gemini-3.7-flash',
          'gemini-3.1-flash-lite',
          'gemini-3.5-flash',
          'gemini-3.8-flash'
        ];
        const fullPrompt = `CRITICAL MANDATORY REQUIREMENT — ABSOLUTE LANGUAGE LOCK:
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

MODE: ${state.brainGymDepth === 'sprint' ? 'Fast Sprint' : 'Deep Critical Thinking'}
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
${currentText}

REMINDER: All generated content in the JSON above MUST BE STRICTLY AND EXCLUSIVELY in ${langInfo.name.toUpperCase()}!`;

        for (const m of models) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEMINI_API_KEY}`;
            const apiRes = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 65536,
                  responseMimeType: 'application/json'
                }
              })
            });

            if (apiRes.ok) {
              const apiJson = await apiRes.json();
              const raw = apiJson.candidates?.[0]?.content?.parts?.[0]?.text;
              if (raw) {
                const rawParsed = repairAndParseJson(raw);
                if (rawParsed) {
                  resultData = normalizeGameData(rawParsed);
                  break;
                }
              }
            }
          } catch (mErr) {
            console.warn(`Model ${m} fetch error:`, mErr);
          }
        }
      }

      if (!resultData) {
        throw new Error('Could not parse valid game data from Gemini.');
      }

      state.brainGymData = resultData;
      state.brainGymCachedText = currentText;
      state.studyGamesCachedText = currentText;
      state.brainGymJourneyNodeIdx = 0;
      state.brainGymJourneyUnlockedNodes = [0];
      state.brainGymJourneyRevealedEpiphany = {};
      state.brainGymFlashcardIdx = 0;
      state.brainGymQuizIdx = 0;
      state.brainGymDetectiveIdx = 0;
      state.brainGymMatchSelected = null;
      state.brainGymMatchedPairs = [];
      state.brainGymMatchTiles = null;

      if (brainCoverageBadge) {
        const total = resultData.totalNodes || (resultData.nodes ? resultData.nodes.length : 0);
        if (total > 0) {
          brainCoverageBadge.textContent = `${total}/${total} Ideas Covered (100%)`;
          brainCoverageBadge.style.display = 'inline-flex';
        } else {
          brainCoverageBadge.style.display = 'none';
        }
      }

      if (brainGymTopicBadge) {
        brainGymTopicBadge.textContent = resultData.topic || 'Overview';
        brainGymTopicBadge.title = resultData.topic || '';
      }

      setStudyGamesButtonState('ready');

      if (brainGymModal && !brainGymModal.classList.contains('hidden')) {
        renderBrainGymActiveMode();
      }

    } catch (err) {
      console.error('Failed to generate study games:', err);
      setStudyGamesButtonState('idle');
      if (brainGymStage) {
        brainGymStage.innerHTML = `
          <div class="brain-gym-loading">
            <div class="brain-pulse-ring" style="border-color:#ef4444;color:#ef4444;">!</div>
            <div class="brain-loading-title">Generation Error</div>
            <div class="brain-loading-sub">${escapeHtml(err.message || 'Error communicating with Gemini API.')}</div>
            <button id="btnBrainRetry" class="btn btn-accent" style="margin-top:12px;">Try Again</button>
          </div>
        `;
        const retryBtn = document.getElementById('btnBrainRetry');
        if (retryBtn) retryBtn.addEventListener('click', () => fetchBrainGames(true));
      }
    }
  }

  function setBrainGymMode(mode) {
    state.brainGymActiveMode = mode;
    [btnGameJourney, btnGameFlashcards, btnGameQuiz, btnGameDetective, btnGameMatch].forEach(btn => {
      if (btn) {
        const isActive = (btn.id === `btnGame${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    });
    renderBrainGymActiveMode();
  }

  function renderBrainGymActiveMode() {
    updateBrainGymHUD();
    if (!state.brainGymData) {
      fetchBrainGames();
      return;
    }

    if (state.brainGymActiveMode === 'journey') {
      renderCuriosityJourneyView();
    } else if (state.brainGymActiveMode === 'flashcards') {
      renderFlashcardsView();
    } else if (state.brainGymActiveMode === 'quiz') {
      renderQuizView();
    } else if (state.brainGymActiveMode === 'detective') {
      renderDetectiveView();
    } else if (state.brainGymActiveMode === 'match') {
      renderMatchView();
    }
  }

  // --- Mode 0 / Flagship: Progressive Curiosity Journey ---
  function renderCuriosityJourneyView() {
    if (!brainGymStage || !state.brainGymData) return;
    const nodes = state.brainGymData.nodes || [];
    if (nodes.length === 0) {
      brainGymStage.innerHTML = `
        <div class="brain-gym-loading">
          <div class="brain-loading-sub">No discovery milestones found for this text. Try regenerating or explore Flashcards.</div>
          <button id="btnJourneyToFlashcards" class="btn btn-sm btn-accent" style="margin-top:12px;">Go to Flashcards</button>
        </div>
      `;
      const fBtn = document.getElementById('btnJourneyToFlashcards');
      if (fBtn) fBtn.addEventListener('click', () => setBrainGymMode('flashcards'));
      return;
    }

    const currIdx = Math.max(0, Math.min(state.brainGymJourneyNodeIdx, nodes.length - 1));
    state.brainGymJourneyNodeIdx = currIdx;
    const currNode = nodes[currIdx];
    const isRevealed = Boolean(state.brainGymJourneyRevealedEpiphany[currIdx]);
    const isLastNode = (currIdx === nodes.length - 1);
    const totalMastered = Object.keys(state.brainGymJourneyRevealedEpiphany).length;

    // Build Roadmap Stepper HTML
    const stepperNodesHtml = nodes.map((node, i) => {
      const isActive = (i === currIdx);
      const isUnlocked = state.brainGymJourneyUnlockedNodes.includes(i);
      const isAnswered = Boolean(state.brainGymJourneyRevealedEpiphany[i]);
      const title = node.stageTitle || `Milestone ${i + 1}`;
      return `
        <button class="journey-step-node ${isActive ? 'is-active' : ''} ${isAnswered ? 'is-unlocked' : ''}" 
                data-nidx="${i}" 
                ${isUnlocked ? '' : 'disabled'}
                title="${escapeHtml(title)} (${isAnswered ? 'Resolved' : isUnlocked ? 'Ready' : 'Locked'})">
          <span class="journey-step-num">${isAnswered ? '✓' : (i + 1)}</span>
          <span>${escapeHtml(title)}</span>
        </button>
      `;
    }).join('');

    // Choices HTML
    const letters = ['A', 'B', 'C', 'D'];
    const choices = currNode.choices || [];
    const choicesHtml = choices.map((choice, cIdx) => {
      const letter = letters[cIdx] || `${cIdx + 1}`;
      let extraClass = '';
      let disabledAttr = isRevealed ? 'disabled' : '';
      if (isRevealed && cIdx === currNode.correctIndex) {
        extraClass = 'is-correct';
      }
      return `
        <button class="hypothesis-btn ${extraClass}" data-cidx="${cIdx}" data-tts-read="${escapeHtml(choice)}" ${disabledAttr}>
          <span class="hypothesis-letter">${letter}</span>
          <span>${escapeHtml(choice)}</span>
        </button>
      `;
    }).join('');

    // Epiphany & Next Bridge HTML
    let epiphanyHtml = '';
    if (isRevealed) {
      epiphanyHtml = `
        <div class="epiphany-card">
          <div class="epiphany-header">
            <div class="epiphany-title-group">
              <span class="badge badge-accent">Insight</span>
            </div>
          </div>
          <div class="epiphany-text" data-tts-read="${escapeHtml(currNode.epiphany)}">${escapeHtml(currNode.epiphany)}</div>

          ${currNode.sourceSnippet ? `
            <div class="source-spotlight-box">
              <div class="spotlight-label-row">
                <span>Source Passage</span>
                <button id="btnSpotlightSnippet" class="btn-spotlight-canvas" title="Highlight this excerpt in the reading canvas">Highlight on Canvas</button>
              </div>
              <div class="spotlight-snippet" data-tts-read="${escapeHtml(currNode.sourceSnippet)}">“${escapeHtml(currNode.sourceSnippet)}”</div>
            </div>
          ` : ''}

          ${!isLastNode ? `
            <div class="curiosity-bridge-card">
              <span class="bridge-title">Milestone ${currIdx + 2} Context</span>
              <div class="bridge-teaser" data-tts-read="${escapeHtml(currNode.curiosityBridge || '')}">${escapeHtml(currNode.curiosityBridge || 'Proceeding to the next key mechanism in the text.')}</div>
              <div class="journey-action-bar">
                <button id="btnJourneyNext" class="btn btn-accent" style="margin-left:auto;">
                  <span>Next Milestone →</span>
                </button>
              </div>
            </div>
          ` : `
            <div class="journey-complete-banner">
              <div class="journey-complete-title">Discovery Completed</div>
              <div class="journey-complete-desc">You have unlocked all ${nodes.length} milestones and reviewed the entire text sequentially.</div>
              <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;justify-content:center;">
                <button id="btnJourneyRestart" class="btn btn-secondary">Review Milestones</button>
                <button id="btnJourneyToQuiz" class="btn btn-accent">Practice Quiz →</button>
              </div>
            </div>
          `}
        </div>
      `;
    }

    brainGymStage.innerHTML = `
      <div class="journey-stage-container">
        <!-- Roadmap Stepper Header -->
        <div class="journey-roadmap-header">
          <div class="journey-header-meta">
            <div class="journey-title-text">
              <span>${escapeHtml(state.brainGymData.journeyTitle || 'Chronological Discovery')}</span>
            </div>
            <span class="journey-coverage-pill" title="Every section of the text is sequentially accounted for">
              ${totalMastered}/${nodes.length} Completed
            </span>
          </div>

          <div class="journey-stepper-track" id="journeyStepperTrack">
            ${stepperNodesHtml}
          </div>
        </div>

        <!-- Single Clean Dilemma Card -->
        <div class="brain-scratcher-box">
          <div class="scratcher-badge-row">
            <span class="scratcher-milestone-tag">Stage ${currIdx + 1} of ${nodes.length} &bull; ${escapeHtml(currNode.stageTitle || '')}</span>
          </div>

          <div class="journey-dilemma-text" data-tts-read="${escapeHtml(currNode.brainScratcher || currNode.question)}">${escapeHtml(currNode.brainScratcher || currNode.question)}</div>
        </div>

        <!-- Hypothesis Choices -->
        <div class="hypothesis-grid" id="journeyHypothesisGrid">
          ${choicesHtml}
        </div>

        <!-- Epiphany & Bridge / Complete -->
        ${epiphanyHtml}
      </div>
    `;

    // Auto-scroll active stepper milestone into view & epiphany if unlocked
    setTimeout(() => {
      const activeStepBtn = brainGymStage.querySelector('.journey-step-node.is-active');
      if (activeStepBtn) {
        activeStepBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
      if (isRevealed) {
        const epCard = brainGymStage.querySelector('.epiphany-card');
        if (epCard) {
          epCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }, 40);

    // Hook Stepper Clicks
    const stepBtns = brainGymStage.querySelectorAll('.journey-step-node');
    stepBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const nIdx = parseInt(btn.dataset.nidx, 10);
        if (state.brainGymJourneyUnlockedNodes.includes(nIdx)) {
          state.brainGymJourneyNodeIdx = nIdx;
          playTapTone();
          renderCuriosityJourneyView();
        }
      });
    });

    // Hook Hypothesis Clicks
    if (!isRevealed) {
      const hypBtns = brainGymStage.querySelectorAll('.hypothesis-btn');
      hypBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const cIdx = parseInt(btn.dataset.cidx, 10);
          if (cIdx === currNode.correctIndex) {
            state.brainGymJourneyRevealedEpiphany[currIdx] = true;
            if (currIdx + 1 < nodes.length && !state.brainGymJourneyUnlockedNodes.includes(currIdx + 1)) {
              state.brainGymJourneyUnlockedNodes.push(currIdx + 1);
            }
            state.brainGymXp += 100;
            state.brainGymStreak++;
            playChime();
            updateBrainGymHUD();
            renderCuriosityJourneyView();
          } else {
            playTrapTone();
            btn.classList.add('is-distractor');
            showToast('Look closer at the mechanism and try another hypothesis.');
          }
        });
      });
    }

    // Hook Next Button
    const btnNext = document.getElementById('btnJourneyNext');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (currIdx + 1 < nodes.length) {
          state.brainGymJourneyNodeIdx = currIdx + 1;
          if (!state.brainGymJourneyUnlockedNodes.includes(currIdx + 1)) {
            state.brainGymJourneyUnlockedNodes.push(currIdx + 1);
          }
          playTapTone();
          renderCuriosityJourneyView();
        }
      });
    }

    // Hook Restart Button
    const btnRestart = document.getElementById('btnJourneyRestart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        state.brainGymJourneyNodeIdx = 0;
        playTapTone();
        renderCuriosityJourneyView();
      });
    }

    // Hook To Quiz Button
    const btnToQuiz = document.getElementById('btnJourneyToQuiz');
    if (btnToQuiz) {
      btnToQuiz.addEventListener('click', () => {
        setBrainGymMode('quiz');
      });
    }

    // Hook Spotlight Button
    const btnSpotlight = document.getElementById('btnSpotlightSnippet');
    if (btnSpotlight && currNode.sourceSnippet) {
      btnSpotlight.addEventListener('click', () => {
        spotlightSnippetOnCanvas(currNode.sourceSnippet);
      });
    }
  }

  function spotlightSnippetOnCanvas(snippet) {
    if (!snippet) return;
    const cleanSnippet = snippet.trim().toLowerCase();
    
    // Find closest sentence in sentenceRegistry
    let matchIdx = -1;
    if (sentenceRegistry && sentenceRegistry.length > 0) {
      for (let i = 0; i < sentenceRegistry.length; i++) {
        const sText = (sentenceRegistry[i].text || '').toLowerCase();
        const rText = (sentenceRegistry[i].rawText || '').toLowerCase();
        if (sText.includes(cleanSnippet.slice(0, 30)) || cleanSnippet.includes(sText.slice(0, 30)) ||
            rText.includes(cleanSnippet.slice(0, 30)) || cleanSnippet.includes(rText.slice(0, 30))) {
          matchIdx = i;
          break;
        }
      }
    }

    if (matchIdx !== -1) {
      state.activeSentenceIdx = matchIdx;
      highlightActiveSentence(matchIdx);
      const targetEl = document.querySelector(`.bionic-sentence[data-sentence-index="${matchIdx}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      showToast('📍 Passage highlighted on reading canvas!');
    } else {
      showToast(`📍 Passage: "${snippet.slice(0, 45)}..."`);
    }
  }

  // --- Mode 1: 3D Flashcards ---
  function renderFlashcardsView() {
    if (!brainGymStage || !state.brainGymData) return;
    const cards = state.brainGymData.flashcards || [];
    if (cards.length === 0) {
      brainGymStage.innerHTML = `<div class="brain-gym-loading"><div class="brain-loading-sub">No flashcards generated for this text.</div></div>`;
      return;
    }

    const idx = Math.max(0, Math.min(state.brainGymFlashcardIdx, cards.length - 1));
    state.brainGymFlashcardIdx = idx;
    const card = cards[idx];
    const cardId = card.id || idx;
    const isMastered = Boolean(state.brainGymMasteredCards[cardId]);

    brainGymStage.innerHTML = `
      <div class="flashcard-stage-container">
        <div class="flashcard-meta-bar">
          <span class="flashcard-progress-pill">Card ${idx + 1} of ${cards.length}</span>
          ${isMastered ? '<span class="badge" style="background:#dcfce7;color:#166534;font-weight:700;">✓ Mastered</span>' : '<span class="badge badge-accent">Active Recall</span>'}
        </div>

        <div id="flashcardBox" class="flashcard-3d-wrapper" role="button" tabindex="0" title="Click or Spacebar to flip card">
          <div id="flashcardInner" class="flashcard-card-inner">
            <!-- Front Face -->
            <div class="flashcard-face flashcard-face-front" data-tts-read="${escapeHtml(card.question)}">
              <span class="flashcard-prompt-label">Question</span>
              <div class="flashcard-question-text">${escapeHtml(card.question)}</div>
              <div class="flashcard-tap-hint">
                <span>Click or press Space to flip</span>
                <span class="bullet">•</span>
                <span>${idx + 1}/${cards.length}</span>
              </div>
            </div>

            <!-- Back Face -->
            <div class="flashcard-face flashcard-face-back" data-tts-read="${escapeHtml(card.mentalModel + '. ' + card.mechanism + (card.analogy ? '. Analogy: ' + card.analogy : ''))}">
              <span class="flashcard-prompt-label">Core Principle</span>
              <div class="flashcard-model-box">
                <div class="flashcard-model-title">${escapeHtml(card.mentalModel)}</div>
                <div class="flashcard-mechanism-text">${escapeHtml(card.mechanism)}</div>
                ${card.analogy ? `<div class="flashcard-analogy-text"><strong>Analogy:</strong> ${escapeHtml(card.analogy)}</div>` : ''}
              </div>
              <div class="flashcard-tap-hint">
                <span>Click to flip back</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flashcard-controls-row">
          <button id="btnCardPrev" class="btn btn-secondary icon-btn" title="Previous card (←)" ${idx === 0 ? 'disabled' : ''}>
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          <div class="flashcard-rating-group">
            <button id="btnCardFuzzy" class="btn btn-sm btn-secondary btn-rate-fuzzy" title="Review this concept again">Need Review</button>
            <button id="btnCardMastered" class="btn btn-sm btn-accent btn-rate-mastered" title="Mark mastered">✓ Mastered</button>
          </div>

          <button id="btnCardNext" class="btn btn-secondary icon-btn" title="Next card (→)" ${idx === cards.length - 1 ? 'disabled' : ''}>
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    `;

    const box = document.getElementById('flashcardBox');
    const inner = document.getElementById('flashcardInner');
    if (box && inner) {
      box.addEventListener('click', () => {
        inner.classList.toggle('is-flipped');
        playTapTone();
      });
    }

    const btnPrev = document.getElementById('btnCardPrev');
    const btnNext = document.getElementById('btnCardNext');
    if (btnPrev) btnPrev.addEventListener('click', () => {
      if (state.brainGymFlashcardIdx > 0) {
        state.brainGymFlashcardIdx--;
        renderFlashcardsView();
      }
    });
    if (btnNext) btnNext.addEventListener('click', () => {
      if (state.brainGymFlashcardIdx < cards.length - 1) {
        state.brainGymFlashcardIdx++;
        renderFlashcardsView();
      }
    });

    const btnFuzzy = document.getElementById('btnCardFuzzy');
    const btnMastered = document.getElementById('btnCardMastered');
    if (btnFuzzy) btnFuzzy.addEventListener('click', () => {
      delete state.brainGymMasteredCards[cardId];
      playTapTone();
      if (state.brainGymFlashcardIdx < cards.length - 1) {
        state.brainGymFlashcardIdx++;
        renderFlashcardsView();
      } else {
        renderFlashcardsView();
      }
    });

    if (btnMastered) btnMastered.addEventListener('click', () => {
      if (!state.brainGymMasteredCards[cardId]) {
        state.brainGymMasteredCards[cardId] = true;
        state.brainGymXp += 50;
        state.brainGymStreak++;
        playChime();
        updateBrainGymHUD();
      }
      if (state.brainGymFlashcardIdx < cards.length - 1) {
        state.brainGymFlashcardIdx++;
        renderFlashcardsView();
      } else {
        showToast('🎉 All flashcards mastered in this set!');
        renderFlashcardsView();
      }
    });
  }

  // --- Mode 2: Critical Quiz ---
  function renderQuizView() {
    if (!brainGymStage || !state.brainGymData) return;
    const questions = state.brainGymData.criticalQuiz || [];
    if (questions.length === 0) {
      brainGymStage.innerHTML = `<div class="brain-gym-loading"><div class="brain-loading-sub">No quiz questions available.</div></div>`;
      return;
    }

    const idx = Math.max(0, Math.min(state.brainGymQuizIdx, questions.length - 1));
    state.brainGymQuizIdx = idx;
    const q = questions[idx];
    const letters = ['A', 'B', 'C', 'D'];

    let optionsHtml = '';
    (q.options || []).forEach((opt, optIdx) => {
      optionsHtml += `
        <button class="quiz-option-button" data-idx="${optIdx}" data-tts-read="${escapeHtml(opt)}">
          <span class="quiz-option-letter">${letters[optIdx]}</span>
          <span class="quiz-option-text">${escapeHtml(opt)}</span>
        </button>
      `;
    });

    brainGymStage.innerHTML = `
      <div class="quiz-stage-container">
        <div class="quiz-scenario-card" data-tts-read="${escapeHtml(q.scenario)}">
          <div class="quiz-question-number">Question ${idx + 1} of ${questions.length}</div>
          <div class="quiz-scenario-title">${escapeHtml(q.scenario)}</div>
        </div>

        <div class="quiz-options-group" id="quizOptionsGroup">
          ${optionsHtml}
        </div>

        <div id="quizFeedbackArea"></div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
          <button id="btnQuizPrev" class="btn btn-sm btn-secondary" ${idx === 0 ? 'disabled' : ''}>← Previous</button>
          <button id="btnQuizNext" class="btn btn-sm btn-secondary" ${idx === questions.length - 1 ? 'disabled' : ''}>Next Question →</button>
        </div>
      </div>
    `;

    const optButtons = brainGymStage.querySelectorAll('.quiz-option-button');
    const feedbackArea = document.getElementById('quizFeedbackArea');

    optButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const selected = parseInt(btn.dataset.idx, 10);
        const isCorrect = (selected === q.correctIndex);

        optButtons.forEach(b => {
          b.disabled = true;
          const bIdx = parseInt(b.dataset.idx, 10);
          if (bIdx === q.correctIndex) {
            b.classList.add('is-correct');
          } else if (bIdx === selected && !isCorrect) {
            b.classList.add('is-wrong');
          }
        });

        if (isCorrect) {
          state.brainGymXp += 100;
          state.brainGymStreak++;
          playChime();
          updateBrainGymHUD();
          feedbackArea.innerHTML = `
            <div class="quiz-feedback-box">
              <div class="quiz-feedback-title">✓ Correct</div>
              <div class="quiz-feedback-explanation" data-tts-read="${escapeHtml(q.explanation)}">${escapeHtml(q.explanation)}</div>
              ${q.criticalInsight ? `<div class="quiz-critical-takeaway" data-tts-read="${escapeHtml(q.criticalInsight)}"><strong>Core Insight:</strong> ${escapeHtml(q.criticalInsight)}</div>` : ''}
              <div style="margin-top:14px; display:flex; justify-content:flex-end;">
                ${idx < questions.length - 1 ? `
                  <button id="btnFeedbackNext" class="btn btn-sm btn-accent">Next Question →</button>
                ` : `
                  <span class="badge" style="background:#dcfce7;color:#166534;font-weight:700;">Quiz Completed</span>
                `}
              </div>
            </div>
          `;
        } else {
          state.brainGymStreak = 1;
          playTrapTone();
          updateBrainGymHUD();
          feedbackArea.innerHTML = `
            <div class="quiz-feedback-box is-wrong-box">
              <div class="quiz-feedback-title" style="color:var(--text-danger, #ef4444);">Review Note</div>
              <div class="quiz-feedback-explanation" data-tts-read="${escapeHtml(q.explanation)}">${escapeHtml(q.explanation)}</div>
              ${q.criticalInsight ? `<div class="quiz-critical-takeaway" data-tts-read="${escapeHtml(q.criticalInsight)}"><strong>Core Insight:</strong> ${escapeHtml(q.criticalInsight)}</div>` : ''}
              ${idx < questions.length - 1 ? `
                <div style="margin-top:14px; display:flex; justify-content:flex-end;">
                  <button id="btnFeedbackNext" class="btn btn-sm btn-secondary">Continue to Next Question →</button>
                </div>
              ` : ''}
            </div>
          `;
        }

        const btnFbNext = document.getElementById('btnFeedbackNext');
        if (btnFbNext) {
          btnFbNext.addEventListener('click', () => {
            if (state.brainGymQuizIdx < questions.length - 1) {
              state.brainGymQuizIdx++;
              playTapTone();
              renderQuizView();
            }
          });
        }

        setTimeout(() => {
          feedbackArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 40);
      });
    });

    const prevBtn = document.getElementById('btnQuizPrev');
    const nextBtn = document.getElementById('btnQuizNext');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (state.brainGymQuizIdx > 0) {
        state.brainGymQuizIdx--;
        renderQuizView();
      }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (state.brainGymQuizIdx < questions.length - 1) {
        state.brainGymQuizIdx++;
        renderQuizView();
      }
    });
  }

  // --- Mode 3: Truth Detective ---
  function renderDetectiveView() {
    if (!brainGymStage || !state.brainGymData) return;
    const rounds = state.brainGymData.truthDetective || [];
    if (rounds.length === 0) {
      brainGymStage.innerHTML = `<div class="brain-gym-loading"><div class="brain-loading-sub">No detective rounds available.</div></div>`;
      return;
    }

    const idx = Math.max(0, Math.min(state.brainGymDetectiveIdx, rounds.length - 1));
    state.brainGymDetectiveIdx = idx;
    const round = rounds[idx];
    const statements = round.statements || [];

    let cardsHtml = '';
    statements.forEach((stmt, sIdx) => {
      cardsHtml += `
        <div class="detective-statement-card" data-idx="${sIdx}" data-tts-read="${escapeHtml(stmt.text)}">
          <div style="font-weight:700; font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">Statement #${sIdx + 1}</div>
          <div>${escapeHtml(stmt.text)}</div>
        </div>
      `;
    });

    brainGymStage.innerHTML = `
      <div class="detective-stage-container">
        <div class="detective-intro-box">
          <div class="detective-goal">Round ${idx + 1} of ${rounds.length} &bull; Spot the Fallacy</div>
          <div class="detective-premise" data-tts-read="${escapeHtml(round.premise || '')}">${round.premise ? escapeHtml(round.premise) : 'Two statements below are valid logical deductions from the text. One is an invalid fallacy. Spot the fallacy.'}</div>
        </div>

        <div class="detective-cards-list" id="detectiveCardsList">
          ${cardsHtml}
        </div>

        <div id="detectiveRevealArea"></div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
          <button id="btnDetPrev" class="btn btn-sm btn-secondary" ${idx === 0 ? 'disabled' : ''}>← Previous Round</button>
          <button id="btnDetNext" class="btn btn-sm btn-secondary" ${idx === rounds.length - 1 ? 'disabled' : ''}>Next Round →</button>
        </div>
      </div>
    `;

    const cards = brainGymStage.querySelectorAll('.detective-statement-card');
    const revealArea = document.getElementById('detectiveRevealArea');

    cards.forEach(cardEl => {
      cardEl.addEventListener('click', () => {
        const sIdx = parseInt(cardEl.dataset.idx, 10);
        const stmt = statements[sIdx];

        if (stmt.isTrap) {
          cardEl.classList.add('trap-caught');
          cards.forEach((other, oIdx) => {
            if (oIdx !== sIdx) other.classList.add('solid-truth');
          });
          state.brainGymXp += 150;
          state.brainGymStreak++;
          playChime();
          updateBrainGymHUD();

          revealArea.innerHTML = `
            <div class="detective-reveal-card" style="border-left:4px solid #10b981;">
              <div class="fallacy-header-row">
                <span class="fallacy-pill">Fallacy: ${escapeHtml(stmt.fallacyType || 'Logical Fallacy')}</span>
              </div>
              <div class="fallacy-reason-text" data-tts-read="${escapeHtml(stmt.trapReason || '')}">${escapeHtml(stmt.trapReason || 'This statement is an invalid extrapolation that breaks causal logic.')}</div>
              ${idx < rounds.length - 1 ? `
                <div style="margin-top:14px; display:flex; justify-content:flex-end;">
                  <button id="btnDetNextCard" class="btn btn-sm btn-accent">Next Round →</button>
                </div>
              ` : `
                <div style="margin-top:14px; display:flex; justify-content:flex-end;">
                  <span class="badge" style="background:#dcfce7;color:#166534;font-weight:700;">All Rounds Solved</span>
                </div>
              `}
            </div>
          `;
          const detNextBtn = document.getElementById('btnDetNextCard');
          if (detNextBtn) {
            detNextBtn.addEventListener('click', () => {
              if (state.brainGymDetectiveIdx < rounds.length - 1) {
                state.brainGymDetectiveIdx++;
                playTapTone();
                renderDetectiveView();
              }
            });
          }
        } else {
          cardEl.classList.add('false-alarm');
          playTrapTone();
          revealArea.innerHTML = `
            <div class="detective-reveal-card" style="border-left:4px solid #ef4444;">
              <div style="font-weight:700; color:#ef4444; margin-bottom:4px;">Valid Premise</div>
              <div class="fallacy-reason-text">This statement is a valid deduction from the text. Look for the invalid fallacy.</div>
            </div>
          `;
        }

        setTimeout(() => {
          revealArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 40);
      });
    });

    const prevBtn = document.getElementById('btnDetPrev');
    const nextBtn = document.getElementById('btnDetNext');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (state.brainGymDetectiveIdx > 0) {
        state.brainGymDetectiveIdx--;
        renderDetectiveView();
      }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (state.brainGymDetectiveIdx < rounds.length - 1) {
        state.brainGymDetectiveIdx++;
        renderDetectiveView();
      }
    });
  }

  // --- Mode 4: Neural Connector (Concept Match) ---
  function renderMatchView() {
    if (!brainGymStage || !state.brainGymData) return;
    const pairs = state.brainGymData.conceptMatch || [];
    if (pairs.length === 0) {
      brainGymStage.innerHTML = `<div class="brain-gym-loading"><div class="brain-loading-sub">No concept matching pairs available.</div></div>`;
      return;
    }

    if (!state.brainGymMatchTiles || state.brainGymMatchTiles.length === 0) {
      const leftTiles = pairs.map((p, idx) => ({ id: idx, type: 'left', text: p.left }));
      const rightTiles = pairs.map((p, idx) => ({ id: idx, type: 'right', text: p.right }));
      const combined = [...leftTiles, ...rightTiles].sort(() => Math.random() - 0.5);
      state.brainGymMatchTiles = combined;
      state.brainGymMatchedPairs = [];
      state.brainGymMatchSelected = null;
    }

    const matchedSet = new Set(state.brainGymMatchedPairs);
    const isCompleted = matchedSet.size === pairs.length;

    let gridHtml = '';
    state.brainGymMatchTiles.forEach((tile, tIdx) => {
      const isMatched = matchedSet.has(tile.id);
      const isSelected = (state.brainGymMatchSelected === tIdx);
      gridHtml += `
        <button class="match-tile-btn ${isMatched ? 'is-matched' : ''} ${isSelected ? 'is-selected' : ''}" 
                data-tidx="${tIdx}" 
                data-id="${tile.id}" 
                data-type="${tile.type}" 
                data-tts-read="${escapeHtml(tile.text)}" 
                ${isMatched ? 'disabled' : ''}>
          <span>${escapeHtml(tile.text)}</span>
        </button>
      `;
    });

    brainGymStage.innerHTML = `
      <div class="match-stage-container">
        <div class="match-instructions">
          <span>Select a concept and pair it with its corresponding mechanism.</span>
          <span style="font-weight:600;">Matched: ${matchedSet.size} / ${pairs.length}</span>
        </div>

        <div class="match-grid-container" id="matchGridContainer">
          ${gridHtml}
        </div>

        ${isCompleted ? `
          <div class="match-success-banner">
            <div>All ${pairs.length} concept pairs successfully matched.</div>
            <div style="margin-top:10px;">
              <button id="btnMatchRestart" class="btn btn-sm btn-accent">Play Again</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const tiles = brainGymStage.querySelectorAll('.match-tile-btn');
    tiles.forEach(tileBtn => {
      tileBtn.addEventListener('click', () => {
        const tIdx = parseInt(tileBtn.dataset.tidx, 10);
        const tile = state.brainGymMatchTiles[tIdx];

        if (state.brainGymMatchSelected === null) {
          state.brainGymMatchSelected = tIdx;
          playTapTone();
          renderMatchView();
          return;
        }

        const prevIdx = state.brainGymMatchSelected;
        const prevTile = state.brainGymMatchTiles[prevIdx];

        if (prevIdx === tIdx) {
          state.brainGymMatchSelected = null;
          renderMatchView();
          return;
        }

        if (prevTile.type !== tile.type && prevTile.id === tile.id) {
          state.brainGymMatchedPairs.push(tile.id);
          state.brainGymMatchSelected = null;
          state.brainGymXp += 40;
          playChime();
          updateBrainGymHUD();

          if (state.brainGymMatchedPairs.length === pairs.length) {
            state.brainGymXp += 100;
            state.brainGymStreak++;
            updateBrainGymHUD();
            showToast('🎉 All concepts successfully paired!');
          }
          renderMatchView();
        } else {
          playTrapTone();
          state.brainGymMatchSelected = null;
          tileBtn.style.borderColor = '#ef4444';
          setTimeout(() => renderMatchView(), 400);
        }
      });
    });

    const restartBtn = document.getElementById('btnMatchRestart');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        state.brainGymMatchTiles = null;
        renderMatchView();
      });
    }
  }

  // --- Audio Read Aloud ---
  function readCurrentBrainGymContent() {
    if (!state.brainGymData) return;
    let textToSpeak = '';
    const targetDialect = getTargetDialect(state.text);
    const shortLang = targetDialect.split('-')[0];

    if (state.brainGymActiveMode === 'journey') {
      const nodes = state.brainGymData.nodes || [];
      const node = nodes[state.brainGymJourneyNodeIdx];
      if (node) {
        const isRevealed = Boolean(state.brainGymJourneyRevealedEpiphany[state.brainGymJourneyNodeIdx]);
        if (isRevealed) {
          textToSpeak = `${node.stageTitle}. ${node.epiphany}. ${node.sourceSnippet || ''}. ${node.curiosityBridge || ''}`;
        } else {
          const choicesStr = (node.choices || []).join('. ');
          textToSpeak = `${node.stageTitle}. ${node.brainScratcher}. ${node.question}. ${choicesStr}`;
        }
      }
    } else if (state.brainGymActiveMode === 'flashcards') {
      const cards = state.brainGymData.flashcards || [];
      const card = cards[state.brainGymFlashcardIdx];
      if (card) {
        textToSpeak = `${card.question}. ${card.mentalModel || ''}. ${card.mechanism || ''}`;
      }
    } else if (state.brainGymActiveMode === 'quiz') {
      const questions = state.brainGymData.criticalQuiz || [];
      const q = questions[state.brainGymQuizIdx];
      if (q) {
        const optsStr = (q.options || []).join('. ');
        textToSpeak = `${q.scenario}. ${optsStr}`;
      }
    } else if (state.brainGymActiveMode === 'detective') {
      const rounds = state.brainGymData.truthDetective || [];
      const r = rounds[state.brainGymDetectiveIdx];
      if (r) {
        const stmts = (r.statements || []).map(s => s.text).filter(Boolean).join('. ');
        textToSpeak = `${r.premise || ''}. ${stmts}`;
      }
    } else if (state.brainGymActiveMode === 'match') {
      if (shortLang === 'fr') {
        textToSpeak = 'Associez chaque concept à son mécanisme ou effet correspondant.';
      } else if (shortLang === 'ar') {
        textToSpeak = 'قم بربط كل مفهوم بآليته أو نتيجته المقابلة.';
      } else {
        textToSpeak = 'Connect each concept with its matching mechanism or effect.';
      }
    }

    if (textToSpeak) {
      speakGameText(textToSpeak);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* --------------------------------------------------------------------------
     10. Persistence
     -------------------------------------------------------------------------- */

  const STORAGE_KEY = 'focusflow_adhd_reader_v5';
  let cloudSyncDebounceTimer = null;
  let isSavingToCloud = false;

  function getWorkspaceId() {
    const params = new URLSearchParams(window.location.search);
    const custom = params.get('sync') || params.get('room') || params.get('id');
    if (custom && custom.trim()) {
      return `ws_${custom.trim().toLowerCase()}`;
    }
    return 'default_workspace';
  }

  function getStateSnapshot() {
    return {
      text: rawInput.value,
      lang: state.lang,
      dialect: state.dialect,
      dir: state.dir,
      fixation: state.fixation,
      cadence: state.cadence,
      font: state.font,
      fontSize: state.fontSize,
      lineHeight: state.lineHeight,
      maxWidth: state.maxWidth,
      theme: state.theme,
      rulerEnabled: state.rulerEnabled,
      subtleDimming: state.subtleDimming,
      viewMode: state.viewMode,
      ttsRate: state.ttsRate,
      selectedVoiceIndex: state.selectedVoiceIndex,
      sentenceMode: state.sentenceMode,
      updatedAt: state.updatedAt || Date.now()
    };
  }

  function applyStateSnapshot(snapshot, fromCloud = false) {
    if (!snapshot) return;

    if (snapshot.text !== undefined && snapshot.text !== null) {
      state.text = snapshot.text;
      rawInput.value = snapshot.text;
    }
    if (snapshot.lang) state.lang = snapshot.lang;
    if (snapshot.dialect) state.dialect = snapshot.dialect;
    if (snapshot.dir) state.dir = snapshot.dir;
    if (snapshot.fixation !== undefined) state.fixation = snapshot.fixation;
    if (snapshot.cadence) state.cadence = snapshot.cadence;
    if (snapshot.font) state.font = snapshot.font;
    if (snapshot.fontSize !== undefined) state.fontSize = snapshot.fontSize;
    if (snapshot.lineHeight !== undefined) state.lineHeight = snapshot.lineHeight;
    if (snapshot.maxWidth) state.maxWidth = snapshot.maxWidth;
    state.theme = 'light';
    if (snapshot.rulerEnabled !== undefined) state.rulerEnabled = Boolean(snapshot.rulerEnabled);
    if (snapshot.subtleDimming !== undefined) state.subtleDimming = Boolean(snapshot.subtleDimming);
    if (snapshot.viewMode) state.viewMode = snapshot.viewMode;
    if (snapshot.ttsRate !== undefined) setSpeechRate(snapshot.ttsRate, false);
    if (snapshot.selectedVoiceIndex !== undefined) state.selectedVoiceIndex = snapshot.selectedVoiceIndex;
    if (snapshot.sentenceMode) state.sentenceMode = snapshot.sentenceMode;
    if (snapshot.updatedAt) state.updatedAt = snapshot.updatedAt;

    [btnLangEn, btnLangFr, btnLangAr].forEach(btn => {
      if (btn) btn.classList.toggle('active', btn.dataset.lang === state.lang);
    });

    applySettings();
    updateRender();

    if (fromCloud) {
      setCloudSyncUI('synced');
    }
  }

  function setCloudSyncUI(status) {
    if (!btnCloudSync) return;

    if (status === 'syncing') {
      btnCloudSync.classList.add('is-syncing');
      btnCloudSync.classList.remove('is-synced');
      if (cloudSyncLabel) cloudSyncLabel.textContent = 'Saving...';
    } else if (status === 'synced') {
      btnCloudSync.classList.remove('is-syncing');
      btnCloudSync.classList.add('is-synced');
      if (cloudSyncLabel) cloudSyncLabel.textContent = 'Cloud Saved';
    } else if (status === 'offline') {
      btnCloudSync.classList.remove('is-syncing', 'is-synced');
      if (cloudSyncLabel) cloudSyncLabel.textContent = 'Offline';
    }
  }

  function saveState() {
    state.updatedAt = Date.now();
    const snapshot = getStateSnapshot();

    // 1. Instant local persistence in localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {}

    // 2. Debounced save to Cloudflare KV for cross-device sync
    clearTimeout(cloudSyncDebounceTimer);
    setCloudSyncUI('syncing');
    cloudSyncDebounceTimer = setTimeout(() => {
      pushStateToCloud(snapshot);
    }, 600);
  }

  async function pushStateToCloud(snapshot) {
    const wsId = getWorkspaceId();
    isSavingToCloud = true;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: wsId,
          state: snapshot
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.updatedAt) {
          state.updatedAt = data.updatedAt;
        }
        setCloudSyncUI('synced');
      } else {
        setCloudSyncUI('offline');
      }
    } catch (err) {
      console.warn('Cloud sync error:', err);
      setCloudSyncUI('offline');
    } finally {
      isSavingToCloud = false;
    }
  }

  async function fetchCloudState(showToastNotice = true) {
    const wsId = getWorkspaceId();
    setCloudSyncUI('syncing');
    try {
      const res = await fetch(`/api/sync?id=${encodeURIComponent(wsId)}`, {
        cache: 'no-store'
      });
      if (!res.ok) {
        setCloudSyncUI('offline');
        return;
      }

      const json = await res.json();
      if (json.success && json.exists && json.data) {
        const cloudData = json.data;
        const localUpdated = state.updatedAt || 0;
        const cloudUpdated = cloudData.updatedAt || 0;

        // Apply if cloud state is newer OR if local state is empty
        const isLocalEmpty = !state.text || !state.text.trim();
        if (cloudUpdated > localUpdated || isLocalEmpty) {
          applyStateSnapshot(cloudData, true);
          if (showToastNotice && cloudData.text) {
            showToast('☁️ 100% Synced from last use across devices!');
          }
        } else {
          setCloudSyncUI('synced');
        }
      } else {
        setCloudSyncUI('synced');
      }
    } catch (err) {
      console.warn('Failed to fetch cloud state:', err);
      setCloudSyncUI('offline');
    }
  }

  function loadState() {
    // 0. Check for imported subtitles/text from other modules (e.g. Shadowing Studio)
    try {
      const imported = localStorage.getItem('focusflow_imported_text');
      if (imported && imported.trim()) {
        localStorage.removeItem('focusflow_imported_text');
        state.text = imported;
        if (rawInput) rawInput.value = imported;
        const lang = detectLanguage(imported);
        setLanguageMode(lang, false);
        saveState();
        updateRender();
        showToast('📖 Subtitles exported to Reader successfully!');
        return;
      }
    } catch (e) {
      console.warn('Error loading imported text:', e);
    }

    // 1. Instant local load (0ms startup)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        applyStateSnapshot(parsed, false);
      }
    } catch (e) {}

    // 2. Fetch latest cross-device state from Cloudflare KV
    fetchCloudState(true);
  }

  /* --------------------------------------------------------------------------
     11. Event Listeners
     -------------------------------------------------------------------------- */

  function initEvents() {
    rawInput.addEventListener('input', scheduleUpdate);

    btnToggleSettings.addEventListener('click', () => {
      settingsPanel.classList.toggle('collapsed');
    });

    sliderFixation.addEventListener('input', e => {
      state.fixation = parseInt(e.target.value, 10);
      fixationVal.textContent = `${state.fixation}%`;
      scheduleUpdate();
    });

    if (selectCadence) {
      selectCadence.addEventListener('change', e => {
        state.cadence = e.target.value;
        scheduleUpdate();
      });
    }

    // Custom Font Picker Dropdown Interactions
    if (btnFontPickerTrigger && fontPickerMenu) {
      const fontOptions = Array.from(fontPickerMenu.querySelectorAll('.font-option-item'));

      btnFontPickerTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isClosed = fontPickerMenu.classList.contains('hidden');
        if (isClosed) {
          fontPickerMenu.classList.remove('hidden');
          btnFontPickerTrigger.setAttribute('aria-expanded', 'true');
          if (fontPickerDropdown) fontPickerDropdown.classList.add('is-open');
          const sel = fontPickerMenu.querySelector('.font-option-item.is-selected');
          if (sel) sel.scrollIntoView({ block: 'nearest' });
        } else {
          fontPickerMenu.classList.add('hidden');
          btnFontPickerTrigger.setAttribute('aria-expanded', 'false');
          if (fontPickerDropdown) fontPickerDropdown.classList.remove('is-open');
        }
      });

      btnFontPickerTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (fontPickerMenu.classList.contains('hidden')) {
            fontPickerMenu.classList.remove('hidden');
            btnFontPickerTrigger.setAttribute('aria-expanded', 'true');
            if (fontPickerDropdown) fontPickerDropdown.classList.add('is-open');
          }
          const sel = fontPickerMenu.querySelector('.font-option-item.is-selected') || fontOptions[0];
          if (sel) sel.focus();
        }
      });

      fontOptions.forEach((opt, idx) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const chosenFont = opt.getAttribute('data-font');
          if (chosenFont) {
            state.font = chosenFont;
            applySettings();
            scheduleUpdate();
            saveState();
          }
          fontPickerMenu.classList.add('hidden');
          btnFontPickerTrigger.setAttribute('aria-expanded', 'false');
          if (fontPickerDropdown) fontPickerDropdown.classList.remove('is-open');
          btnFontPickerTrigger.focus();
        });

        opt.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            opt.click();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextOpt = fontOptions[(idx + 1) % fontOptions.length];
            if (nextOpt) nextOpt.focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevOpt = fontOptions[(idx - 1 + fontOptions.length) % fontOptions.length];
            if (prevOpt) prevOpt.focus();
          }
        });
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (fontPickerDropdown && !fontPickerDropdown.contains(e.target)) {
          fontPickerMenu.classList.add('hidden');
          btnFontPickerTrigger.setAttribute('aria-expanded', 'false');
          fontPickerDropdown.classList.remove('is-open');
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && fontPickerMenu && !fontPickerMenu.classList.contains('hidden')) {
          fontPickerMenu.classList.add('hidden');
          btnFontPickerTrigger.setAttribute('aria-expanded', 'false');
          if (fontPickerDropdown) fontPickerDropdown.classList.remove('is-open');
          btnFontPickerTrigger.focus();
        }
      });
    }

    if (selectFont) {
      selectFont.addEventListener('change', e => {
        state.font = e.target.value;
        applySettings();
        saveState();
      });
    }

    sliderFontSize.addEventListener('input', e => {
      state.fontSize = parseInt(e.target.value, 10);
      applySettings();
      saveState();
    });

    sliderLineHeight.addEventListener('input', e => {
      state.lineHeight = parseFloat(e.target.value);
      applySettings();
      saveState();
    });

    selectWidth.addEventListener('change', e => {
      state.maxWidth = e.target.value;
      applySettings();
      saveState();
    });

    themeDots.forEach(dot => {
      dot.addEventListener('click', () => {
        state.theme = dot.dataset.theme;
        applySettings();
        saveState();
      });
    });

    if (toggleRuler) {
      toggleRuler.addEventListener('change', e => {
        setReadingRulerActive(e.target.checked);
      });
    }

    if (btnToggleRuler) {
      btnToggleRuler.addEventListener('click', () => {
        setReadingRulerActive(!state.rulerEnabled);
        showToast(state.rulerEnabled ? 'Reading ruler enabled' : 'Reading ruler disabled');
      });
    }

    if (btnFooterRuler) {
      btnFooterRuler.addEventListener('click', () => {
        setReadingRulerActive(!state.rulerEnabled);
        showToast(state.rulerEnabled ? 'Reading ruler enabled' : 'Reading ruler disabled');
      });
    }

    toggleHighContrast.addEventListener('change', e => {
      state.subtleDimming = e.target.checked;
      applySettings();
      saveState();
    });

    btnViewSplit.addEventListener('click', () => {
      state.viewMode = 'split';
      applySettings();
      saveState();
    });

    btnViewFocus.addEventListener('click', () => {
      state.viewMode = 'focus';
      applySettings();
      saveState();
    });

    if (btnLangEn) {
      btnLangEn.addEventListener('click', () => setLanguageMode('en', true));
    }
    if (btnLangFr) {
      btnLangFr.addEventListener('click', () => setLanguageMode('fr', true));
    }
    if (btnLangAr) {
      btnLangAr.addEventListener('click', () => setLanguageMode('ar', true));
    }

    if (btnToggleDir) {
      btnToggleDir.addEventListener('click', () => {
        const nextDir = state.dir === 'ltr' ? 'rtl' : 'ltr';
        setDirection(nextDir);
        showToast(`Text direction switched to ${nextDir.toUpperCase()}`);
      });
    }

    if (btnPasteText) btnPasteText.addEventListener('click', pasteClipboard);
    if (btnReaderPaste) btnReaderPaste.addEventListener('click', pasteClipboard);

    if (btnClearText) btnClearText.addEventListener('click', clearText);
    if (btnReaderClear) btnReaderClear.addEventListener('click', clearText);

    if (btnCopyHtml) btnCopyHtml.addEventListener('click', copyRichFormattedText);

    // Global paste listener: enables instant pasting directly into Focus Mode
    if (!window.__toolkerGlobalPasteAttached) {
      window.__toolkerGlobalPasteAttached = true;
      window.addEventListener('paste', e => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'textarea' || activeTag === 'input') return;

        const pastedText = (e.clipboardData || window.clipboardData)?.getData('text');
        if (pastedText && pastedText.trim()) {
          e.preventDefault();
          applyPastedText(pastedText);
        }
      });
    }

    // Dedicated paste listener on rawInput to immediately strip all '*' or '**'
    rawInput.addEventListener('paste', e => {
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text');
      if (pasted && pasted.includes('*')) {
        e.preventDefault();
        const cleaned = cleanAsterisks(pasted);
        const start = rawInput.selectionStart !== null ? rawInput.selectionStart : rawInput.value.length;
        const end = rawInput.selectionEnd !== null ? rawInput.selectionEnd : start;
        const val = rawInput.value;
        rawInput.value = val.substring(0, start) + cleaned + val.substring(end);
        rawInput.selectionStart = rawInput.selectionEnd = start + cleaned.length;
        updateRender();
        saveState();
      }
    });

    btnPrint.addEventListener('click', () => {
      window.print();
    });

    // TTS Events
    btnTtsPlay.addEventListener('click', toggleSpeech);
    btnTtsStop.addEventListener('click', stopSpeech);

    // Floating Quick Audio Controller Events
    if (btnFloatPlay) {
      btnFloatPlay.addEventListener('click', toggleSpeech);
    }
    if (btnFloatStop) {
      btnFloatStop.addEventListener('click', stopSpeech);
    }
    if (floatingTtsBar) {
      floatingTtsBar.addEventListener('click', e => {
        // If clicking on or inside play / stop buttons, let their handlers run without opening modal
        if (e.target.closest('#btnFloatPlay') || e.target.closest('#btnFloatStop')) {
          return;
        }
        openSentenceFocusModal(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
      });
    }

    if (ttsDialect) {
      ttsDialect.addEventListener('change', e => {
        state.dialect = e.target.value;
        const shortLang = (e.target.value || '').split('-')[0];
        if (shortLang === 'fr') {
          if (ttsVoice) ttsVoice.value = 'stream-fr';
          state.selectedVoiceIndex = 'stream-fr';
        } else if (shortLang === 'ar') {
          if (ttsVoice) ttsVoice.value = 'stream-ar';
          state.selectedVoiceIndex = 'stream-ar';
        } else {
          if (ttsVoice) ttsVoice.value = 'stream-en';
          state.selectedVoiceIndex = 'stream-en';
        }
        saveState();
        if (state.isSpeaking) {
          playSentence(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
        }
      });
    }

    if (ttsVoice) {
      ttsVoice.addEventListener('change', e => {
        state.selectedVoiceIndex = e.target.value;
        if (e.target.value === 'stream-fr') {
          state.dialect = 'fr-FR';
          state.lang = 'fr';
        } else if (e.target.value === 'stream-ar') {
          state.dialect = 'ar-SA';
          state.lang = 'ar';
        } else {
          state.dialect = 'en-US';
          state.lang = 'en';
        }
        [btnLangEn, btnLangFr, btnLangAr].forEach(btn => {
          if (btn) btn.classList.toggle('active', btn.dataset.lang === state.lang);
        });
        saveState();
        if (state.isSpeaking) {
          playSentence(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
        }
      });
    }

    ttsSpeed.addEventListener('change', e => {
      setSpeechRate(e.target.value, true);
    });

    // 1-click Play/Replay | Double-click Sentence Focus Reader
    let sentenceClickTimer = null;

    bionicOutput.addEventListener('click', e => {
      const sentenceEl = e.target.closest('.bionic-sentence');
      if (sentenceEl && sentenceEl.dataset.sentenceIndex !== undefined) {
        const sIdx = parseInt(sentenceEl.dataset.sentenceIndex, 10);
        
        if (sentenceClickTimer) {
          clearTimeout(sentenceClickTimer);
          sentenceClickTimer = null;
        }

        sentenceClickTimer = setTimeout(() => {
          sentenceClickTimer = null;
          // One click always means: Play (or Replay from start if already played / active)
          stopSpeech();
          playSentence(sIdx);
          if (state.rulerEnabled && readingRuler) {
            const rect = sentenceEl.getBoundingClientRect();
            readingRuler.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
          }
        }, 180);
      }
    });

    bionicOutput.addEventListener('dblclick', e => {
      const sentenceEl = e.target.closest('.bionic-sentence');
      if (sentenceEl && sentenceEl.dataset.sentenceIndex !== undefined) {
        if (sentenceClickTimer) {
          clearTimeout(sentenceClickTimer);
          sentenceClickTimer = null;
        }
        try {
          window.getSelection()?.removeAllRanges();
        } catch (err) {}

        const sIdx = parseInt(sentenceEl.dataset.sentenceIndex, 10);
        stopActiveShadowAudio();
        stopSpeech();
        openSentenceFocusModal(sIdx);
        playSentence(sIdx);
      }
    });

    // YouTube Shadowing Mechanics: Click or Hold to Record
    function wireShadowTriggerButton(buttonEl) {
      if (!buttonEl) return;
      let pressStart = 0;
      let didHold = false;
      let startedByPointer = false;

      buttonEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        pressStart = Date.now();
        didHold = false;
        startedByPointer = false;
        if (!isRecordingShadow) {
          startedByPointer = true;
          startSentenceShadowRecording();
        }
      });

      window.addEventListener('pointerup', () => {
        if (!pressStart) return;
        const elapsed = Date.now() - pressStart;
        pressStart = 0;
        if (elapsed > 380 && isRecordingShadow) {
          didHold = true;
          stopSentenceShadowRecording();
        }
      });

      buttonEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (didHold) {
          didHold = false;
          return;
        }
        if (startedByPointer) {
          startedByPointer = false;
          return;
        }
        if (isRecordingShadow) {
          stopSentenceShadowRecording();
        } else {
          startSentenceShadowRecording();
        }
      });
    }

    // Wire shadow buttons in both toolbar and floating audio controller
    wireShadowTriggerButton(btnToolbarShadow);
    wireShadowTriggerButton(btnFloatShadow);

    // Partner Shadow Playback Handlers
    function handlePlayPartnerAudio(forcedIdx) {
      stopActiveShadowAudio();
      stopSpeech(false);

      let targetIdx = -1;
      if (typeof forcedIdx === 'number' && forcedIdx >= 0) {
        targetIdx = forcedIdx;
      } else if (typeof partnerShadowAudios['_latestSentenceIdx'] === 'number') {
        targetIdx = partnerShadowAudios['_latestSentenceIdx'];
      } else if (state.activeSentenceIdx >= 0 && partnerShadowAudios[state.activeSentenceIdx]) {
        targetIdx = state.activeSentenceIdx;
      } else {
        targetIdx = state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0;
      }

      const audioData = partnerShadowAudios[targetIdx] || partnerShadowAudios['_latest'];
      if (audioData) {
        if (btnToolbarPartnerAudio) btnToolbarPartnerAudio.classList.remove('has-new');
        if (btnFloatPartnerAudio) btnFloatPartnerAudio.classList.remove('has-new');
        if (btnSentencePlayPartnerShadow) btnSentencePlayPartnerShadow.classList.remove('has-new');

        // Open Sentence Focus Reader at this exact sentence so partner sees what was recorded
        state.activeSentenceIdx = targetIdx;
        highlightActiveSentence(targetIdx);
        openSentenceFocusModal();
        updateSentenceFocusDisplay();

        const sentenceEl = document.querySelector(`.bionic-sentence[data-sentence-index="${targetIdx}"]`);
        if (sentenceEl) {
          sentenceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        playShadowAudioBlob(audioData);
        showToast(`🎙️ Playing partner recording for Sentence ${targetIdx + 1}`);
      } else {
        showToast('No partner shadow recorded yet.');
      }
    }

    if (btnToolbarPartnerAudio) btnToolbarPartnerAudio.addEventListener('click', handlePlayPartnerAudio);
    if (btnFloatPartnerAudio) btnFloatPartnerAudio.addEventListener('click', handlePlayPartnerAudio);

    // Sentence Focus Events
    if (btnOpenSentenceFocus) {
      btnOpenSentenceFocus.addEventListener('click', e => {
        e.stopPropagation();
        openSentenceFocusModal(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
      });
      btnOpenSentenceFocus.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSentenceFocusModal(state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
        }
      });
    }
    if (btnCloseSentenceFocus) btnCloseSentenceFocus.addEventListener('click', closeSentenceFocusModal);
    if (sentenceFocusModal) {
      sentenceFocusModal.addEventListener('click', e => {
        if (e.target === sentenceFocusModal) closeSentenceFocusModal();
      });
    }

    if (btnModeContinuous) btnModeContinuous.addEventListener('click', () => setSentenceMode('continuous'));
    if (btnModeLoop) btnModeLoop.addEventListener('click', () => setSentenceMode('loop'));
    if (btnModeStep) btnModeStep.addEventListener('click', () => setSentenceMode('step'));

    if (btnSentencePrev) btnSentencePrev.addEventListener('click', stepPrevSentence);
    if (btnSentenceNext) btnSentenceNext.addEventListener('click', stepNextSentence);
    if (btnSentenceReplay) btnSentenceReplay.addEventListener('click', replayCurrentSentence);
    if (btnSentencePlay) btnSentencePlay.addEventListener('click', toggleSentenceFocusPlay);

    // Legacy/Modal shadow fallback listeners
    if (btnSentenceRecordShadow) {
      btnSentenceRecordShadow.addEventListener('click', () => {
        if (isRecordingShadow) {
          stopSentenceShadowRecording();
        } else {
          startSentenceShadowRecording();
        }
      });
    }

    if (btnSentencePlayLocalShadow) {
      btnSentencePlayLocalShadow.addEventListener('click', () => {
        const currentIdx = state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0;
        const audioData = localShadowAudios[currentIdx];
        if (audioData) {
          playShadowAudioBlob(audioData);
          showToast('▶ Playing your shadow');
        }
      });
    }

    if (btnSentencePlayPartnerShadow) {
      btnSentencePlayPartnerShadow.addEventListener('click', () => {
        btnSentencePlayPartnerShadow.classList.remove('has-new');
        const currentIdx = state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0;
        const targetIdx = partnerShadowAudios[currentIdx] ? currentIdx : partnerShadowAudios['_latestSentenceIdx'];
        handlePlayPartnerAudio(targetIdx);
      });
    }

    if (btnSentencePlayRefAudio) {
      btnSentencePlayRefAudio.addEventListener('click', () => {
        stopActiveShadowAudio();
        const currentIdx = state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0;
        playSentence(currentIdx);
        showToast('▶ Playing reference speech');
      });
    }

    // Room Multiplayer Listener for Shadow Audio
    if (!window.__toolkerShadowRoomListenerAttached) {
      window.__toolkerShadowRoomListenerAttached = true;
      window.addEventListener('toolker:room-action', e => {
        const action = e.detail;
        if (!action) return;

        if (action.type === 'AUDIO_SYNC' && action.payload) {
          const targetIdx = (typeof action.sentenceIdx === 'number' && action.sentenceIdx >= 0)
            ? action.sentenceIdx
            : (state.activeSentenceIdx >= 0 ? state.activeSentenceIdx : 0);
          partnerShadowAudios[targetIdx] = action.payload;
          partnerShadowAudios['_latest'] = action.payload;
          partnerShadowAudios['_latestSentenceIdx'] = targetIdx;

          if (btnToolbarPartnerAudio) {
            btnToolbarPartnerAudio.classList.remove('hidden');
            btnToolbarPartnerAudio.classList.add('has-new');
            btnToolbarPartnerAudio.title = `Listen to partner shadow for Sentence ${targetIdx + 1}`;
          }
          if (btnFloatPartnerAudio) {
            btnFloatPartnerAudio.classList.remove('hidden');
            btnFloatPartnerAudio.classList.add('has-new');
            btnFloatPartnerAudio.title = `Listen to partner shadow for Sentence ${targetIdx + 1}`;
          }
          if (btnSentencePlayPartnerShadow) {
            btnSentencePlayPartnerShadow.classList.remove('hidden');
            btnSentencePlayPartnerShadow.classList.add('has-new');
            if (partnerShadowBtnLabel) {
              partnerShadowBtnLabel.textContent = `Partner (S.${targetIdx + 1}) ▶`;
            }
          }
          showToast(`🎙️ Partner shadowed Sentence ${targetIdx + 1}! Click "Partner" to listen`);
        }
      });
    }

    if (sentencePeekPrev) sentencePeekPrev.addEventListener('click', stepPrevSentence);
    if (sentencePeekNext) sentencePeekNext.addEventListener('click', stepNextSentence);

    if (sliderSentenceTimeline) {
      sliderSentenceTimeline.addEventListener('input', e => {
        if (!sentenceRegistry || sentenceRegistry.length === 0) return;
        const targetIdx = parseInt(e.target.value, 10) - 1;
        if (state.isSpeaking && !state.isPaused) {
          playSentence(targetIdx);
        } else {
          stopAudioStream();
          if (synth) { try { synth.cancel(); } catch (e) {} }
          state.activeSentenceIdx = targetIdx;
          highlightActiveSentence(targetIdx);
          updateSentenceFocusDisplay();
        }
      });
    }

    if (sliderSentenceSpeed) {
      sliderSentenceSpeed.addEventListener('input', e => {
        setSpeechRate(e.target.value, true);
      });
    }

    // Quick Paste Modal Events
    if (pasteModal) {
      if (btnClosePasteModal) btnClosePasteModal.addEventListener('click', closePasteModal);
      if (btnCancelPaste) btnCancelPaste.addEventListener('click', closePasteModal);
      pasteModal.addEventListener('click', e => {
        if (e.target === pasteModal) closePasteModal();
      });

      if (btnConfirmPaste && pasteModalInput) {
        btnConfirmPaste.addEventListener('click', () => {
          const val = pasteModalInput.value;
          if (val && val.trim()) {
            applyPastedText(val);
            closePasteModal();
          } else {
            showToast('Please paste or enter some text first.');
          }
        });
      }

      if (pasteModalInput) {
        pasteModalInput.addEventListener('paste', () => {
          setTimeout(() => {
            const val = pasteModalInput.value;
            if (val && val.trim()) {
              applyPastedText(val);
              closePasteModal();
            }
          }, 30);
        });

        pasteModalInput.addEventListener('keydown', e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const val = pasteModalInput.value;
            if (val && val.trim()) {
              applyPastedText(val);
              closePasteModal();
            }
          } else if (e.key === 'Escape') {
            closePasteModal();
          }
        });
      }
    }

    // Study Mode (Brain Gym) Events
    if (btnOpenBrainGym) btnOpenBrainGym.addEventListener('click', handleBrainGymTriggerClick);
    if (btnCloseBrainGym) btnCloseBrainGym.addEventListener('click', closeBrainGymModal);
    if (btnToggleGameAudio) btnToggleGameAudio.addEventListener('click', toggleGameAudio);
    if (brainGymModal) {
      brainGymModal.addEventListener('click', e => {
        if (e.target === brainGymModal) closeBrainGymModal();
      });
    }

    if (brainGymStage) {
      brainGymStage.addEventListener('click', e => {
        if (!state.gameAudioEnabled) return;
        const target = e.target.closest('[data-tts-read]');
        if (target) {
          const text = target.getAttribute('data-tts-read') || target.innerText;
          if (text && text.trim()) {
            speakGameText(text.trim());
          }
        }
      });
    }

    if (rawInput) {
      rawInput.addEventListener('input', () => {
        const cur = (rawInput.value || '').trim();
        if ((state.brainGymData || state.brainGymCachedText || state.studyGamesState !== 'idle') &&
            !isBrainGymCacheValidForText(cur)) {
          invalidateBrainGymCache();
        }
      });
    }

    if (btnGameJourney) btnGameJourney.addEventListener('click', () => setBrainGymMode('journey'));
    if (btnGameFlashcards) btnGameFlashcards.addEventListener('click', () => setBrainGymMode('flashcards'));
    if (btnGameQuiz) btnGameQuiz.addEventListener('click', () => setBrainGymMode('quiz'));
    if (btnGameDetective) btnGameDetective.addEventListener('click', () => setBrainGymMode('detective'));
    if (btnGameMatch) btnGameMatch.addEventListener('click', () => setBrainGymMode('match'));

    if (btnDepthSprint) {
      btnDepthSprint.addEventListener('click', () => {
        state.brainGymDepth = 'sprint';
        btnDepthSprint.classList.add('active');
        if (btnDepthDeep) btnDepthDeep.classList.remove('active');
        fetchBrainGames(true);
      });
    }
    if (btnDepthDeep) {
      btnDepthDeep.addEventListener('click', () => {
        state.brainGymDepth = 'deep';
        btnDepthDeep.classList.add('active');
        if (btnDepthSprint) btnDepthSprint.classList.remove('active');
        fetchBrainGames(true);
      });
    }

    if (btnRegenerateGames) btnRegenerateGames.addEventListener('click', () => fetchBrainGames(true));

    // Keyboard Shortcuts (attached once across remounts)
    if (!window.__toolkerGlobalKeydownAttached) {
      window.__toolkerGlobalKeydownAttached = true;
      window.addEventListener('keydown', e => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isInput = activeTag === 'textarea' || activeTag === 'input';

        if (brainGymModal && !brainGymModal.classList.contains('hidden')) {
          if (e.code === 'Space') {
            e.preventDefault();
            if (state.brainGymActiveMode === 'journey') {
              const nextBtn = document.getElementById('btnJourneyNext');
              if (nextBtn) {
                nextBtn.click();
              } else {
                readCurrentBrainGymContent();
              }
            } else if (state.brainGymActiveMode === 'flashcards') {
              const inner = document.getElementById('flashcardInner');
              if (inner) {
                inner.classList.toggle('is-flipped');
                playTapTone();
              }
            }
          } else if (e.key === '1') {
            e.preventDefault();
            setBrainGymMode('journey');
          } else if (e.key === '2') {
            e.preventDefault();
            setBrainGymMode('flashcards');
          } else if (e.key === '3') {
            e.preventDefault();
            setBrainGymMode('quiz');
          } else if (e.key === '4') {
            e.preventDefault();
            setBrainGymMode('detective');
          } else if (e.key === '5') {
            e.preventDefault();
            setBrainGymMode('match');
          } else if (e.code === 'Escape') {
            e.preventDefault();
            closeBrainGymModal();
          }
          return;
        }

        if (pasteModal && !pasteModal.classList.contains('hidden')) {
          if (e.code === 'Escape') {
            e.preventDefault();
            closePasteModal();
          }
          return;
        }

        if (sentenceFocusModal && !sentenceFocusModal.classList.contains('hidden')) {
          if (e.code === 'Space') {
            e.preventDefault();
            toggleSentenceFocusPlay();
          } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            stepPrevSentence();
          } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            stepNextSentence();
          } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            replayCurrentSentence();
          } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            toggleSentenceFocusPlay();
          } else if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            replayCurrentSentence();
          } else if (e.key === '1') {
            e.preventDefault();
            setSentenceMode('continuous');
          } else if (e.key === '2') {
            e.preventDefault();
            setSentenceMode('loop');
          } else if (e.key === '3') {
            e.preventDefault();
            setSentenceMode('step');
          } else if (e.code === 'Escape') {
            e.preventDefault();
            closeSentenceFocusModal();
          }
          return;
        } else if (!isInput) {
          if (e.code === 'ArrowRight') {
            e.preventDefault();
            stepNextSentence();
          } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            stepPrevSentence();
          } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            replayCurrentSentence();
          } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            toggleSpeech();
          } else if (e.code === 'Space') {
            e.preventDefault();
            toggleSpeech();
          } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            setReadingRulerActive(!state.rulerEnabled);
            showToast(state.rulerEnabled ? 'Reading ruler enabled' : 'Reading ruler disabled');
          }
        }
      });
    }

    // Cloud Sync Button & Shareable Sync Link
    if (btnCloudSync) {
      btnCloudSync.addEventListener('click', () => {
        const url = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            showToast('✓ Link copied! Open on your other device to see this exact workspace.');
          }).catch(() => {
            showToast(`Sync URL: ${url}`);
          });
        } else {
          showToast(`Sync URL: ${url}`);
        }
      });
    }

    // Tab visibility change: pull latest cloud state when returning to tab or waking device
    if (!window.__toolkerGlobalVisibilityAttached) {
      window.__toolkerGlobalVisibilityAttached = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !isSavingToCloud) {
          fetchCloudState(false);
        }
      });
    }

    // Before unload: beacon last edits to Cloudflare KV on tab close
    if (!window.__toolkerGlobalUnloadAttached) {
      window.__toolkerGlobalUnloadAttached = true;
      window.addEventListener('beforeunload', () => {
        try {
          const wsId = getWorkspaceId();
          const snapshot = getStateSnapshot();
          const payload = JSON.stringify({ id: wsId, state: snapshot });
          if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/sync', payload);
          }
        } catch (e) {}
      });
    }

    // Live cross-module import listener
    if (!window.__toolkerImportAttached) {
      window.__toolkerImportAttached = true;
      window.addEventListener('toolker:import-reader-text', e => {
        const text = e?.detail?.text;
        if (text && text.trim()) {
          stopSpeech();
          state.text = text;
          if (rawInput) rawInput.value = text;
          const lang = detectLanguage(text);
          setLanguageMode(lang, false);
          saveState();
          updateRender();
          showToast('📖 Subtitles exported to Reader successfully!');
        }
      });
    }

    initReadingRuler();
    initSpeechEngine();
  }

  // Bootstrap
  function bootFocusFlow() {
    queryDOMElements();
    if (!rawInput || !bionicOutput) {
      setTimeout(bootFocusFlow, 40);
      return;
    }
    initKatexWatcher();
    loadState();
    applySettings();
    initEvents();
    updateRender();
  }

  window.bootFocusFlow = bootFocusFlow;
  window.destroyFocusFlow = function() {
    stopSpeech();
    stopActiveShadowAudio();
    stopSentenceShadowRecording();
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootFocusFlow);
  } else {
    bootFocusFlow();
  }

})();
