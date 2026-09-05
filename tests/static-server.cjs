// Test-only static server. It never imports the production API or credentials.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) { res.writeHead(501); res.end('{"error":"API must be mocked"}'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || /(?:^|[\\/])\./.test(path.relative(root, file))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  });
}).listen(4187, '127.0.0.1');
