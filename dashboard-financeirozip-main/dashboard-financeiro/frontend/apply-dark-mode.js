const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Evitar duplicar dark: classes se já estiverem lá
  const replaceClass = (search, replaceRegexStr, replacement) => {
    let r = new RegExp(replaceRegexStr, 'g');
    content = content.replace(r, (match) => {
      if (match.includes('dark:')) return match;
      return match.replace(search, replacement);
    });
  };

  // Backgrounds
  replaceClass('bg-white', 'bg-white(?!\\\\s+dark:bg)', 'bg-white dark:bg-slate-800');
  replaceClass('bg-gray-50', 'bg-gray-50(?!\\\\s+dark:bg|/)', 'bg-gray-50 dark:bg-slate-900');
  
  // Borders
  replaceClass('border-gray-200', 'border-gray-200(?!\\\\s+dark:border)', 'border-gray-200 dark:border-slate-700');
  replaceClass('border-gray-100', 'border-gray-100(?!\\\\s+dark:border)', 'border-gray-100 dark:border-slate-700/50');
  replaceClass('border-gray-300', 'border-gray-300(?!\\\\s+dark:border)', 'border-gray-300 dark:border-slate-600');
  
  // Text Gray
  replaceClass('text-gray-900', 'text-gray-900(?!\\\\s+dark:text)', 'text-gray-900 dark:text-slate-100');
  replaceClass('text-gray-800', 'text-gray-800(?!\\\\s+dark:text)', 'text-gray-800 dark:text-slate-200');
  replaceClass('text-gray-700', 'text-gray-700(?!\\\\s+dark:text)', 'text-gray-700 dark:text-slate-300');
  replaceClass('text-gray-600', 'text-gray-600(?!\\\\s+dark:text)', 'text-gray-600 dark:text-slate-400');
  replaceClass('text-gray-500', 'text-gray-500(?!\\\\s+dark:text)', 'text-gray-500 dark:text-slate-400'); 
  
  // Red softening
  replaceClass('text-red-700', 'text-red-700(?!\\\\s+dark:text)', 'text-red-700 dark:text-red-400');
  replaceClass('text-red-600', 'text-red-600(?!\\\\s+dark:text)', 'text-red-600 dark:text-red-400');
  replaceClass('text-red-500', 'text-red-500(?!\\\\s+dark:text)', 'text-red-500 dark:text-red-400');
  replaceClass('bg-red-50', 'bg-red-50(?!\\\\s+dark:bg|/)', 'bg-red-50 dark:bg-red-900/20');
  replaceClass('bg-red-100', 'bg-red-100(?!\\\\s+dark:bg|/)', 'bg-red-100 dark:bg-red-900/40');
  replaceClass('border-red-600', 'border-red-600(?!\\\\s+dark:border)', 'border-red-600 dark:border-red-500/50');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (stat.isFile() && (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts'))) {
      processFile(fullPath);
    }
  }
}

processDirectory(srcDir);
console.log('Script concluded.');
