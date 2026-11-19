// 重新建立索引：node --env-file=.env scripts/ingest.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { embed, EMBED_MODEL } from '../lib/gemini.mjs';

const MAX_CHARS = 600;
const OVERLAP_LINES = 2;
const BATCH_SIZE = 50;

const dataUrl = path => new URL(`../data/${path}`, import.meta.url);

function sections(text) {
  return text.split(/^@@ /m).filter(Boolean).map(block => {
    const newline = block.indexOf('\n');
    return { location: block.slice(0, newline).trim(), body: block.slice(newline + 1).trim() };
  }).filter(section => section.body);
}

function splitByLines(body) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const line of body.split('\n')) {
    if (size + line.length > MAX_CHARS && current.length) {
      chunks.push(current.join('\n'));
      current = current.slice(-OVERLAP_LINES);
      size = current.join('').length;
    }
    current.push(line);
    size += line.length;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

const sources = JSON.parse(await readFile(dataUrl('sources.json'), 'utf8'));
const chunks = [];
for (const { id, title, publisher, version, url } of sources) {
  const text = await readFile(dataUrl(`docs/${id}.txt`), 'utf8');
  for (const { location, body } of sections(text)) {
    for (const part of splitByLines(body)) {
      chunks.push({ id: `${id}#${chunks.length}`, docId: id, title, publisher, version, url, location, text: part });
    }
  }
}

for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE);
  const vectors = await embed(batch.map(c => `${c.title}｜${c.location}\n${c.text}`), 'RETRIEVAL_DOCUMENT');
  batch.forEach((chunk, j) => { chunk.vector = vectors[j].map(v => Number(v.toFixed(6))); });
  console.log(`已嵌入 ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
}

await writeFile(dataUrl('index.json'), JSON.stringify({ model: EMBED_MODEL, builtAt: new Date().toISOString(), chunks }));
console.log(`完成：${sources.length} 份文件，${chunks.length} 個段落`);
