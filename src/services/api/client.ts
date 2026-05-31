// Streaming LLM client compatible with OpenAI API format.
// Supports any OpenAI-compatible endpoint (Ollama, LocalAI, etc.)


export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ApiMessage {
  role: string;
  content: string;
  name?: string;
}

interface LLMRequest {
  systemPrompt: string;
  messages: ApiMessage[];
  config: LLMConfig;
}

function buildUrl(config: LLMConfig): string {
  const base = config.baseUrl.replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

function buildBaseUrl(config: LLMConfig): string {
  return config.baseUrl.replace(/\/+$/, '');
}

function buildHeaders(config: LLMConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };
}

/**
 * Fetch available models from the API endpoint.
 * Compatible with OpenAI /v1/models format and common variants.
 */
export async function fetchModels(apiKey: string, baseUrl: string): Promise<string[]> {
  const base = buildBaseUrl({ apiKey, baseUrl, model: '', temperature: 0, maxTokens: 0 });
  const url = `${base}/models`;
  const headers = buildHeaders({ apiKey, baseUrl, model: '', temperature: 0, maxTokens: 0 });

  console.log(`[Genesis::API] fetchModels: GET ${url}`);

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (e) {
    console.error(`[Genesis::API] fetchModels request failed:`, e);
    throw new Error(`网络请求失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Genesis::API] fetchModels HTTP ${response.status}: ${errorText}`);
    throw new Error(`API 返回 ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  console.log(`[Genesis::API] fetchModels response keys: ${Object.keys(data).join(', ')}`);

  // Try multiple response formats for different API providers
  let modelIds: string[] = [];

  if (Array.isArray(data?.data)) {
    // Standard OpenAI format: { data: [{ id: "model-name", ... }, ...] }
    modelIds = data.data.map((m: { id?: string }) => m?.id).filter(Boolean);
  } else if (Array.isArray(data?.models)) {
    // Some providers use { models: [{ id: "...", name: "..." }, ...] }
    modelIds = data.models.map((m: { id?: string; name?: string }) => m.id || m.name).filter(Boolean);
  } else if (Array.isArray(data)) {
    // Direct array: [{ id: "..." }, ...] or ["model1", "model2"]
    modelIds = data.map((m: string | { id?: string; name?: string }) =>
      typeof m === 'string' ? m : m.id || m.name
    ).filter((m): m is string => !!m);
  } else if (typeof data === 'object' && data !== null) {
    // Try to find models in common fields
    const candidates = ['models', 'data', 'result', 'results', 'items'];
    for (const key of candidates) {
      if (Array.isArray((data as any)[key])) {
        modelIds = (data as any)[key].map((m: any) => m.id || m.name || (typeof m === 'string' ? m : null)).filter(Boolean);
        if (modelIds.length > 0) break;
      }
    }
  }

  console.log(`[Genesis::API] fetchModels found ${modelIds.length} models: ${modelIds.slice(0, 10).join(', ')}${modelIds.length > 10 ? '...' : ''}`);

  if (modelIds.length === 0) {
    console.warn(`[Genesis::API] fetchModels: unrecognized response structure, raw keys: ${JSON.stringify(Object.keys(data))}`);
  }

  return [...new Set(modelIds)].sort();
}

function messagesToPayload(systemPrompt: string, messages: ApiMessage[], config: LLMConfig) {
  const apiMessages: ApiMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  return {
    model: config.model,
    messages: apiMessages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true,
  };
}

/**
 * Stream LLM response using XMLHttpRequest for true streaming in React Native.
 * XHR fires onreadystatechange with readyState=3 (loading) as data arrives.
 * We parse SSE lines from newly arrived bytes and push them into a queue
 * that the async generator yields from in real-time.
 */
export async function* streamChat(
  request: LLMRequest,
): AsyncGenerator<string, void, unknown> {
  const { systemPrompt, messages, config } = request;
  const url = buildUrl(config);
  const headers = buildHeaders(config);
  const body = JSON.stringify(messagesToPayload(systemPrompt, messages, config));

  console.log(`[Genesis::API] streamChat: POST ${url} model=${config.model}`);

  // Use XMLHttpRequest for true streaming in React Native
  if (typeof XMLHttpRequest !== 'undefined') {
    yield* streamViaXHR(url, headers, body);
    return;
  }

  // Fallback: fetch with ReadableStream
  if (typeof fetch !== 'undefined') {
    yield* streamViaFetch(url, headers, body);
    return;
  }

  throw new Error('No HTTP client available');
}

/**
 * True streaming via XMLHttpRequest: chunks are queued as they arrive
 * via onreadystatechange (readyState=3) and yielded immediately.
 */
function streamViaXHR(
  url: string,
  headers: Record<string, string>,
  body: string,
): AsyncGenerator<string, void, unknown> {
  const queue: string[] = [];
  let done = false;
  let error: Error | null = null;

  const onResolve = {
    resolve: null as ((v: unknown) => void) | null,
    reject: null as ((e: Error) => void) | null,
  };

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);

  for (const [key, value] of Object.entries(headers)) {
    xhr.setRequestHeader(key, value);
  }

  xhr.responseType = 'text';

  let processedLength = 0;

  xhr.onreadystatechange = () => {
    if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status >= 200 && xhr.status < 300) {
        const text = xhr.responseText;
        if (text.length > processedLength) {
          const newContent = text.slice(processedLength);
          processedLength = text.length;

          const sseLines = newContent.split('\n');
          for (const rawLine of sseLines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                queue.push(content);
                onResolve.resolve?.(undefined);
              }
            } catch { /* skip malformed SSE */ }
          }
        }

        if (xhr.readyState === XMLHttpRequest.DONE) {
          done = true;
          onResolve.resolve?.(undefined);
        }
      } else if (xhr.readyState === XMLHttpRequest.DONE) {
        error = new Error(`API error ${xhr.status}: ${xhr.responseText.slice(0, 200)}`);
        done = true;
        onResolve.resolve?.(undefined);
      }
    }
  };

  xhr.onerror = () => {
    error = new Error('网络请求失败');
    done = true;
    onResolve.resolve?.(undefined);
  };

  xhr.ontimeout = () => {
    error = new Error('请求超时');
    done = true;
    onResolve.resolve?.(undefined);
  };

  xhr.send(body);

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      return new Promise((resolve, reject) => {
        onResolve.resolve = resolve;
        onResolve.reject = reject;

        // Check if there's already data or we're done
        if (queue.length > 0 || done) {
          resolve(undefined);
        }
      }).then(() => {
        if (queue.length > 0) {
          return { value: queue.shift()!, done: false };
        }
        if (error) throw error;
        return { value: undefined, done: true };
      });
    },
    async return() {
      xhr.abort();
      return { value: undefined, done: true };
    },
    async throw(e: Error) {
      throw e;
    },
    [Symbol.asyncDispose]() {
      xhr.abort();
      return Promise.resolve();
    },
  };
}

async function* streamViaFetch(
  url: string,
  headers: Record<string, string>,
  body: string,
): AsyncGenerator<string, void, unknown> {
  // This path is for browsers that support ReadableStream on response.body
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body });
  } catch (e) {
    throw new Error(`网络请求失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  if (!response.body) {
    // No streaming support — parse full response
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content;
      if (content) yield content;
    } catch {
      yield text;
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
