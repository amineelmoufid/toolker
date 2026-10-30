import sys
import os
import json
import glob
import subprocess
import re

def interpolate_words(text, start, end):
    words = [w for w in text.split() if w]
    if not words:
        return []
    duration = max(0.2, end - start)
    time_per_word = duration / len(words)
    result = []
    curr_start = start
    for w in words:
        w_end = round(curr_start + time_per_word, 2)
        result.append({
            "text": w,
            "start": round(curr_start, 2),
            "end": w_end
        })
        curr_start = w_end
    return result

COMMON_ABBREVIATIONS = {
    'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.',
    'approx.', 'apt.', 'dept.', 'est.', 'u.s.', 'u.k.', 'e.g.', 'i.e.'
}

def build_sentences_from_words(raw_words):
    if not raw_words:
        return []

    clean_words = []
    prev_text = ""
    prev_start = -1

    for w in raw_words:
        t = str(w.get('text', '')).strip()
        t = re.sub(r'^[>\s]+', '', t)
        if re.match(r'^\[.*?\]$', t) or re.match(r'^\(.*?\)$', t):
            continue
        t = t.replace('♪', '').replace('♫', '').strip()
        if not t:
            continue

        w_clean = re.sub(r'[^\w]', '', t).lower()
        p_clean = re.sub(r'[^\w]', '', prev_text).lower()
        if w_clean and w_clean == p_clean and abs(w.get('start', 0) - prev_start) < 0.6:
            continue

        clean_words.append({
            "text": t,
            "start": round(float(w.get('start', 0)), 2),
            "end": round(float(w.get('end', 0)), 2)
        })
        prev_text = t
        prev_start = float(w.get('start', 0))

    if not clean_words:
        return []

    sentences = []
    curr = []

    for i, w in enumerate(clean_words):
        curr.append(w)
        txt = w['text']
        is_last = (i == len(clean_words) - 1)

        ends_punct = bool(re.search(r'[.?!][\"\'”’]?$', txt)) and (txt.lower() not in COMMON_ABBREVIATIONS)
        is_pause = False
        if i < len(clean_words) - 1:
            gap = clean_words[i + 1]['start'] - w['end']
            if gap >= 1.5 and len(curr) >= 8:
                is_pause = True

        is_runaway = len(curr) >= 35
        should_break = is_last or ends_punct or is_pause or is_runaway

        if should_break and curr:
            # Monotonize word timestamps ONLY within this individual sentence to avoid global drift
            for j in range(1, len(curr)):
                if curr[j]['start'] < curr[j - 1]['start']:
                    curr[j]['start'] = curr[j - 1]['end']
                if curr[j]['end'] <= curr[j]['start']:
                    curr[j]['end'] = round(curr[j]['start'] + 0.25, 2)

            s_text = " ".join(item['text'] for item in curr).strip()
            if s_text:
                s_text = s_text[0].upper() + s_text[1:]
                curr[0]['text'] = curr[0]['text'][0].upper() + curr[0]['text'][1:]

            if not re.search(r'[.?!][\"\'”’]?$', s_text):
                s_text = re.sub(r'[,;:-]$', '', s_text) + '.'
                curr[-1]['text'] = re.sub(r'[,;:-]$', '', curr[-1]['text']) + '.'

            s_start = curr[0]['start']
            s_end = max(curr[-1]['end'], round(s_start + 0.5, 2))

            sentences.append({
                "id": f"cue-{len(sentences) + 1}",
                "start": s_start,
                "end": s_end,
                "text": s_text,
                "words": list(curr)
            })
            curr = []

    for i in range(len(sentences) - 1):
        if sentences[i]['end'] > sentences[i + 1]['start']:
            sentences[i]['end'] = sentences[i + 1]['start']
        if sentences[i]['end'] <= sentences[i]['start']:
            sentences[i]['end'] = round(sentences[i]['start'] + 0.5, 2)

    return sentences

def assemble_semantic_sentences(raw_snippets):
    raw_words = []
    for s in raw_snippets:
        if isinstance(s, dict):
            raw_text = s.get('text', '')
            raw_start = float(s.get('start', 0))
            raw_dur = float(s.get('duration', 0))
        else:
            raw_text = getattr(s, 'text', '')
            raw_start = float(getattr(s, 'start', 0))
            raw_dur = float(getattr(s, 'duration', 0))

        text = raw_text.replace('\n', ' ').strip()
        if not text or (text.startswith('[') and text.endswith(']')):
            continue

        start = round(raw_start, 2)
        end = round(raw_start + raw_dur, 2)
        words = interpolate_words(text, start, end)
        raw_words.extend(words)

    return build_sentences_from_words(raw_words)

def select_best_track(t_list, preferred_lang=None):
    tracks = list(t_list)
    if not tracks:
        return None

    if preferred_lang:
        p_code = preferred_lang.lower().split('-')[0]
        for t in tracks:
            if not t.is_generated and t.language_code.lower().startswith(p_code):
                return t
        for t in tracks:
            if t.is_generated and t.language_code.lower().startswith(p_code):
                return t

    for code in ['en', 'fr']:
        for t in tracks:
            if not t.is_generated and t.language_code.lower().startswith(code):
                return t

    for code in ['en', 'fr']:
        for t in tracks:
            if t.is_generated and t.language_code.lower().startswith(code):
                return t

    for t in tracks:
        if not t.is_generated:
            return t

    return tracks[0]

