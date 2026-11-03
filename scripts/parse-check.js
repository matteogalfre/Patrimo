#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Lightweight syntactic check of every project JS/JSX file.
 *
 * Runs in CI to catch parse-time regressions that would otherwise only
 * surface inside a Metro bundle (i.e. once the app actually starts). Jest
 * already parses files it imports, but a lot of screens are not imported by
 * any test, so this script walks the whole repo.
 *
 * Two passes:
 *   1. SYNTAX — every file must parse.
 *   2. IMPORTS — every relative import must resolve to a real file, and every
 *      bare specifier must be declared in package.json. This catches the two
 *      bug classes that come right after syntax errors: a mistyped relative
 *      path, and a package that works locally through hoisting but breaks on a
 *      clean install (or after an `npm uninstall`).
 *
 * Deliberately static: actually evaluating the modules would require a React
 * Native runtime, which does not exist under plain Node.
 *
 * Usage: `node scripts/parse-check.js`
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  '.expo-shared',
  'android',
  'ios',
  'build',
  'dist',
  'coverage',
]);
const EXTS = new Set(['.js', '.jsx']);

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
};

const files = walk(ROOT);
let failed = 0;

for (const file of files) {
  try {
    parser.parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx'],
      errorRecovery: false,
    });
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${path.relative(ROOT, file)} — ${err.message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} file(s) failed to parse out of ${files.length}.`);
  process.exit(1);
}
console.log(`OK — ${files.length} files parsed successfully.`);

// ---------------------------------------------------------------------------
// Pass 2: import resolution
// ---------------------------------------------------------------------------

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);

// Modules fournis par l'environnement, jamais declares dans package.json.
// On s'appuie sur la liste que Node expose (fs, path, ...) plutot que sur une
// enumeration a la main, forcement incomplete, et on y ajoute les modules que
// React Native fournit au bundle.
const { builtinModules } = require('node:module');
const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'react-native',
  'react',
]);

/** `@scope/name/sub` -> `@scope/name` ; `name/sub` -> `name` */
const packageRoot = (spec) => {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

const RESOLVE_EXTS = ['', '.js', '.jsx', '.json', '/index.js', '/index.jsx'];

const resolvesOnDisk = (fromFile, spec) => {
  const base = path.resolve(path.dirname(fromFile), spec);
  return RESOLVE_EXTS.some((ext) => {
    const candidate = base + ext;
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  });
};

const collectSpecifiers = (ast) => {
  const specs = [];
  for (const node of ast.program.body) {
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source
    ) {
      specs.push(node.source.value);
    }
  }
  return specs;
};

let importProblems = 0;

for (const file of files) {
  let ast;
  try {
    ast = parser.parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx'],
      errorRecovery: false,
    });
  } catch {
    continue; // deja signale par la passe 1
  }

  for (const spec of collectSpecifiers(ast)) {
    const rel = path.relative(ROOT, file);

    if (spec.startsWith('.')) {
      if (!resolvesOnDisk(file, spec)) {
        importProblems += 1;
        console.error(`BROKEN IMPORT ${rel} — '${spec}' resolves to nothing`);
      }
      continue;
    }

    const root = packageRoot(spec);
    if (BUILTINS.has(root) || BUILTINS.has(spec)) continue;
    if (!declared.has(root)) {
      importProblems += 1;
      console.error(`UNDECLARED ${rel} — '${spec}' is not in package.json`);
    }
  }
}

if (importProblems > 0) {
  console.error(`\n${importProblems} import problem(s) found.`);
  process.exit(1);
}
console.log(`OK — all imports resolve.`);
