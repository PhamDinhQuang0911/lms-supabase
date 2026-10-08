import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class CleanUrlHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Hỗ trợ clean URLs (ví dụ: /dashboard -> /dashboard.html, /student -> /student.html)
        url_path = self.path.split('?')[0]
        file_path = self.translate_path(url_path)
        
        if not os.path.exists(file_path) and not file_path.endswith('.html'):
            if os.path.exists(file_path + '.html'):
                self.path = url_path + '.html' + ('?' + self.path.split('?')[1] if '?' in self.path else '')
                
        return super().do_GET()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Starting QMath local server with clean URL support on http://localhost:{port}...")
    HTTPServer(('', port), CleanUrlHandler).serve_forever()
