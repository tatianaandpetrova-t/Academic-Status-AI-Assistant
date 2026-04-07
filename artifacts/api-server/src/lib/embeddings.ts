// Используем локальную модель через Ollama для экономии кредитов HF API
// nomic-embed-text - 768 измерений, отличная поддержка русского языка
const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBEDDING_DIMENSIONS = 768;
export type EmbeddingProvider = "ollama" | "yandex" | "hf" | "deterministic";

function normalizeNumberVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v) && v.every((x) => typeof x === "number")) return v as number[];
  if (typeof v === "object" && v && "embedding" in (v as any)) {
    const emb = (v as any).embedding;
    if (Array.isArray(emb) && emb.every((x: any) => typeof x === "number")) return emb as number[];
  }
  return null;
}

function toFixedDimensions(v: number[], dimensions = EMBEDDING_DIMENSIONS): number[] {
  if (v.length === dimensions) return v;
  if (v.length > dimensions) return v.slice(0, dimensions);
  return [...v, ...new Array(dimensions - v.length).fill(0)];
}

function fallbackDeterministicEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    const idx = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    vector[idx] += ((hash % 1000) / 1000);
  }

  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  return vector.map((x) => x / norm);
}

export async function generateEmbeddingDetailed(
  text: string,
): Promise<{ embedding: number[]; provider: EmbeddingProvider }> {
  // Пробуем сначала Ollama (бесплатно, локально)
  try {
    const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
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
      const data: any = await res.json();
      if (data.embedding) {
        return { embedding: toFixedDimensions(data.embedding as number[]), provider: "ollama" };
      }
    }
  } catch (e) {
    console.warn("Ollama embedding failed, falling back to HF:", e);
  }

  // Fallback на Yandex Embeddings
  try {
    const yandexKey = process.env.YANDEX_API_KEY;
    const folderId = process.env.YANDEX_FOLDER_ID;
    if (yandexKey && folderId) {
      const yandexModel = process.env.YANDEX_EMBEDDING_MODEL ?? "text-search-query";
      const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding", {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${yandexKey}`,
          "Content-Type": "application/json",
          "x-folder-id": folderId,
        },
        body: JSON.stringify({
          modelUri: `emb://${folderId}/${yandexModel}`,
          text,
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        if (Array.isArray(data?.embedding) && data.embedding.every((x: any) => typeof x === "number")) {
          return { embedding: toFixedDimensions(data.embedding as number[]), provider: "yandex" };
        }
      }
    }
  } catch (e) {
    console.warn("Yandex embedding failed, falling back to HF:", e);
  }

  // Fallback на HF API (если Ollama недоступен)
  const token = process.env.HF_TOKEN;
  if (!token) {
    console.warn("No HF_TOKEN for embeddings, using deterministic fallback embedding");
    return { embedding: fallbackDeterministicEmbedding(text), provider: "deterministic" };
  }

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
    if (normalized) return { embedding: toFixedDimensions(normalized), provider: "hf" };
    
    if (Array.isArray(data)) {
      if (data.length > 0 && Array.isArray(data[0])) {
        const first = data[0] as unknown[];
        if (first.every((x) => typeof x === "number")) {
          return { embedding: toFixedDimensions(first as number[]), provider: "hf" };
        }
      }
      if (data.every((x) => typeof x === "number")) {
        return { embedding: toFixedDimensions(data as number[]), provider: "hf" };
      }
    }

    console.warn("Unknown HF embeddings response format, using deterministic fallback embedding");
    return { embedding: fallbackDeterministicEmbedding(text), provider: "deterministic" };
  } catch (e) {
    console.warn("HF embedding failed, using deterministic fallback embedding:", e);
    return { embedding: fallbackDeterministicEmbedding(text), provider: "deterministic" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await generateEmbeddingDetailed(text);
  return result.embedding;
}

