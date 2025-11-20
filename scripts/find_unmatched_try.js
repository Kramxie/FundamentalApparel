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

const stack = [];
for (const t of tokens) {
  if (t.word === 'try') {
    stack.push(t);
  } else if (t.word === 'catch' || t.word === 'finally') {
    if (stack.length === 0) {
      console.log('Unmatched', t.word, 'at line', t.line);
    } else {
      stack.pop();
    }
  }
}
if (stack.length) {
  console.log('Unmatched try(s):');
  stack.forEach(t => console.log(' try at line', t.line));
} else {
  console.log('All try tokens matched with catch/finally (naive check)');
}
