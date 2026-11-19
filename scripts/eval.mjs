// 跑測試題庫並輸出結果：node --env-file=.env scripts/eval.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { ask } from '../lib/rag.mjs';

const tests = JSON.parse(await readFile(new URL('../tests/questions.json', import.meta.url), 'utf8'));
const sourcesById = new Map(JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8')).map(s => [s.id, s.url]));
const results = [];

for (const test of tests) {
  const started = Date.now();
  let result;
  try {
    result = await ask(test.question);
  } catch (error) {
    result = { status: 'error', message: error.message };
  }
  const answerText = (result.answer ?? []).map(step => step.text).join(' ');
  const statusOk = result.status === test.expect;
  const docOk = !test.doc || (result.sources ?? []).some(source => source.url && sourceDoc(source, test.doc));
  const textOk = (test.contains ?? []).every(word => answerText.includes(word));
  results.push({ ...test, status: result.status, pass: statusOk && docOk && textOk, statusOk, docOk, textOk, ms: Date.now() - started, topScore: result.topScore, result });
  const last = results.at(-1);
  console.log(`${last.pass ? 'PASS' : 'FAIL'} ${test.id} [${result.status}] ${last.ms}ms score=${result.topScore?.toFixed(3) ?? '-'} doc=${docOk} text=${textOk}`);
  console.log(`  ${answerText || result.message}`);
  for (const source of result.sources ?? []) console.log(`  [${source.n}] ${source.title}｜${source.location}`);
}

function sourceDoc(source, docId) {
  return sourcesById.get(docId) === source.url;
}

await writeFile(new URL('../tests/results.json', import.meta.url), JSON.stringify(results, null, 2));
const passed = results.filter(r => r.pass).length;
console.log(`\n通過 ${passed}/${results.length}`);
