import os
import sys
import json
import base64
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Import extraction logic
import extract_transcript

PORT = 38472

class SubtitleHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress noisy default console logging
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/ping':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.end_headers()
            self.wfile.write(b'{"ok":true,"service":"ToolkerLocalExtractor"}')
            return

        if parsed.path in ['/transcript', '/extract']:
            qs = parse_qs(parsed.query)
            vid_list = qs.get('v') or qs.get('videoId')
            if not vid_list or not vid_list[0] or len(vid_list[0].strip()) != 11:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
                self.end_headers()
                self.wfile.write(b'{"ok":false,"error":"Invalid videoId"}')
                return

            vid = vid_list[0].strip()
            lang = (qs.get('lang') or [None])[0]

            # 1. Check if already extracted locally
            local_path = os.path.join("public", "transcripts", f"{vid}.json")
            if os.path.exists(local_path):
                try:
                    with open(local_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if data.get("ok") and data.get("subtitles"):
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Access-Control-Allow-Private-Network', 'true')
                        self.end_headers()
                        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
                        return
                except Exception:
                    pass

            # 2. Extract on-the-fly in 2 seconds!
            success = extract_transcript.extract_video(vid, lang)
            if success and os.path.exists(local_path):
                try:
                    with open(local_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Private-Network', 'true')
                    self.end_headers()
                    self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
                    return
                except Exception as e:
                    print(f"Error reading extracted file: {e}")

            # 3. Failed
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.end_headers()
            self.wfile.write(b'{"ok":false,"error":"No captions available on YouTube"}')
            return

        self.send_response(404)
        self.end_headers()

def run_server():
    server_address = ('127.0.0.1', PORT)
    httpd = HTTPServer(server_address, SubtitleHandler)
    print(f"Toolker Local Extractor running on http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == '__main__':
    run_server()
