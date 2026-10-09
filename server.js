// Optional: serves the built game (dist/index.html) at http://localhost:3000.
// You don't need this to play: use the website link or double-click BlockBlitz.html.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist', 'index.html');
const PORT = Number(process.env.PORT) || 3000;

http.createServer((req, res) => {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Run "npm run build" first.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Block Blitz: http://localhost:${PORT}`));
