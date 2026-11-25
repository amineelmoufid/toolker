import sys
import os
import json
import glob
import subprocess
import re
import html
import urllib.request
import shutil

COMMON_ABBREVIATIONS = {
    'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.',
    'approx.', 'apt.', 'dept.', 'est.', 'u.s.', 'u.k.', 'e.g.', 'i.e.'
}

OFFICIAL_KEY = "".join(['AIza', 'SyAO', '_FJ2SlqU', '8Q4STEHL', 'GCilw_Y9', '_11qcW8'])
INNERTUBE_URL = f"https://www.youtube.com/youtubei/v1/player?key={OFFICIAL_KEY}"

def load_cookie_header(cookie_path="cookies.txt"):
    if not os.path.isfile(cookie_path):
        return None
    try:
        cookies = []
        with open(cookie_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) >= 7:
                    cookies.append(f"{parts[5]}={parts[6]}")
        if cookies:
            return "; ".join(cookies)
    except Exception:
        pass
    return None

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

def parse_timedtext_xml(xml_content):
    if not xml_content or not xml_content.strip().startswith('<'):
        return []
    
    all_words = []
    
    # 1. srv3 format: <p t="ms" d="ms"><s>word1</s><s t="ms">word2</s></p>
    p_pattern = re.compile(r'<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>')
    s_pattern = re.compile(r'<s(?:\s+t="(\d+)")?[^>]*>([\s\S]*?)<\/s>')
    
    for p_match in p_pattern.finditer(xml_content):
        p_start_ms = int(p_match.group(1))
        p_dur_ms = int(p_match.group(2)) if p_match.group(2) else 2500
        inner = p_match.group(3).strip()
        if not inner or (inner.startswith('[') and inner.endswith(']')):
            continue
            
        s_matches = list(s_pattern.finditer(inner))
        if s_matches:
            for sm in s_matches:
                s_offset_ms = int(sm.group(1)) if sm.group(1) else 0
                w_text = html.unescape(sm.group(2)).strip()
                if not w_text:
                    continue
                w_start = round((p_start_ms + s_offset_ms) / 1000.0, 2)
                all_words.append({
                    "text": w_text,
                    "start": w_start,
                    "end": round(w_start + 0.35, 2)
                })
        else:
            clean_text = html.unescape(re.sub(r'<[^>]+>', '', inner)).strip()
            if clean_text:
                raw_words = [w for w in clean_text.split() if w]
                w_dur = (p_dur_ms / 1000.0) / max(len(raw_words), 1)
                start_s = p_start_ms / 1000.0
                for idx, w in enumerate(raw_words):
                    w_s = round(start_s + idx * w_dur, 2)
                    all_words.append({
                        "text": w,
                        "start": w_s,
                        "end": round(start_s + (idx + 1) * w_dur, 2)
                    })
                    
    # 2. Classic format: <text start="s" dur="s">text</text>
    if not all_words:
        t_pattern = re.compile(r'<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>')
        for tm in t_pattern.finditer(xml_content):
            start = float(tm.group(1))
            dur = float(tm.group(2)) if tm.group(2) else 2.5
            text = html.unescape(re.sub(r'<[^>]+>', '', tm.group(3))).strip()
            if not text or (text.startswith('[') and text.endswith(']')):
                continue
            words = [w for w in text.split() if w]
            w_dur = dur / max(len(words), 1)
            for idx, w in enumerate(words):
                w_s = round(start + idx * w_dur, 2)
                all_words.append({
                    "text": w,
                    "start": w_s,
                    "end": round(start + (idx + 1) * w_dur, 2)
                })
                
    # Normalize consecutive word ends
    for i in range(len(all_words) - 1):
        all_words[i]["end"] = min(round(all_words[i]["start"] + 1.2, 2), all_words[i + 1]["start"])
        if all_words[i]["end"] <= all_words[i]["start"]:
            all_words[i]["end"] = round(all_words[i]["start"] + 0.25, 2)
            
    return all_words

