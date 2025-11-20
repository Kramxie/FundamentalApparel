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
const pairs = [];
for (let i=0;i<tokens.length;i++){
  const t = tokens[i];
  if (t.word === 'try') {
    stack.push(t);
  } else if (t.word === 'catch' || t.word === 'finally') {
    if (stack.length === 0) {
      console.log('Unmatched', t.word, 'at line', t.line);
    } else {
      const top = stack.pop();
      pairs.push({tryLine: top.line, catchLine: t.line, type: t.word});
    }
  }
}

console.log('Matched pairs (first 30):');
for (let i=0;i<Math.min(30,pairs.length);i++){
  console.log(i+1, 'try@', pairs[i].tryLine, '->', pairs[i].type+'@', pairs[i].catchLine);
}
if (stack.length) {
  console.log('\nUnmatched try(s):');
  stack.forEach(t=>console.log(' try at', t.line));
} else {
  console.log('\nAll try tokens matched (naive LIFO)');
}

// Find the try at line 511 details
const t511 = tokens.find(t=>t.line===511 && t.word==='try');
console.log('\nToken at line 511:', t511);
const idx511 = tokens.indexOf(t511);
console.log('Index in token array:', idx511);
console.log('Next 10 tokens after that:');
for (let j=idx511+1;j<Math.min(tokens.length, idx511+15); j++){
  console.log(tokens[j].line, tokens[j].word);
}
