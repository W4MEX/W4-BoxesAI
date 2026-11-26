const fs = require('node:fs');
const path = 'dist/packages/web/index.html';
const html = fs.readFileSync(path, 'utf8');
if (!html.includes('<title>Activepieces</title>')) {
  throw new Error('The upstream HTML changed; review branding before building.');
}
fs.writeFileSync(path, html
  .replace('<title>Activepieces</title>', '<title>W4-BoxesAI</title>')
  .replace(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g, '')
  .replace('</head>', '<link rel="icon" type="image/svg+xml" href="/w4-brand/icon.svg"></head>'));
