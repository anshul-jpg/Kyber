const http = require('http');

const PORT = 4049;

const server = http.createServer((req, res) => {
  if (req.url === '/wake') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('waking');
    // Exit immediately so Antigravity task monitor receives instantaneous process exit event (0ms debounce)
    setTimeout(() => {
      process.exit(0);
    }, 10);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  // Silent listening
});
