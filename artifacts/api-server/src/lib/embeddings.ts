// Используем локальную модель через Ollama для экономии кредитов HF API
// nomic-embed-text - 768 измерений, отличная поддержка русского языка
const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

function normalizeNumberVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v) && v.every((x) => typeof x === "number")) return v as number[];
  if (typeof v === "object" && v && "embedding" in (v as any)) {
    const emb = (v as any).embedding;
    if (Array.isArray(emb) && emb.every((x: any) => typeof x === "number")) return emb as number[];
  }
  return null;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Пробуем сначала Ollama (бесплатно, локально)
  try {
    const embeddingModel = process.env.HF_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
    const ollamaUrl = `${OLLAMA_BASE_URL}/api/embeddings`;
    
    const res = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: embeddingModel,
        prompt: text
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.embedding) {
        return data.embedding as number[];
      }
    }
  } catch (e) {
    console.warn("Ollama embedding failed, falling back to HF:", e);
  }

  // Fallback на HF API (если Ollama недоступен)
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN must be set for embeddings");

  const embeddingModel = process.env.HF_EMBEDDING_MODEL ?? "sentence-transformers/multi-qa-mpnet-base-dot-v1";
  const apiUrl = `https://api-inference.huggingface.co/models/${embeddingModel}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`HF embedding failed: ${res.status} ${bodyText}`);
    }

    const data: unknown = await res.json();
    const normalized = normalizeNumberVector(data);
    if (normalized) return normalized;
    
    if (Array.isArray(data)) {
      if (data.length > 0 && Array.isArray(data[0])) {
        const first = data[0] as unknown[];
        if (first.every((x) => typeof x === "number")) return first as number[];
      }
      if (data.every((x) => typeof x === "number")) return data as number[];
    }

    throw new Error("Unknown HF embeddings response format");
  } finally {
    clearTimeout(timeout);
  }
}

