const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'server', 'controllers', 'customOrderController.js');
const s = fs.readFileSync(file, 'utf8');
const tokens = [];
const re = /\b(try|catch|finally)\b/g;
let m;
while ((m = re.exec(s)) !== null) {
  const idx = m.index;
  const line = s.slice(0, idx).split('\n').length;
  tokens.push({word: m[1], index: idx, line});
}

console.log('Found', tokens.length, 'tokens');
for (let i=0;i<tokens.length;i++) {
  console.log(i+1, tokens[i].word, 'line', tokens[i].line);
}

// Show surrounding lines for the token where stack indicated unmatched
const suspectLine = 511;
const fileLines = s.split('\n');
console.log('\nContext around line', suspectLine, ':');
for (let i=Math.max(0,suspectLine-5); i<Math.min(fileLines.length, suspectLine+5); i++) {
  console.log((i+1).toString().padStart(4,' '), fileLines[i]);
}