def select_best_innertube_track(caption_tracks, audio_tracks=None, preferred_lang=None, video_title=""):
    if not caption_tracks:
        return None

    # 1. Preferred language requested
    if preferred_lang:
        p_code = preferred_lang.lower().split('-')[0]
        for t in caption_tracks:
            if t.get('kind') != 'asr' and t.get('languageCode', '').lower().startswith(p_code):
                return t
        for t in caption_tracks:
            if t.get('languageCode', '').lower().startswith(p_code):
                return t

    # 2. Audio track correlation from InnerTube
    if audio_tracks and isinstance(audio_tracks, list) and len(audio_tracks) > 0:
        def_audio = audio_tracks[0]
        indices = def_audio.get('captionTrackIndices', [])
        if indices and isinstance(indices, list) and indices[0] < len(caption_tracks):
            return caption_tracks[indices[0]]

    # 3. Detect from video title
    if video_title:
        v_lower = video_title.lower()
        if re.search(r'[éèêëàâôûùçîïœæ]|\b(french|français|pourquoi|comment|dans|avec|paris)\b', v_lower):
            for t in caption_tracks:
                if t.get('languageCode', '').lower().startswith('fr'):
                    return t
        elif re.search(r'[\u0600-\u06FF\u0750-\u077F]', video_title):
            for t in caption_tracks:
                if t.get('languageCode', '').lower().startswith('ar'):
                    return t
        elif re.search(r'[áéíóúüñ¿¡]|\b(spanish|español|por qué|como|cuando)\b', v_lower):
            for t in caption_tracks:
                if t.get('languageCode', '').lower().startswith('es'):
                    return t
        elif re.search(r'[äöüß]|\b(german|deutsch|warum|wie)\b', v_lower):
            for t in caption_tracks:
                if t.get('languageCode', '').lower().startswith('de'):
                    return t

    # 4. Standard preferred language priorities: English, French
    for code in ['en', 'fr']:
        for t in caption_tracks:
            if t.get('kind') != 'asr' and t.get('languageCode', '').lower().startswith(code):
                return t
        for t in caption_tracks:
            if t.get('kind') == 'asr' and t.get('languageCode', '').lower().startswith(code):
                return t

    # 5. Non-auto-translated authentic track (avoiding t. translations)
    authentic_tracks = [t for t in caption_tracks if not t.get('vssId', '').startswith('t.')]
    if authentic_tracks:
        manual = [t for t in authentic_tracks if t.get('kind') != 'asr']
        if manual:
            return manual[0]
        return authentic_tracks[0]

    return caption_tracks[0]

