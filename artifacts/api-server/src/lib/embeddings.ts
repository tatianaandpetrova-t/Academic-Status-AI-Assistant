// Используем Yandex Embeddings как основной провайдер
// text-search-query - 768 измерений, отличная поддержка русского языка
const EMBEDDING_DIMENSIONS = 768;
export type EmbeddingProvider = "yandex" | "deterministic";

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

let yandexEmbeddingFailed = false;
let yandexEmbeddingFailCount = 0;
const MAX_FAIL_COUNT = 5;

export async function generateEmbeddingDetailed(
  text: string,
): Promise<{ embedding: number[]; provider: EmbeddingProvider }> {
  // Если Yandex уже много раз подряд не работал, сразу используем fallback
  if (yandexEmbeddingFailed && yandexEmbeddingFailCount >= MAX_FAIL_COUNT) {
    return { embedding: fallbackDeterministicEmbedding(text), provider: "deterministic" };
  }

  // Используем Yandex Embeddings как основной провайдер
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
          text: text,
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        if (Array.isArray(data?.embedding) && data.embedding.every((x: any) => typeof x === "number")) {
          // Сбрасываем счетчик ошибок при успешном запросе
          yandexEmbeddingFailed = false;
          yandexEmbeddingFailCount = 0;
          return { embedding: toFixedDimensions(data.embedding as number[]), provider: "yandex" };
        }
      } else {
        yandexEmbeddingFailCount++;
        console.warn(`Yandex embedding failed with status ${res.status}, fail count: ${yandexEmbeddingFailCount}`);
        if (yandexEmbeddingFailCount >= MAX_FAIL_COUNT) {
          yandexEmbeddingFailed = true;
          console.warn("Yandex embedding disabled after multiple failures, using deterministic fallback");
        }
      }
    }
  } catch (e) {
    yandexEmbeddingFailCount++;
    console.warn(`Yandex embedding failed (error ${yandexEmbeddingFailCount}):`, (e as Error).message);
    if (yandexEmbeddingFailCount >= MAX_FAIL_COUNT) {
      yandexEmbeddingFailed = true;
      console.warn("Yandex embedding disabled after multiple failures, using deterministic fallback");
    }
  }

  // Fallback на детерминированные эмбеддинги
  console.warn("Using deterministic fallback embedding");
  return { embedding: fallbackDeterministicEmbedding(text), provider: "deterministic" };
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await generateEmbeddingDetailed(text);
  return result.embedding;
}