export function chunkText(text: string, opts?: { chunkSize?: number; overlap?: number }): string[] {
  // Оптимизированные параметры для поиска по нормативным пунктам.
  const chunkSize = opts?.chunkSize ?? 1400;
  const overlap = opts?.overlap ?? 300;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();
  if (!normalized) return [];

  // Стараемся резать по "пунктам"/абзацам, чтобы цитаты не рвались посередине.
  const blocks = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const ready = current.trim();
    if (ready.length > 0) chunks.push(ready);
  };

  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length <= chunkSize) {
      current = next;
      continue;
    }

    flush();

    // Если абзац слишком длинный, режем по символам с overlap.
    if (block.length > chunkSize) {
      let start = 0;
      while (start < block.length) {
        const end = Math.min(start + chunkSize, block.length);
        const piece = block.slice(start, end).trim();
        if (piece) chunks.push(piece);
        if (end === block.length) break;
        start = Math.max(0, end - overlap);
      }
      current = "";
      continue;
    }

    // Переносим последний кусок overlap в новый чанк для связности.
    const overlapSeed =
      chunks.length > 0 && overlap > 0
        ? chunks[chunks.length - 1].slice(Math.max(0, chunks[chunks.length - 1].length - overlap)).trim()
        : "";
    current = overlapSeed ? `${overlapSeed}\n\n${block}` : block;
  }

  flush();
  return chunks.filter((c) => c.trim().length > 0);
}

