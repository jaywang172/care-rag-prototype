const API = 'https://generativelanguage.googleapis.com/v1beta';

export const CHAT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const EMBED_DIMENSIONS = 768;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 4;

async function call(method, body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('缺少 GEMINI_API_KEY，請確認 .env');

  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      await sleep(attempt);
      continue;
    }
    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      const detail = await res.text();
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
    }
    await sleep(attempt);
  }
}

const sleep = attempt => new Promise(resolve => setTimeout(resolve, 1500 * 2 ** (attempt - 1)));

export async function embed(texts, taskType) {
  const model = `models/${EMBED_MODEL}`;
  const data = await call(`${model}:batchEmbedContents`, {
    requests: texts.map(text => ({
      model,
      taskType,
      outputDimensionality: EMBED_DIMENSIONS,
      content: { parts: [{ text }] },
    })),
  });
  return data.embeddings.map(e => e.values);
}

export async function generateJson({ system, prompt, schema }) {
  const data = await call(`models/${CHAT_MODEL}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('');
  if (!text) throw new Error(`Gemini 沒有回傳內容：${data.candidates?.[0]?.finishReason ?? 'unknown'}`);
  return JSON.parse(text);
}
