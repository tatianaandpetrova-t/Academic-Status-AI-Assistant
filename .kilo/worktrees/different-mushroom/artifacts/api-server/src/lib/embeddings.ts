// Модель должна:
// 1) нормально работать через HF Router `hf-inference` с payload `{ inputs: text }`
// 2) возвращать вектор длины 384 (под pgvector schema)
const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";

function normalizeNumberVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v) && v.every((x) => typeof x === "number")) return v as number[];
  // иногда бывает { embedding: [...] }
  if (typeof v === "object" && v && "embedding" in (v as any)) {
    const emb = (v as any).embedding;
    if (Array.isArray(emb) && emb.every((x: any) => typeof x === "number")) return emb as number[];
  }
  return null;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN must be set for embeddings");

  const embeddingModel = process.env.HF_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const apiUrl =
    process.env.HF_EMBEDDING_API_URL ??
    `https://api-inference.huggingface.co/models/${embeddingModel}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  const post = async (api: string, body: Record<string, unknown>) => {
    const res = await fetch(api, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`HF embedding failed: ${res.status} ${bodyText}`);
    }

    return res.json();
  };

  try {
    const routerBase = "https://router.huggingface.co/hf-inference";
    const routerApiUrl2 = `${routerBase}/models/${embeddingModel}`;

    // Последовательно пробуем форматы, которые используют разные HF inference providers.
    const candidates = [
      { api: apiUrl, body: { inputs: text } },
      { api: apiUrl, body: { sentences: [text] } },
      { api: routerApiUrl2, body: { inputs: text } },
      { api: routerApiUrl2, body: { sentences: [text] } },
      { api: routerApiUrl2, body: { inputs: text } },
      { api: routerApiUrl2, body: { sentences: [text] } },
    ];

    let lastErr: unknown = null;
    for (const c of candidates) {
      try {
        const data: unknown = await post(c.api, c.body);

        // Варианты ответа:
        // - [0.1, 0.2, ...]
        // - { embedding: [..] }
        // - [[..]] (если вернули батч)
        if (Array.isArray(data)) {
          if (data.length > 0 && Array.isArray(data[0])) {
            const first = data[0] as unknown[];
            if (first.every((x) => typeof x === "number")) return first as number[];
          }
          if (data.every((x) => typeof x === "number")) return data as number[];
        }

        const normalized = normalizeNumberVector(data);
        if (normalized) return normalized;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr ?? new Error("Unknown HF embeddings response format");
  } finally {
    clearTimeout(timeout);
  }
}