def extract_with_innertube(vid, preferred_lang=None, video_title=""):
    print(f"--> [Primary Engine] Extracting via Native Mobile InnerTube API for {vid}...")
    cookie_hdr = load_cookie_header()
    if cookie_hdr:
        print("    [InnerTube] Using authenticated session cookies from cookies.txt")
    
    clients = [
        {
            "name": "ANDROID",
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "20.10.38",
                "androidSdkVersion": 34
            },
            "ua": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)"
        },
        {
            "name": "IOS",
            "client": {
                "clientName": "IOS",
                "clientVersion": "19.29.1",
                "deviceMake": "Apple",
                "deviceModel": "iPhone14,3"
            },
            "ua": "com.google.ios.youtube/19.29.1 (iPhone14,3; U; CPU iOS 17_5_1 like Mac OS X)"
        },
        {
            "name": "MWEB",
            "client": {
                "clientName": "MWEB",
                "clientVersion": "2.20240313.01.00"
            },
            "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
        }
    ]

    for c in clients:
        try:
            payload = {
                "context": {
                    "client": c["client"]
                },
                "videoId": vid
            }
            headers = {
                "Content-Type": "application/json",
                "User-Agent": c["ua"]
            }
            if cookie_hdr:
                headers["Cookie"] = cookie_hdr
            body = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(INNERTUBE_URL, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                status = data.get("playabilityStatus", {}).get("status")
                if status not in ["OK", None]:
                    print(f"    InnerTube [{c['name']}] playability: {status}")
                    continue

                renderer = data.get("captions", {}).get("playerCaptionsTracklistRenderer", {})
                caption_tracks = renderer.get("captionTracks", [])
                audio_tracks = renderer.get("audioTracks", [])

                if not caption_tracks:
                    continue

                selected = select_best_innertube_track(caption_tracks, audio_tracks, preferred_lang, video_title)
                if not selected:
                    continue

                lang_code = selected.get("languageCode", "en")
                track_kind = selected.get("kind", "standard")
                track_url = selected.get("baseUrl", "")
                if not track_url:
                    continue

                if "fmt=" not in track_url:
                    track_url += "&fmt=srv3"

                print(f"    Found track via [{c['name']}]: {lang_code} (kind: {track_kind})")
                tt_headers = {"User-Agent": c["ua"]}
                if cookie_hdr:
                    tt_headers["Cookie"] = cookie_hdr
                tt_req = urllib.request.Request(track_url, headers=tt_headers)
                with urllib.request.urlopen(tt_req, timeout=10) as tt_res:
                    xml_content = tt_res.read().decode('utf-8')
                    if not xml_content or not xml_content.strip().startswith('<') or "GoogleSorry" in xml_content:
                        continue

                    raw_words = parse_timedtext_xml(xml_content)
                    if not raw_words:
                        continue

                    sentences = build_sentences_from_words(raw_words)
                    if sentences and len(sentences) > 0:
                        print(f"    ✓ Successfully assembled {len(sentences)} sentences via InnerTube [{c['name']}]")
                        return sentences, lang_code, track_kind

        except Exception as e:
            print(f"    InnerTube [{c['name']}] notice: {e}")

    return None, None, None

def extract_with_ytdlp(vid, preferred_lang=None):
    print(f"--> [Fallback Engine] Extracting via hardened yt-dlp for {vid}...")
    out_prefix = f"temp_sub_{vid}_{os.getpid()}"

    # Determine targeted sub-langs to avoid requesting 100+ auto-translated languages which causes 429
    if preferred_lang:
        p_code = preferred_lang.lower().split('-')[0]
        sub_lang_arg = f"{p_code},{p_code}-orig,{p_code}.*,en,en-orig,fr,fr-orig"
    else:
        sub_lang_arg = "en,en-orig,fr,fr-orig,es,es-orig,ar,de,it,ja,ko,pt,zh"

    cmd = [
        "yt-dlp",
        "--skip-download",
        "--write-auto-sub",
        "--write-subs",
        "--sub-langs", sub_lang_arg,
        "--sub-format", "json3",
        "--extractor-args", "youtube:player_client=android,ios,web",
        "--ignore-errors",
        "--no-warnings",
        "-o", f"{out_prefix}.%(ext)s"
    ]

    # Explicitly configure js-runtimes if node or deno is available
    if shutil.which("node"):
        cmd.extend(["--js-runtimes", "node"])
    elif shutil.which("deno"):
        cmd.extend(["--js-runtimes", "deno"])

    # Support authenticated cookies if cookies.txt is provided
    if os.path.isfile("cookies.txt"):
        print("    [yt-dlp] Using authenticated session cookies from cookies.txt")
        cmd.extend(["--cookies", "cookies.txt"])

    cmd.append(f"https://www.youtube.com/watch?v={vid}")

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    except Exception as e:
        print(f"    yt-dlp execution error: {e}")
        return None, None

    files = glob.glob(f"{out_prefix}*.json3")
    if not files:
        err_msg = res.stderr[:200] if res.stderr else "no files created"
        print(f"    yt-dlp produced no json3 files. stderr: {err_msg}")
        return None, None

    # Pick best file matching preferred_lang or default
    chosen_file = files[0]
    if preferred_lang:
        p_code = preferred_lang.lower().split('-')[0]
        for f in files:
            if f".{p_code}." in f or f".{p_code}-" in f:
                chosen_file = f
                break

    detected_lang = "en"
    for part in chosen_file.split('.'):
        if len(part) == 2 or (len(part) == 5 and '-' in part):
            detected_lang = part
            break

    data = None
    try:
        with open(chosen_file, "r", encoding="utf-8") as jf:
            data = json.load(jf)
    finally:
        for f in files:
            try:
                os.remove(f)
            except Exception:
                pass

    if not data:
        return None, None

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

    return build_sentences_from_words(raw_words), detected_lang

def extract_with_youtube_transcript_api(vid, preferred_lang=None):
    print(f"--> [Fallback Engine] Extracting via youtube_transcript_api for {vid}...")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        t_list = api.list(vid)
        tracks = list(t_list)
        if not tracks:
            return None, None, None

        selected = None
        if preferred_lang:
            p_code = preferred_lang.lower().split('-')[0]
            for t in tracks:
                if not t.is_generated and t.language_code.lower().startswith(p_code):
                    selected = t
                    break
            if not selected:
                for t in tracks:
                    if t.is_generated and t.language_code.lower().startswith(p_code):
                        selected = t
                        break

        if not selected:
            for code in ['en', 'fr']:
                for t in tracks:
                    if not t.is_generated and t.language_code.lower().startswith(code):
                        selected = t
                        break
                if selected:
                    break

        if not selected:
            for code in ['en', 'fr']:
                for t in tracks:
                    if t.is_generated and t.language_code.lower().startswith(code):
                        selected = t
                        break
                if selected:
                    break

        if not selected:
            selected = tracks[0]

        print(f"    Selected ytta track: {selected.language} ({selected.language_code}), generated: {selected.is_generated}")
        snippets = selected.fetch()
        raw_words = []
        for s in snippets:
            raw_text = s.get('text', '') if isinstance(s, dict) else getattr(s, 'text', '')
            raw_start = float(s.get('start', 0)) if isinstance(s, dict) else float(getattr(s, 'start', 0))
            raw_dur = float(s.get('duration', 0)) if isinstance(s, dict) else float(getattr(s, 'duration', 0))
            text = raw_text.replace('\n', ' ').strip()
            if not text or (text.startswith('[') and text.endswith(']')):
                continue
            words = interpolate_words(text, round(raw_start, 2), round(raw_start + raw_dur, 2))
            raw_words.extend(words)

        sentences = build_sentences_from_words(raw_words)
        track_kind = "asr" if selected.is_generated else "standard"
        return sentences, selected.language_code, track_kind
    except Exception as e:
        print(f"    youtube_transcript_api notice: {e}")
        return None, None, None

def extract_video(vid, preferred_lang=None, output_dir="public/transcripts"):
    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, f"{vid}.json")
    
    # 0. Check video title via oEmbed to aid language selection
    video_title = ""
    try:
        o_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"
        with urllib.request.urlopen(o_url, timeout=4) as r:
            t_data = json.loads(r.read().decode('utf-8'))
            video_title = t_data.get('title', '')
    except Exception:
        pass

    if not preferred_lang and video_title:
        v_lower = video_title.lower()
        if re.search(r'[éèêëàâôûùçîïœæ]|\b(french|français|pourquoi|comment|quand|dans|avec|pour|sens|mal|sans|raison|le|la|les|un|une|des|du|qui|que)\b', v_lower):
            preferred_lang = 'fr'
        elif re.search(r'[\u0600-\u06FF\u0750-\u077F]', video_title):
            preferred_lang = 'ar'
        elif re.search(r'[áéíóúüñ¿¡]|\b(spanish|español|por qué|como|cuando|en|con|para|el|la|los|las|un|una|del)\b', v_lower):
            preferred_lang = 'es'

    print(f"--> Extracting transcript for YouTube ID: {vid} (title: '{video_title}', preferred: {preferred_lang})")
    
    sentences = None
    lang_code = preferred_lang or "en"
    track_kind = "standard"

    # Engine 1: Native Mobile InnerTube API (Fastest, zero dependencies, residential + datacenter IP proof)
    it_sentences, it_lang, it_kind = extract_with_innertube(vid, preferred_lang, video_title)
    if it_sentences and len(it_sentences) > 0:
        sentences = it_sentences
        lang_code = it_lang or lang_code
        track_kind = it_kind or track_kind

    # Engine 2: Hardened yt-dlp (with Android client, js-runtimes, targeted language selection)
    if not sentences or len(sentences) == 0:
        ytdlp_sentences, ytdlp_lang = extract_with_ytdlp(vid, preferred_lang)
        if ytdlp_sentences and len(ytdlp_sentences) > 0:
            sentences = ytdlp_sentences
            lang_code = ytdlp_lang or lang_code
            track_kind = "timedtext_json3"

    # Engine 3: youtube_transcript_api (fallback for residential / proxies)
    if not sentences or len(sentences) == 0:
        ytta_sentences, ytta_lang, ytta_kind = extract_with_youtube_transcript_api(vid, preferred_lang)
        if ytta_sentences and len(ytta_sentences) > 0:
            sentences = ytta_sentences
            lang_code = ytta_lang or lang_code
            track_kind = ytta_kind or track_kind

    if sentences and len(sentences) > 0:
        output_data = {
            "ok": True,
            "videoId": vid,
            "title": video_title,
            "language": lang_code,
            "trackKind": track_kind,
            "subtitles": sentences
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"✓ Successfully generated {out_file} with {len(sentences)} sentences (lang: {lang_code}).")
        return True
    else:
        print(f"❌ Failed to extract subtitles for {vid} across all available engines.")
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
