// Imită pagina github.com/<repo>/releases/latest pentru testele din CI: răspunde cu 302 către
// /releases/tag/<tag>, ca GitHub. Testul API schimbă tag-ul cu POST /__set {"tag": "..."}.
// Rulare: node e2e/releases-stub.mjs 8099
import { createServer } from 'node:http';

let tag = process.env.STUB_TAG || 'android-v2.3.0-17';

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__set') {
    let body = '';
    for await (const chunk of req) body += chunk;
    tag = JSON.parse(body).tag;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(tag);
    return;
  }
  if (req.url.endsWith('/releases/latest')) {
    res.writeHead(302, { location: req.url.replace(/latest$/, `tag/${tag}`) });
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(Number(process.argv[2] || 8099), () => console.log(`releases stub pe ${process.argv[2] || 8099}: ${tag}`));
