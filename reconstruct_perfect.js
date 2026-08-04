const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');

const logPath = 'C:\\Users\\Akshat\\.gemini\\antigravity-ide\\brain\\4bb4b993-d23f-4f5c-9c9d-109021c0da09\\.system_generated\\logs\\transcript_full.jsonl';
const targetRelative = 'src/app/(dashboard)/results/results-client.tsx';

// 1. Get clean file content from git
let fileContent = '';
try {
  fileContent = execSync(`git show origin/main:"${targetRelative}"`, { encoding: 'utf8' });
  console.log('Loaded clean base file from git. Length:', fileContent.length);
} catch (e) {
  console.error('Failed to get base file from git:', e);
  process.exit(1);
}

// 2. Parse transcript and collect all replace_file_content calls up to step 541 (before our turn started)
const rl = readline.createInterface({
  input: fs.createReadStream(logPath),
  crlfDelay: Infinity
});

const edits = [];
rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    // Include all edits from the previous session (up to step 482)
    if (data.step_index <= 482 && data.tool_calls) {
      data.tool_calls.forEach(tc => {
        if (tc.name === 'replace_file_content' && tc.args.TargetFile.includes('results-client.tsx')) {
          edits.push({
            step_index: data.step_index,
            target: tc.args.TargetContent,
            replacement: tc.args.ReplacementContent,
            description: tc.args.Description
          });
        }
      });
    }
  } catch (e) {}
});

rl.on('close', () => {
  console.log(`Found ${edits.length} edits to apply in order.`);
  
  let currentFile = fileContent;
  for (const edit of edits) {
    const target = edit.target;
    const replacement = edit.replacement;
    
    // Normalize line endings
    const currentNorm = currentFile.replace(/\r\n/g, '\n');
    const targetNorm = target.replace(/\r\n/g, '\n');
    const replacementNorm = replacement.replace(/\r\n/g, '\n');
    
    if (edit.step_index === 471) {
      // Fuzzy match step 471: replace from the excel import modal marker to the next modal marker
      const startMarker = '{/* ══ EXCEL MARKS IMPORT MODAL (WIZARD FLOW) ═════════════════════════ */}';
      const endMarker = '{/* ══ CONFIRM PARTIAL IMPORT DIALOG ══════════════════════════════════ */}';
      
      const startIdx = currentNorm.indexOf(startMarker);
      const endIdx = currentNorm.indexOf(endMarker);
      if (startIdx !== -1 && endIdx !== -1) {
        currentFile = currentNorm.substring(0, startIdx) + replacementNorm + '\n      ' + currentNorm.substring(endIdx);
        console.log(`[OK] Fuzzy applied Step 471: ${edit.description}`);
      } else {
        console.error(`[ERROR] Fuzzy Step 471 failed to find markers: start=${startIdx}, end=${endIdx}`);
      }
      continue;
    }
    
    if (edit.step_index === 482) {
      // Fuzzy match step 482: replace confirm partial dialog
      const startMarker = '{/* ══ CONFIRM PARTIAL IMPORT DIALOG ══════════════════════════════════ */}';
      const endMarker = '{/* ══ END OF REPORT CARD PREVIEW ══════════════════════════════════════ */}';
      
      const startIdx = currentNorm.indexOf(startMarker);
      const endIdx = currentNorm.indexOf(endMarker);
      if (startIdx !== -1 && endIdx !== -1) {
        currentFile = currentNorm.substring(0, startIdx) + replacementNorm + '\n' + currentNorm.substring(endIdx);
        console.log(`[OK] Fuzzy applied Step 482: ${edit.description}`);
      } else {
        console.error(`[ERROR] Fuzzy Step 482 failed to find markers: start=${startIdx}, end=${endIdx}`);
      }
      continue;
    }

    const idx = currentNorm.indexOf(targetNorm);
    if (idx === -1) {
      console.error(`[ERROR] Step ${edit.step_index} (${edit.description}) TargetContent not found!`);
    } else {
      currentFile = currentNorm.substring(0, idx) + replacementNorm + currentNorm.substring(idx + targetNorm.length);
      console.log(`[OK] Applied edit for Step ${edit.step_index}: ${edit.description}`);
    }
  }
  
  // Write the perfect reconstructed file to workspace target file
  fs.writeFileSync('src/app/(dashboard)/results/results-client.tsx', currentFile);
  console.log('Saved perfect reconstructed results-client.tsx directly to workspace.');
});
