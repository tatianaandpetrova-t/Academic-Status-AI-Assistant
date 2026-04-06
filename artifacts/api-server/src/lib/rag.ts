export function chunkText(text: string, opts?: { chunkSize?: number; overlap?: number }): string[] {
  // Оптимизированные параметры для русского языка и поиска конкретных пунктов
  const chunkSize = opts?.chunkSize ?? 1200;  // Увеличили для лучшего контекста
  const overlap = opts?.overlap ?? 400;       // Увеличили перекрытие

  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

