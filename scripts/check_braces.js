const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'server', 'controllers', 'customOrderController.js');
const s = fs.readFileSync(file, 'utf8');
const lines = s.split('\n');
let depth = 0;
for (let i=0;i<lines.length;i++){
  const line = lines[i];
  for (let ch of line) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  if (i % 50 === 0) {
    // output progress occasionally
  }
  if (depth < 0) {
    console.log('Negative depth at line', i+1);
    break;
  }
}
console.log('Final depth:', depth);

// Print local window where problem occurs: find first deep imbalance between 400-700
let cum = 0;
for (let i=0;i<lines.length;i++){
  const line = lines[i];
  for (let ch of line) {
    if (ch === '{') cum++;
    else if (ch === '}') cum--;
  }
  if (i+1 >= 480 && i+1 <= 720) {
    console.log((i+1).toString().padStart(5), cum, lines[i].slice(0,200));
  }
}
