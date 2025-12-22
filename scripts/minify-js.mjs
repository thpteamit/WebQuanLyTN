import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'js');
const outDir = path.join(projectRoot, 'dist', 'js');

await fs.mkdir(outDir, { recursive: true });

const entries = await fs.readdir(srcDir, { withFileTypes: true });
const jsFiles = entries
  .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.js'))
  .map((e) => e.name)
  .sort();

if (jsFiles.length === 0) {
  console.log('No JS files found in', srcDir);
  process.exit(0);
}

for (const fileName of jsFiles) {
  const inPath = path.join(srcDir, fileName);
  const outPath = path.join(outDir, fileName);

  const code = await fs.readFile(inPath, 'utf8');
  const result = await minify(code, {
    compress: true,
    mangle: {
      toplevel: false
    },
    format: {
      comments: false
    },
    ecma: 2018
  });

  if (!result.code) {
    throw new Error(`Minify failed for ${fileName}`);
  }

  await fs.writeFile(outPath, result.code, 'utf8');
  console.log('Minified', fileName, '->', path.relative(projectRoot, outPath));
}
