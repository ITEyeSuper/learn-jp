// ai.js — 呼叫使用者設定的 AI（預設 Gemini，可換 OpenAI 相容 / Anthropic）。
// key 僅存 localStorage、不進程式碼庫。內容會傳給使用者設定的供應商。

/** 是否已設定 AI key */
export function hasAI(s) { return Boolean(s && s.aiKey); }

/**
 * 送訊息給 AI，回傳純文字。
 * @param {object} s 設定 {aiProvider, aiKey, aiModel, aiEndpoint}
 * @param {Array<{role:string,text:string}>} messages 角色: system|user|assistant
 * @param {object} [opts] {json:boolean} 要求回傳 JSON
 * @returns {Promise<string>}
 */
export async function askAI(s, messages, opts = {}) {
  if (!s || !s.aiKey) throw new Error('尚未設定 AI key（請到設定頁）');
  const p = s.aiProvider || 'gemini';
  if (p === 'gemini') return callGemini(s, messages, opts);
  if (p === 'openai') return callOpenAI(s, messages, opts);
  if (p === 'anthropic') return callAnthropic(s, messages, opts);
  throw new Error('未知的 AI 供應商：' + p);
}

async function callGemini(s, messages, opts) {
  const model = s.aiModel || 'gemini-flash-latest';
  const base = (s.aiEndpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(s.aiKey)}`;
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.text).join('\n');
  const contents = messages.filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));
  const body = { contents };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (opts.json) body.generationConfig = { responseMimeType: 'application/json' };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}：${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
}

async function callOpenAI(s, messages, opts) {
  const model = s.aiModel || 'gpt-4o-mini';
  const base = (s.aiEndpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
  const msgs = messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: m.text }));
  const body = { model, messages: msgs };
  if (opts.json) body.response_format = { type: 'json_object' };
  const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.aiKey}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI ${r.status}：${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

async function callAnthropic(s, messages, opts) {
  const model = s.aiModel || 'claude-3-5-haiku-latest';
  const base = (s.aiEndpoint || 'https://api.anthropic.com/v1').replace(/\/$/, '');
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.text).join('\n');
  const msgs = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
  const body = { model, max_tokens: 1024, messages: msgs };
  if (sys) body.system = sys;
  const r = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': s.aiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}：${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.content || []).map((x) => x.text || '').join('');
}