def extract_with_ytdlp(vid, preferred_lang=None):
    print(f"--> [Fallback Engine] Extracting via yt-dlp native timedtext for {vid}...")
    out_prefix = f"temp_sub_{vid}"
    sub_lang_arg = f"{preferred_lang}.*,en.*,fr.*" if preferred_lang else "en.*,fr.*,.*"
    cmd = [
        "yt-dlp",
        "--skip-download",
        "--write-auto-sub",
        "--write-subs",
        "--sub-langs", sub_lang_arg,
        "--sub-format", "json3",
        "-o", f"{out_prefix}.%(ext)s",
        f"https://www.youtube.com/watch?v={vid}"
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    except Exception as e:
        print(f"yt-dlp subprocess error: {e}")
        return None, None

    files = glob.glob(f"{out_prefix}*.json3")
    if not files:
        print(f"yt-dlp produced no json3 files. stderr: {res.stderr[:200]}")
        return None, None

    chosen_file = files[0]
    for f in files:
        if preferred_lang and preferred_lang in f:
            chosen_file = f
            break

    lang = "en"
    for part in chosen_file.split('.'):
        if len(part) == 2 or (len(part) == 5 and '-' in part):
            lang = part
            break

    try:
        with open(chosen_file, "r", encoding="utf-8") as jf:
            data = json.load(jf)
    finally:
        for f in files:
            try:
                os.remove(f)
            except Exception:
                pass

    events = data.get("events", [])
    raw_words = []
    for ev in events:
        tStart = ev.get("tStartMs", 0) / 1000.0
        segs = ev.get("segs", [])
        if not segs:
            continue
        for s in segs:
            w_text = s.get("utf8", "").replace('\n', ' ').strip()
            if not w_text or (w_text.startswith('[') and w_text.endswith(']')):
                continue
            offset = s.get("tOffsetMs", 0) / 1000.0
            w_start = round(tStart + offset, 2)
            raw_words.append({
                "text": w_text,
                "start": w_start,
                "end": round(w_start + 0.35, 2)
            })

    if not raw_words:
        return None, None

    for i in range(len(raw_words) - 1):
        raw_words[i]["end"] = min(raw_words[i]["start"] + 1.2, raw_words[i + 1]["start"])
        if raw_words[i]["end"] <= raw_words[i]["start"]:
            raw_words[i]["end"] = round(raw_words[i]["start"] + 0.25, 2)

    return build_sentences_from_words(raw_words), lang

def extract_video(vid, preferred_lang=None, output_dir="public/transcripts"):
    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, f"{vid}.json")
    
    if not preferred_lang:
        try:
            import urllib.request
            o_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"
            with urllib.request.urlopen(o_url, timeout=4) as r:
                t_data = json.loads(r.read().decode('utf-8'))
                v_title = t_data.get('title', '')
                if re.search(r'[éèêëàâôûùçîïœæ]|\b(pourquoi|comment|quand|dans|avec|pour|sens|mal|sans|raison|le|la|les|un|une|des|du|qui|que)\b', v_title, re.I):
                    preferred_lang = 'fr'
                elif re.search(r'[\u0600-\u06FF\u0750-\u077F]', v_title):
                    preferred_lang = 'ar'
                elif re.search(r'[áéíóúüñ¿¡]|\b(por qué|como|cuando|en|con|para|el|la|los|las|un|una|del)\b', v_title, re.I):
                    preferred_lang = 'es'
        except Exception:
            pass

    print(f"--> Extracting transcript for YouTube ID: {vid} (preferred: {preferred_lang})")
    sentences = None
    lang_code = preferred_lang or "en"
    track_kind = "standard"

    # Engine 1: YouTubeTranscriptApi
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        t_list = api.list(vid)
        selected = select_best_track(t_list, preferred_lang)
        if selected:
            print(f"Found track: {selected.language} ({selected.language_code}), generated: {selected.is_generated}")
            snippets = selected.fetch()
            sentences = assemble_semantic_sentences(snippets)
            lang_code = selected.language_code
            track_kind = "asr" if selected.is_generated else "standard"
    except Exception as e:
        print(f"YouTubeTranscriptApi notice: {e}")

    # Engine 2: yt-dlp fallback (bypasses cloud IP restrictions)
    if not sentences or len(sentences) == 0:
        ytdlp_sentences, detected_lang = extract_with_ytdlp(vid, preferred_lang)
        if ytdlp_sentences and len(ytdlp_sentences) > 0:
            sentences = ytdlp_sentences
            lang_code = detected_lang or lang_code
            track_kind = "timedtext_json3"

    if sentences and len(sentences) > 0:
        output_data = {
            "ok": True,
            "videoId": vid,
            "language": lang_code,
            "trackKind": track_kind,
            "subtitles": sentences
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"Successfully generated {out_file} with {len(sentences)} sentences.")
        return True
    else:
        print(f"Failed to extract subtitles for {vid}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_transcript.py <videoId> [preferredLang]")
        sys.exit(1)
        
    videoId = sys.argv[1].strip()
    pref_lang = sys.argv[2].strip() if len(sys.argv) > 2 else None
    success = extract_video(videoId, pref_lang)
    if not success:
        sys.exit(1)
