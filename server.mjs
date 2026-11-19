// 只提供 index.html 與問答 API，不對外開放資料夾，避免 .env 被讀取
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { ask } from './lib/rag.mjs';

const PORT = Number(process.env.PORT || 5173);
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 8_192;
const MAX_QUESTION_CHARS = 300;

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BODY_BYTES) throw new RangeError('body too large');
    parts.push(part);
  }
  return Buffer.concat(parts).toString('utf8');
}

async function handleAsk(req, res) {
  let question;
  try {
    question = JSON.parse(await readBody(req)).question;
  } catch {
    return sendJson(res, 400, { error: '請求格式錯誤。' });
  }
  if (typeof question !== 'string' || !question.trim()) return sendJson(res, 400, { error: '請輸入問題。' });
  if (question.length > MAX_QUESTION_CHARS) return sendJson(res, 400, { error: `問題請在 ${MAX_QUESTION_CHARS} 字以內。` });

  try {
    sendJson(res, 200, await ask(question.trim()));
  } catch (error) {
    console.error('[ask]', error.message);
    sendJson(res, 502, { error: '系統暫時無法回答，請稍後再試。' });
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && pathname === '/api/ask') return handleAsk(req, res);
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(await readFile(new URL('./index.html', import.meta.url)));
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}).listen(PORT, HOST, () => console.log(`http://${HOST}:${PORT}/`));
