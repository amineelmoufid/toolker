import sys
import os
import json
from youtube_transcript_api import YouTubeTranscriptApi

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

    # If preferred language is provided (e.g. 'en', 'fr')
    if preferred_lang:
        p_code = preferred_lang.lower().split('-')[0]
        # 1. Manual in preferred
        for t in tracks:
            if not t.is_generated and t.language_code.lower().startswith(p_code):
                return t
        # 2. Generated in preferred
        for t in tracks:
            if t.is_generated and t.language_code.lower().startswith(p_code):
                return t

    # Priority 1: Manual English or French
    for code in ['en', 'fr']:
        for t in tracks:
            if not t.is_generated and t.language_code.lower().startswith(code):
                return t

    # Priority 2: Generated English or French
    for code in ['en', 'fr']:
        for t in tracks:
            if t.is_generated and t.language_code.lower().startswith(code):
                return t

    # Priority 3: Any manual track
    for t in tracks:
        if not t.is_generated:
            return t

    # Priority 4: First track available
    return tracks[0]

def extract_video(vid, preferred_lang=None, output_dir="public/transcripts"):
    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, f"{vid}.json")
    
    print(f"--> Extracting transcript for YouTube ID: {vid} (preferred: {preferred_lang})")
    
    try:
        api = YouTubeTranscriptApi()
        t_list = api.list(vid)
        
        selected = select_best_track(t_list, preferred_lang)
        if not selected:
            raise Exception("No transcript tracks found on YouTube.")
            
        print(f"Found track: {selected.language} ({selected.language_code}), generated: {selected.is_generated}")
        snippets = selected.fetch()
        sentences = assemble_semantic_sentences(snippets)
        
        output_data = {
            "ok": True,
            "videoId": vid,
            "language": selected.language_code,
            "trackKind": "asr" if selected.is_generated else "standard",
            "subtitles": sentences
        }
        
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        print(f"Successfully generated {out_file} with {len(sentences)} sentences.")
        return True
        
    except Exception as e:
        print(f"Extraction error for {vid}: {e}")
        err_data = {
            "ok": False,
            "videoId": vid,
            "error": str(e),
            "subtitles": []
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(err_data, f, ensure_ascii=False, indent=2)
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
