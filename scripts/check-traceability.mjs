#!/usr/bin/env node
// Проверка трассировки требований: каждая ссылка матрицы покрытия
// «tests/...spec.ts → название теста» должна указывать на реально
// существующий тест в соответствующем spec-файле.
// Использование: npm run test:traceability

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Собираем все spec-файлы рекурсивно.
function collectSpecFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collectSpecFiles(path, out);
    else if (name.endsWith(".spec.ts")) out.push(path);
  }
  return out;
}

// Фактические тесты: файл → набор названий из вызовов test("...").
const actual = new Map();
for (const file of collectSpecFiles("tests")) {
  const source = readFileSync(file, "utf8");
  const titles = [...source.matchAll(/\btest\(\s*"((?:[^"\\]|\\.)*)"/g)].map(
    (match) => match[1],
  );
  const key = relative(".", file).replace(/\\/g, "/");
  actual.set(key, new Set(titles));
}

// Ссылки из матрицы: `tests/...spec.ts → название теста`.
const matrix = readFileSync("docs/coverage-matrix.md", "utf8");
const references = [
  ...matrix.matchAll(/`(tests\/[^`\s]+\.spec\.ts) → ([^`]+)`/g),
];

console.log(
  `Матрица ссылается на ${references.length} привязок «файл → тест» в ${actual.size} spec-файлах.\n`,
);

let broken = 0;
for (const [, file, title] of references) {
  const titles = actual.get(file);
  if (!titles) {
    console.error(`✗ ${file}: файл не найден`);
    broken += 1;
  } else if (!titles.has(title)) {
    console.error(`✗ ${file} → «${title}»: тест с таким названием не найден`);
    broken += 1;
  }
}

// Обратная сторона трассировки: тесты без привязки к требованию.
// Не фейлит проверку — только подсвечивает кандидатов на привязку.
const referenced = new Set(
  references.map(([, file, title]) => `${file}::${title}`),
);
const unattached = [];
for (const [file, titles] of actual) {
  for (const title of titles) {
    if (!referenced.has(`${file}::${title}`)) unattached.push(`${file} → ${title}`);
  }
}

if (unattached.length > 0) {
  console.log(
    `Без привязки к требованию (${unattached.length}, не блокирует):\n` +
      unattached.map((entry) => `  · ${entry}`).join("\n"),
  );
  console.log("");
}

if (broken > 0) {
  console.error(`\nИтог: ${broken} битых ссылок в матрице покрытия.`);
  process.exit(1);
}

console.log("Итог: все ссылки матрицы указывают на существующие тесты.");
