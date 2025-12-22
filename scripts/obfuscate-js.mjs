import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const inDir = path.join(projectRoot, 'dist', 'js');

const entries = await fs.readdir(inDir, { withFileTypes: true });
const jsFiles = entries
  .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.js'))
  .map((e) => e.name)
  .sort();

if (jsFiles.length === 0) {
  console.log('No JS files found in', inDir);
  process.exit(0);
}

// NOTE:
// - Obfuscation only makes code harder to read; it does not provide real security.
const EXCLUDE = new Set([]);

for (const fileName of jsFiles) {
  if (EXCLUDE.has(fileName)) {
    console.log('Skip obfuscation for', fileName);
    continue;
  }

  const filePath = path.join(inDir, fileName);
  const code = await fs.readFile(filePath, 'utf8');

  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    simplify: true,

    // Make identifiers harder to read
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,

    // Aggressive string hiding
    stringArray: true,
    stringArrayThreshold: 1,
    rotateStringArray: true,
    stringArrayShuffle: true,
    stringArrayIndexesType: ['hexadecimal-number'],
    stringArrayEncoding: ['base64'],

    // Split strings to reduce greppability
    splitStrings: true,
    splitStringsChunkLength: 6,

    // Avoid the most break-prone transforms
    controlFlowFlattening: false,
    deadCodeInjection: false,

    // Anti-tamper-ish (can make debugging harder)
    selfDefending: true
  });

  await fs.writeFile(filePath, result.getObfuscatedCode(), 'utf8');
  console.log('Obfuscated', fileName);
}
