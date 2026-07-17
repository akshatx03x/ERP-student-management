const fs = require('fs');
const d = fs.readFileSync('.next/static/chunks/polyfills-42372ed130431b0a.js', 'utf8');
const m = d.match(/core-js\/[a-zA-Z0-9\-\/\.]+/g) || [];
const uniq = [...new Set(m)];
console.log('core-js modules bundled:', uniq.length);
uniq.slice(0, 25).forEach(x => console.log(' ', x));
