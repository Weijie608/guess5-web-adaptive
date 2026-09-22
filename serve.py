"""Local-only preview with a resolved-path boundary around this website."""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote,urlsplit
import argparse,webbrowser

def resolved_resource(root,url_path,prefix):
    if not url_path.startswith(prefix):raise ValueError('Outside URL prefix')
    relative=unquote(url_path[len(prefix):]).replace('\\','/')
    root=Path(root).resolve()
    candidate=(root/relative).resolve()
    if not candidate.is_relative_to(root):raise ValueError('Outside website directory')
    return candidate

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--open',action='store_true')
    parser.add_argument('--prefix',default='/')
    args=parser.parse_args()
    prefix='/'+args.prefix.strip('/')+'/' if args.prefix.strip('/') else '/'
    site_root=Path(__file__).resolve().parent
    class Handler(SimpleHTTPRequestHandler):
        def route(self,method):
            url=urlsplit(self.path)
            if prefix!='/' and url.path==prefix[:-1]:
                self.send_response(301);self.send_header('Location',prefix);self.end_headers();return
            try:resolved_resource(site_root,url.path,prefix)
            except (ValueError,OSError):self.send_error(403);return
            if method=='HEAD':super().do_HEAD()
            else:super().do_GET()
        def translate_path(self,path):
            return str(resolved_resource(site_root,urlsplit(path).path,prefix))
        def do_GET(self):self.route('GET')
        def do_HEAD(self):self.route('HEAD')
        def log_message(self,*args):pass
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(site_root)))
    print(f'Preview: http://127.0.0.1:{args.port}{prefix}',flush=True)
    print('Confined to this website directory. Press Ctrl+C to stop.',flush=True)
    if args.open:webbrowser.open(f'http://127.0.0.1:{args.port}{prefix}')
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
