import sys
import os
import json
import glob
import subprocess

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

def assemble_semantic_sentences(raw_snippets):
    sentences = []
    curr_words = []
    
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
        curr_words.extend(words)
        
        # Break on natural boundaries or sensible length
        if len(curr_words) >= 6 or any(text.endswith(p) for p in ['.', '?', '!', ',', ';']):
            s_start = curr_words[0]["start"]
            s_end = curr_words[-1]["end"]
            s_text = " ".join(w["text"] for w in curr_words)
            sentences.append({
                "id": f"cue-{len(sentences) + 1}",
                "start": s_start,
                "end": s_end,
                "text": s_text,
                "words": curr_words
            })
            curr_words = []
            
    if curr_words:
        s_start = curr_words[0]["start"]
        s_end = curr_words[-1]["end"]
        s_text = " ".join(w["text"] for w in curr_words)
        sentences.append({
            "id": f"cue-{len(sentences) + 1}",
            "start": s_start,
            "end": s_end,
            "text": s_text,
            "words": curr_words
        })
        
    return sentences

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

    sentences = []
    curr = []
    for w in raw_words:
        curr.append(w)
        if len(curr) >= 6 or any(w["text"].endswith(p) for p in ['.', '?', '!', ',', ';']):
            s_text = " ".join(item["text"] for item in curr)
            sentences.append({
                "id": f"cue-{len(sentences) + 1}",
                "start": curr[0]["start"],
                "end": curr[-1]["end"],
                "text": s_text,
                "words": list(curr)
            })
            curr = []
    if curr:
        s_text = " ".join(item["text"] for item in curr)
        sentences.append({
            "id": f"cue-{len(sentences) + 1}",
            "start": curr[0]["start"],
            "end": curr[-1]["end"],
            "text": s_text,
            "words": list(curr)
        })

    return sentences, lang

def extract_video(vid, preferred_lang=None, output_dir="public/transcripts"):
    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, f"{vid}.json")
    
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
        err_data = {
            "ok": False,
            "videoId": vid,
            "error": "No subtitles could be extracted from YouTube.",
            "subtitles": []
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(err_data, f, ensure_ascii=False, indent=2)
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
