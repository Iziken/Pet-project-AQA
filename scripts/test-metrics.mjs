#!/usr/bin/env node
// Сводка метрик по JSON-отчёту Playwright (playwright-report/results.json).
// Использование: npm run metrics [путь-к-results.json]

import { readFileSync } from "node:fs";

const reportPath = process.argv[2] ?? "playwright-report/results.json";

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  console.error(`Не удалось прочитать отчёт ${reportPath}: ${err.message}`);
  console.error("Сначала запусти тесты — reporter json пишет файл по завершении прогона.");
  process.exit(1);
}

// Проходит по вложенным suite'ам и собирает все specs.
function collectSpecs(suite, out) {
  out.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) collectSpecs(child, out);
}

const specs = [];
for (const suite of report.suites ?? []) collectSpecs(suite, specs);

// Метрики считаются по финальному статусу каждого теста в каждом проекте.
const byProject = new Map();

for (const spec of specs) {
  for (const test of spec.tests ?? []) {
    const project = test.projectName ?? "(без проекта)";
    const outcome = test.results?.[0]?.status ?? "skipped";
    const duration = test.results?.[0]?.duration ?? 0;

    const metrics = byProject.get(project) ?? {
      total: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      duration: 0,
    };

    metrics.total += 1;
    metrics.duration += duration;
    if (outcome === "passed") metrics.passed += 1;
    else if (outcome === "failed") metrics.failed += 1;
    else if (outcome === "flaky") metrics.flaky += 1;
    else metrics.skipped += 1;

    byProject.set(project, metrics);
  }
}

const fmtDuration = (ms) =>
  ms >= 60_000
    ? `${Math.round(ms / 6000) / 10} мин`
    : `${Math.round(ms / 100) / 10} с`;

const fmtDate = (iso) => new Date(iso).toLocaleString("ru-RU");

console.log(`Прогон от ${fmtDate(report.stats?.startTime ?? Date.now())}`);
console.log("");

let grandTotal = 0;
let grandFailed = 0;
let grandFlaky = 0;

for (const [project, m] of byProject) {
  grandTotal += m.total;
  grandFailed += m.failed;
  grandFlaky += m.flaky;

  console.log(
    `${project.padEnd(8)} ${m.total} тестов: ` +
      `${m.passed} passed, ${m.failed} failed, ${m.flaky} flaky, ${m.skipped} skipped ` +
      `· ${fmtDuration(m.duration)}`,
  );
}

console.log("");
console.log(
  `Всего: ${grandTotal} · время прогона: ${fmtDuration(report.stats?.duration ?? 0)}`,
);

// Метрика стабильности: доля прогонов без повторных попыток.
// flaky — тест, прошедший только после retry: каждый такой случай — кандидат на разбор.
if (grandFlaky > 0) {
  const flakyRate = ((grandFlaky / grandTotal) * 100).toFixed(1);
  console.log(`⚠️  Flaky rate: ${flakyRate}% (${grandFlaky} из ${grandTotal})`);
}

if (report.errors?.length) {
  console.log(`Ошибок вне тестов: ${report.errors.length}`);
}

process.exit(grandFailed > 0 ? 1 : 0);
