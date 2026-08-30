const fs = require('fs');
let code = fs.readFileSync('src/scripts/dashboard.ts', 'utf8');
code = code.replace(/\\n/g, '\n');
fs.writeFileSync('src/scripts/dashboard.ts', code);
console.log('Fixed newlines.');
