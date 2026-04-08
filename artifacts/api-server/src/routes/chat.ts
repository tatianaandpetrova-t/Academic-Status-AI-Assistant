import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatMessagesTable, applicationsTable, ragDocumentsTable, ragDocumentChunksTable } from "@workspace/db/schema";
import { cosineDistance, desc, asc, eq, sql, like, or, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { generateChatCompletionDetailed } from "../lib/llm";
import { generateEmbedding } from "../lib/embeddings";

const router: IRouter = Router();

// Базовый системный промпт: факты — из RAG; в ответе пользователю без технических идентификаторов
const BASE_SYSTEM_PROMPT = `Ты — ИИ-ассистент Университета ИТМО. Помогаешь с вопросами по нормативным документам и процедурам, связанным с учёными званиями, опираясь на фрагменты, которые система передаёт ниже.

Правила:
- Отвечай чётко и структурированно, используй markdown (заголовки ##, списки, **выделение**).
- При ссылке на документ в ответе пользователю используй только человекочитаемое название из пометки контекста («…») и при необходимости номер пункта/раздела из текста. Не указывай documentId, chunkIndex, chunk, внутренние коды и не копируй служебные строки с «---».
- Не выдумывай номера пунктов и цитаты, которых нет во фрагменте.
- Если в фрагментах нет ответа — скажи об этом явно.
- Когда просят дословную цитату — воспроизводи текст из фрагмента полностью, с нумерацией пункта и подпунктов (а), б), …), как в источнике.
- Не давай юридических заключений; только информационная помощь.`;

function humanizeRagSlug(s: string): string {
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/** Пытается взять официальный заголовок из начала текста документа */
function extractOfficialTitleFromContent(text: string): string | null {
  const head = text.slice(0, 12_000);
  const lines = head
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 45); i++) {
    const line = lines[i];
    if (line.length < 12 || line.length > 520) continue;
    if (/постановлени[ея]/i.test(line) && /правительств/i.test(line)) {
      const next = lines[i + 1];
      if (next && next.length < 140 && /(Российской|РФ|от\s+\d|№)/i.test(next)) {
        return `${line} ${next}`.replace(/\s+/g, " ").trim();
      }
      return line;
    }
    if (/^(ПРИКАЗ|РАСПОРЯЖЕНИЕ|УКАЗ|ФЕДЕРАЛЬНЫЙ\s+ЗАКОН)\b/i.test(line) && line.length < 420) {
      return line;
    }
  }
  for (const line of lines.slice(0, 18)) {
    if (line.length < 22 || line.length > 360) continue;
    const upper = (line.match(/[А-ЯЁ]/g) || []).length;
    const lower = (line.match(/[а-яё]/g) || []).length;
    if (upper > 0 && upper > lower * 2 && /[А-ЯЁ]{12,}/.test(line)) return line;
  }
  return null;
}

function ragDocumentDisplayTitle(d: {
  title: string;
  fileName: string;
  content: string | null | undefined;
}): string {
  const head = (d.content ?? "").slice(0, 12_000);
  const fromDoc = head.trim().length > 0 ? extractOfficialTitleFromContent(head) : null;
  if (fromDoc) return fromDoc.replace(/\s+/g, " ").trim();

  const title = (d.title ?? "").trim();
  const fileBase = (d.fileName ?? "").replace(/\.(docx|pdf|txt|md)$/i, "").trim();
  if (title.length > 0) return humanizeRagSlug(title);
  return humanizeRagSlug(fileBase || "Документ");
}

async function loadActiveRagDisplayTitles(): Promise<Map<number, string>> {
  const rows = await db
    .select({
      id: ragDocumentsTable.id,
      title: ragDocumentsTable.title,
      fileName: ragDocumentsTable.fileName,
      contentHead: sql<string>`left(coalesce(${ragDocumentsTable.content}, ''), 12000)`,
    })
    .from(ragDocumentsTable)
    .where(eq(ragDocumentsTable.isActive, true));

  const map = new Map<number, string>();
  for (const r of rows) {
    map.set(r.id, ragDocumentDisplayTitle({ title: r.title, fileName: r.fileName, content: r.contentHead }));
  }
  return map;
}

/** Совпадение point_number: одно значение или список «1, 2, 3» / «1,2,3» (без regex) */
function sqlPointNumberMatchesColumn(pointNumber: string) {
  const p = pointNumber.replace(/\D/g, "");
  if (!p) return sql`false`;
  return sql`(
    ${ragDocumentChunksTable.pointNumber} = ${p}
    OR ${ragDocumentChunksTable.pointNumber} LIKE ${`${p}, %`}
    OR ${ragDocumentChunksTable.pointNumber} LIKE ${`${p},%`}
    OR ${ragDocumentChunksTable.pointNumber} LIKE ${`%, ${p}, %`}
    OR ${ragDocumentChunksTable.pointNumber} LIKE ${`%,${p},%`}
    OR ${ragDocumentChunksTable.pointNumber} LIKE ${`%, ${p}`}
    OR ${ragDocumentChunksTable.pointNumber} LIKE ${`%,${p}`}
  )`;
}

function chunkRowMatchesPoint(pointNumber: string | null | undefined, requestedPoint: string): boolean {
  if (!pointNumber) return false;
  return pointNumber
    .split(",")
    .map((p) => p.trim())
    .includes(requestedPoint);
}

function mergeChunkTextsForPoint(
  rows: Array<{ chunkText: string; chunkIndex: number }>,
  requestedPoint: string,
): string {
  const esc = requestedPoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^\\s*${esc}[\\.\\)]\\s`);
  const sorted = [...rows].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const out: string[] = [];
  let seenHeader = false;
  for (const row of sorted) {
    const lines = row.chunkText.split("\n");
    let start = 0;
    if (seenHeader && lines[0] !== undefined && headerRe.test(lines[0])) {
      start = 1;
    }
    for (let i = start; i < lines.length; i++) {
      if (headerRe.test(lines[i])) seenHeader = true;
      out.push(lines[i]);
    }
  }
  return out.join("\n");
}

/** Вырезает один верхнеуровневый пункт от заголовка «N.» до следующего «M.» */
function sliceSinglePointBlock(merged: string, requestedPoint: string): string | null {
  const lines = merged.split("\n");
  const esc = requestedPoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^\\s*${esc}[\\.\\)]\\s`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (i > start) {
      const m = trimmed.match(/^(\d{1,3})[\.\)]\s/);
      if (m && m[1] !== requestedPoint) break;
    }
    body.push(lines[i]);
  }
  const text = body.join("\n").trim();
  return text.length > 0 ? text : null;
}

async function tryExtractFullPointFromRag(
  sortedChunks: Array<{
    documentId: number;
    documentTitle: string;
    chunkIndex: number;
    chunkText: string;
    pointNumber: string | null;
  }>,
  point: string,
  displayTitleByDocId: Map<number, string>,
): Promise<{ content: string; displayTitle: string; point: string } | null> {
  const anchor = sortedChunks.find((c) => chunkRowMatchesPoint(c.pointNumber, point));
  if (!anchor) return null;

  const rows = await db
    .select({
      chunkIndex: ragDocumentChunksTable.chunkIndex,
      chunkText: ragDocumentChunksTable.chunkText,
      pointNumber: ragDocumentChunksTable.pointNumber,
    })
    .from(ragDocumentChunksTable)
    .where(
      and(eq(ragDocumentChunksTable.documentId, anchor.documentId), sqlPointNumberMatchesColumn(point)),
    )
    .orderBy(asc(ragDocumentChunksTable.chunkIndex));

  const filtered = rows.filter((r) => chunkRowMatchesPoint(r.pointNumber, point));
  const merged = mergeChunkTextsForPoint(filtered, point);
  let sliced = sliceSinglePointBlock(merged, point);
  if (!sliced && filtered.length === 0) {
    const fromSearch = sortedChunks
      .filter(
        (c) => c.documentId === anchor.documentId && chunkRowMatchesPoint(c.pointNumber, point),
      )
      .map((c) => ({ chunkText: c.chunkText, chunkIndex: c.chunkIndex }));
    const m2 = mergeChunkTextsForPoint(fromSearch, point);
    sliced = sliceSinglePointBlock(m2, point);
  }
  if (!sliced) return null;

  const displayTitle =
    displayTitleByDocId.get(anchor.documentId) ?? humanizeRagSlug(anchor.documentTitle);
  return { content: sliced, displayTitle, point };
}

function formatExactPointQuoteForLlm(displayTitle: string, point: string, content: string): string {
  return `--- Дословная цитата пункта ${point}. Для пользователя укажи источник так: «${displayTitle}», пункт ${point}. Не пиши documentId, chunk, внутренние коды. ---\n${content}`;
}

function formatRagFragmentForLlm(
  displayTitle: string,
  body: string,
  meta?: { pointNumbers?: string | null; sectionTitle?: string | null },
): string {
  const bits: string[] = [];
  if (meta?.pointNumbers) bits.push(`фрагмент охватывает пункты: ${meta.pointNumbers}`);
  if (meta?.sectionTitle) bits.push(`раздел: ${meta.sectionTitle}`);
  const extra = bits.length ? ` ${bits.join("; ")}.` : "";
  return `--- Фрагмент документа.${extra} В ответе пользователю укажи источник: «${displayTitle}». Не пиши documentId, chunkIndex, chunk. ---\n${body}`;
}

// Fallback: подмешиваем текст всех активных документов
async function buildSystemPromptFallback(): Promise<string> {
  try {
    const ragDocs = await db.select()
      .from(ragDocumentsTable)
      .where(eq(ragDocumentsTable.isActive, true));

    const docsWithContent = ragDocs.filter(d => d.content && d.content.trim().length > 0);

    if (docsWithContent.length === 0) {
      return BASE_SYSTEM_PROMPT;
    }

    const ragContext = docsWithContent
      .map((d) =>
        formatRagFragmentForLlm(
          ragDocumentDisplayTitle({
            title: d.title,
            fileName: d.fileName,
            content: d.content,
          }),
          d.content!.slice(0, 8000),
        ),
      )
      .join("\n\n");

    return `${BASE_SYSTEM_PROMPT}

---
ДОПОЛНИТЕЛЬНЫЕ НОРМАТИВНЫЕ ДОКУМЕНТЫ ИТМО:

${ragContext}

При ответах используй информацию из этих документов в первую очередь, если она релевантна вопросу.`;
  } catch {
    return BASE_SYSTEM_PROMPT;
  }
}

/**
 * Полнотекстовый поиск с использованием триграммного индекса PostgreSQL
 * Возвращает чанки, которые содержат ключевые слова из запроса
 */
async function fullTextSearchChunks(query: string, topK: number) {
  // Извлекаем ключевые слова из запроса (минимум 2 символа для триграмм)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .filter(w => /[а-яa-z]/i.test(w));

  if (keywords.length === 0) return [];

  const conditions: ReturnType<typeof like>[] = [];
  for (const keyword of keywords) {
    for (const p of likePatternsForSearchToken(keyword)) {
      conditions.push(like(ragDocumentChunksTable.chunkText, `%${p}%`));
    }
  }

  const raw = await db
    .select({
      documentId: ragDocumentsTable.id,
      documentTitle: ragDocumentsTable.title,
      chunkIndex: ragDocumentChunksTable.chunkIndex,
      chunkText: ragDocumentChunksTable.chunkText,
      pointNumber: ragDocumentChunksTable.pointNumber,
      sectionTitle: ragDocumentChunksTable.sectionTitle,
    })
    .from(ragDocumentChunksTable)
    .innerJoin(ragDocumentsTable, eq(ragDocumentsTable.id, ragDocumentChunksTable.documentId))
    .where(and(
      eq(ragDocumentsTable.isActive, true),
      or(...conditions)
    ))
    .limit(topK * 10);

  return raw;
}

/**
 * Поиск по метаданным (номер пункта, заголовок раздела)
 */
async function searchByMetadata(query: string, topK: number) {
  // Извлекаем номер пункта из запроса
  const pointMatch = query.match(/(?:пункт|п\.?\s*|статья\s*|§\s*)(\d{1,3})/i);
  const pointNumber = pointMatch ? pointMatch[1] : null;

  // Извлекаем ключевые слова для поиска по разделам
  const sectionKeywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .filter(w => /[а-я]/i.test(w));

  // Ищем упоминания разделов в запросе (V, VI, VII и т.д.)
  const romanSectionMatch = query.match(/\b([IVXLCDM]+)\.\s*(?:раздел|глава|пункт)?/i);
  const sectionNameMatch = query.match(/раздел\s+([IVXLCDM]+)\.?/i);
  const romanRaw = romanSectionMatch?.[1] ?? sectionNameMatch?.[1];
  const romanNumeral = romanRaw ? romanRaw.toUpperCase() : null;

  const conditions: any[] = [eq(ragDocumentsTable.isActive, true)];

  if (pointNumber) {
    conditions.push(sqlPointNumberMatchesColumn(pointNumber));
  }

  // Ищем по ключевым словам в заголовке раздела ИЛИ в тексте чанка
  // Используем OR вместо AND для более широкого поиска
  if (sectionKeywords.length > 0) {
    const sectionConditions: any[] = [];

    // Ищем по ключевым словам в заголовке раздела
    for (const keyword of sectionKeywords.slice(0, 5)) {
      for (const p of likePatternsForSearchToken(keyword)) {
        sectionConditions.push(like(ragDocumentChunksTable.sectionTitle, `%${p}%`));
      }
    }

    for (const keyword of sectionKeywords.slice(0, 3)) {
      for (const p of likePatternsForSearchToken(keyword)) {
        sectionConditions.push(like(ragDocumentChunksTable.chunkText, `%${p}%`));
      }
    }

    if (sectionConditions.length > 0) {
      conditions.push(or(...sectionConditions));
    }
  }

  if (romanNumeral) {
    conditions.push(
      or(
        like(ragDocumentChunksTable.sectionTitle, `%${romanNumeral}.%`),
        like(ragDocumentChunksTable.chunkText, `%${romanNumeral}.%`),
        like(ragDocumentChunksTable.sectionTitle, `%раздел ${romanNumeral}%`),
        like(ragDocumentChunksTable.chunkText, `%раздел ${romanNumeral}%`),
        like(ragDocumentChunksTable.sectionTitle, `%глава ${romanNumeral}%`),
        like(ragDocumentChunksTable.chunkText, `%глава ${romanNumeral}%`),
      ),
    );
  }

  if (conditions.length <= 1) return [];

  try {
    const raw = await db
      .select({
        documentId: ragDocumentsTable.id,
        documentTitle: ragDocumentsTable.title,
        chunkIndex: ragDocumentChunksTable.chunkIndex,
        chunkText: ragDocumentChunksTable.chunkText,
        pointNumber: ragDocumentChunksTable.pointNumber,
        sectionTitle: ragDocumentChunksTable.sectionTitle,
      })
      .from(ragDocumentChunksTable)
      .innerJoin(ragDocumentsTable, eq(ragDocumentsTable.id, ragDocumentChunksTable.documentId))
      .where(and(...conditions))
      .limit(topK * 5);

    return raw;
  } catch {
    return [];
  }
}

async function buildSystemPromptWithVectorRag(userMessage: string): Promise<string> {
  const topK = 12;
  const similarityThreshold = 0.15;
  const quoteMode = isQuoteRequest(userMessage);
  const requestedPoints = extractRequestedPoints(userMessage);

  try {
    const displayTitleByDocId = await loadActiveRagDisplayTitles();

    // 1. Сначала пытаемся найти по метаданным (номер пункта, раздел)
    const metadataChunks = await searchByMetadata(userMessage, topK);
    
    // 2. Полнотекстовый поиск по ключевым словам
    const fullTextChunks = await fullTextSearchChunks(userMessage, topK);
    
    // 3. Семантический поиск через векторы
    let semanticChunks: Array<{
      documentId: number;
      documentTitle: string;
      chunkIndex: number;
      chunkText: string;
      pointNumber: string | null;
      sectionTitle: string | null;
      similarity: number;
    }> = [];

    try {
      const queryEmbedding = await generateEmbedding(userMessage);
      const similarity = sql<number>`1 - (${cosineDistance(ragDocumentChunksTable.embedding, queryEmbedding)})`;

      semanticChunks = await db
        .select({
          documentId: ragDocumentsTable.id,
          documentTitle: ragDocumentsTable.title,
          chunkIndex: ragDocumentChunksTable.chunkIndex,
          chunkText: ragDocumentChunksTable.chunkText,
          pointNumber: ragDocumentChunksTable.pointNumber,
          sectionTitle: ragDocumentChunksTable.sectionTitle,
          similarity,
        })
        .from(ragDocumentChunksTable)
        .innerJoin(ragDocumentsTable, eq(ragDocumentsTable.id, ragDocumentChunksTable.documentId))
        .where(eq(ragDocumentsTable.isActive, true))
        .orderBy((t) => desc(t.similarity))
        .limit(topK * 8);
    } catch (e) {
      console.warn("[chat] Semantic search failed:", e);
      semanticChunks = [];
    }

    // Объединяем все чанки
    const allChunks = new Map<string, {
      documentId: number;
      documentTitle: string;
      chunkIndex: number;
      chunkText: string;
      pointNumber: string | null;
      sectionTitle: string | null;
      score: number;
    }>();

    // Добавляем чанки из метаданных
    for (const c of metadataChunks) {
      const key = `${c.documentId}:${c.chunkIndex}`;
      const score = keywordScore(c.chunkText, userMessage) + (c.pointNumber ? 0.3 : 0);
      allChunks.set(key, {
        ...c,
        pointNumber: c.pointNumber,
        sectionTitle: c.sectionTitle,
        score,
      });
    }

    // Добавляем чанки из полнотекстового поиска
    for (const c of fullTextChunks) {
      const key = `${c.documentId}:${c.chunkIndex}`;
      const score = keywordScore(c.chunkText, userMessage);
      const existing = allChunks.get(key);
      if (!existing || score > existing.score) {
        allChunks.set(key, {
          ...c,
          pointNumber: c.pointNumber,
          sectionTitle: c.sectionTitle,
          score,
        });
      }
    }

    // Добавляем чанки из семантического поиска
    for (const c of semanticChunks) {
      const key = `${c.documentId}:${c.chunkIndex}`;
      const sim = Number(c.similarity);
      const score = sim * 0.7 + keywordScore(c.chunkText, userMessage) * 0.3;
      const existing = allChunks.get(key);
      if (!existing || score > existing.score) {
        allChunks.set(key, {
          ...c,
          pointNumber: c.pointNumber,
          sectionTitle: c.sectionTitle,
          score,
        });
      }
    }

    let sortedChunks = Array.from(allChunks.values())
      .filter(c => c.chunkText && c.chunkText.trim().length > 0)
      .sort((a, b) => b.score - a.score);

    if (requestedPoints.length > 0) {
      let exactHit: { content: string; displayTitle: string; point: string } | null = null;

      for (const point of requestedPoints) {
        const hit = await tryExtractFullPointFromRag(sortedChunks, point, displayTitleByDocId);
        if (hit) {
          exactHit = hit;
          break;
        }
      }

      // Если нашли точное содержимое - используем только его
      if (exactHit) {
        const ragContext = formatExactPointQuoteForLlm(
          exactHit.displayTitle,
          exactHit.point,
          exactHit.content,
        );

        const quoteInstructions = quoteMode
          ? `
КРИТИЧЕСКИ ВАЖНО ДЛЯ ЦИТИРОВАНИЯ:
- Пользователь запросил пункт ${requestedPoints.join(", ")} — приоритетная задача
- Ниже полный текст пункта из документа (все подпункты а), б), …). Воспроизведи ДОСЛОВНО, с первой строки «N.» включительно
- В ответе пользователю укажи только: «${exactHit.displayTitle}», пункт ${exactHit.point} — без технических идентификаторов и без строк «---»
- Не добавляй сведения из других пунктов`
          : `
КРИТИЧЕСКИ ВАЖНО:
- Выше полный текст запрошенного пункта; используй только его
- В ответе пользователю укажи источник: «${exactHit.displayTitle}», пункт ${exactHit.point}
- Не смешивай с другими пунктами`;

        return `${BASE_SYSTEM_PROMPT}

---
ЗАГРУЖЕННЫЕ НОРМАТИВНЫЕ ДОКУМЕНТЫ (приоритетный источник информации):

${ragContext}
${quoteInstructions}`;
      }
      
      // Если точного содержимого нет - фильтруем чанки, оставляя только те, что содержат запрошенный пункт
      sortedChunks = sortedChunks.filter(c => {
        if (!c.pointNumber) return false;
        const pointNumbers = c.pointNumber.split(',').map(p => p.trim());
        return requestedPoints.some(rp => pointNumbers.includes(rp));
      });
    }

    if (sortedChunks.length === 0) {
      return buildSystemPromptWithFullDocumentFallback(userMessage);
    }

    // Собираем контекст из отфильтрованных чанков
    const ragContext = sortedChunks
      .slice(0, 8)
      .map((c) => {
        const displayTitle =
          displayTitleByDocId.get(c.documentId) ?? humanizeRagSlug(c.documentTitle);
        return formatRagFragmentForLlm(displayTitle, c.chunkText.slice(0, 3000), {
          pointNumbers: c.pointNumber,
          sectionTitle: c.sectionTitle,
        });
      })
      .join("\n\n");

    const quoteInstructions = quoteMode && requestedPoints.length > 0
      ? `
КРИТИЧЕСКИ ВАЖНО ДЛЯ ЦИТИРОВАНИЯ:
- Пользователь запросил пункт ${requestedPoints.join(", ")}
- Найди в фрагментах полный текст пункта (от строки «N.» до следующего пункта) и воспроизведи ДОСЛОВНО, со всеми подпунктами
- В ответе пользователю укажи только название документа из пометки «…» и номер пункта — без documentId/chunk
- Не добавляй информацию из других фрагментов без отдельной ссылки`
      : `
КРИТИЧЕСКИ ВАЖНО:
- СНАЧАЛА используй факты из приведённых фрагментов документов
- Если прямого определения нет, но в фрагментах есть связанные требования, сроки или условия (например, про стаж в пунктах о критериях) — кратко собери ответ из этих фрагментов и укажи номера пунктов из текста
- Фразу «В предоставленных документах нет информации по этому вопросу» используй только если в переданных фрагментах действительно нет материала, относящегося к вопросу (ни прямого, ни косвенного)
- Цитируй дословно там, где это важно; не выдумывай номера пунктов
- Для пользователя указывай источник только как «название из пометки», при необходимости пункт/раздел из текста`;

    return `${BASE_SYSTEM_PROMPT}

---
ЗАГРУЖЕННЫЕ НОРМАТИВНЫЕ ДОКУМЕНТЫ (приоритетный источник информации):

${ragContext}
${quoteInstructions}`;
  } catch (err) {
    console.error("[chat] RAG error:", err);
    return buildSystemPromptWithFullDocumentFallback(userMessage);
  }
}

/**
 * Fallback: если поиск по чанкам не дал результатов, ищем по полному тексту документов
 */
async function buildSystemPromptWithFullDocumentFallback(userMessage: string): Promise<string> {
  try {
    const keywords = userMessage
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .filter(w => /[а-яa-z]/i.test(w));

    if (keywords.length === 0) {
      return buildSystemPromptFallback();
    }

    const conditions: ReturnType<typeof like>[] = [];
    for (const keyword of keywords) {
      for (const p of likePatternsForSearchToken(keyword)) {
        conditions.push(like(ragDocumentsTable.content, `%${p}%`));
      }
    }

    const docs = await db
      .select({
        title: ragDocumentsTable.title,
        fileName: ragDocumentsTable.fileName,
        content: ragDocumentsTable.content,
      })
      .from(ragDocumentsTable)
      .where(and(
        eq(ragDocumentsTable.isActive, true),
        or(...conditions)
      ))
      .limit(3);

    if (docs.length === 0) {
      return buildSystemPromptFallback();
    }

    const ragContext = docs
      .map((d) =>
        formatRagFragmentForLlm(
          ragDocumentDisplayTitle({
            title: d.title,
            fileName: d.fileName,
            content: d.content,
          }),
          d.content!.slice(0, 10000),
        ),
      )
      .join("\n\n");

    return `${BASE_SYSTEM_PROMPT}

---
НАЙДЕНЫ ДОКУМЕНТЫ ПО ПОЛНОМУ ТЕКСТУ:

${ragContext}

При ответах используй информацию из этих документов. Ищи конкретные пункты и разделы, соответствующие вопросу.`;
  } catch {
    return buildSystemPromptFallback();
  }
}

function normalizeTokenForSearch(token: string): string {
  return token.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");
}

/**
 * Варианты подстрок для LIKE по русским словам: точная форма + укороченные префиксы,
 * чтобы находить «педагогического» при запросе «педагогический» (без морфологического анализатора).
 */
function likePatternsForSearchToken(word: string): string[] {
  const w = word.toLowerCase();
  if (w.length < 4 || !/[а-яё]/i.test(w)) return [w];
  const patterns = new Set<string>([w]);
  if (w.length >= 6) patterns.add(w.slice(0, 6));
  if (w.length >= 8) patterns.add(w.slice(0, 8));
  if (w.length >= 10) patterns.add(w.slice(0, 10));
  return [...patterns].filter((p) => p.length >= 4);
}


/**
 * Извлекает номера пунктов из запроса пользователя
 * Поддерживает форматы: "пункт 22", "п.22", "п 22", "22", "статья 5", "§1"
 */
function extractRequestedPoints(query: string): string[] {
  const pattern = /(?:пункт\s+|п\.?\s*|статья\s+|§\s*)(\d{1,3})/gi;
  const matches: string[] = [];
  let match;
  while ((match = pattern.exec(query)) !== null) {
    if (match[1]) matches.push(match[1]);
  }
  // Если нет явных маркеров, ищем просто числа (для "что сказано в 22 пункте")
  if (matches.length === 0) {
    const numPattern = /\b(\d{1,3})\b/g;
    while ((match = numPattern.exec(query)) !== null) {
      const num = match[1];
      if (num && !/^(19|20)\d{2}$/.test(num)) {
        matches.push(num);
      }
    }
  }
  return [...new Set(matches)];
}

/**
 * Проверяет, запрашивает ли пользователь цитату или конкретный пункт
 */
function isQuoteRequest(query: string): boolean {
  const quotePatterns = [
    /процитируй/i,
    /цитат/i,
    /дословн/i,
    /точн/i,
    /что сказано/i,
    /гласит/i,
    /сказано/i,
    /какие\s+пункты/i,
    /какие\s+положения/i,
  ];
  return quotePatterns.some(p => p.test(query));
}

/**
 * Вычисляет score за соответствие номера пункта
 * Возвращает значение от 0 до 1
 */
function pointScore(text: string, query: string): number {
  const points = extractRequestedPoints(query);
  if (points.length === 0) return 0;
  
  const textLc = text.toLowerCase();
  let totalHit = 0;
  
  for (const p of points) {
    let hit = 0;
    
    // Проверяем различные форматы записи пунктов
    const patterns = [
      new RegExp(`пункт\\s+${p}[\\s\\.\\),]`, 'i'),
      new RegExp(`п\\.\\s*${p}[\\s\\.\\),]`, 'i'),
      new RegExp(`п\\s+${p}[\\s\\.\\),]`, 'i'),
      new RegExp(`^${p}\\.\\s`, 'm'),
      new RegExp(`^${p}\\)`, 'm'),
      new RegExp(`\\(${p}\\)`),
      new RegExp(`статья\\s+${p}[\\s\\.\\),]`, 'i'),
      new RegExp(`§\\s*${p}[\\s\\.\\),]`, 'i'),
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(textLc)) {
        hit = 1;
        break;
      }
    }
    
    totalHit += hit;
  }
  
  return totalHit / points.length;
}

/**
 * Улучшенная функция подсчета keyword score
 * Учитывает морфологию русского языка (базовая)
 */
function keywordScore(text: string, query: string): number {
  const textLc = text.toLowerCase();
  const queryTokens = Array.from(
    new Set(
      query
        .split(/\s+/)
        .map((t) => normalizeTokenForSearch(t))
        .filter((t) => t.length >= 2),  // Уменьшили порог с 3 до 2
    ),
  );
  if (queryTokens.length === 0) return 0;

  let score = 0;
  let matched = 0;
  
  for (const token of queryTokens) {
    // Прямое вхождение
    if (textLc.includes(token)) {
      matched += 1;
      continue;
    }
    
    // Проверяем вхождение без окончания (упрощенный стемминг)
    const stem = token.slice(0, -1);
    if (stem.length >= 2 && textLc.includes(stem)) {
      matched += 0.5;
    }
  }
  
  return matched / queryTokens.length;
}

// История чата пользователя
router.get("/chat/messages", requireAuth, async (req, res) => {
  try {
    const rawLimit = req.query.limit;
    const limit = typeof rawLimit === 'string' ? parseInt(rawLimit) : 50;

    const messages = await db.select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.userId, req.userId!))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(isNaN(limit) ? 50 : limit);

    res.json(messages.reverse().map(formatMessage));
  } catch (err) {
    req.log.error({ err }, "Ошибка получения чата");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Отправить вопрос ИИ-ассистенту
router.post("/chat/messages", requireAuth, async (req, res) => {
  try {
    const { message, contextAppId, debug } = req.body;

    if (!message?.trim()) {
      res.status(400).json({ error: "Введите вопрос" });
      return;
    }

    // Строим системный промпт с улучшенным RAG
    const systemPrompt = await buildSystemPromptWithVectorRag(message);

    // История последних сообщений для контекста
    const history = await db.select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.userId, req.userId!))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(5);

    const chatMessages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    // Добавляем историю переписки
    for (const h of history.reverse()) {
      chatMessages.push({ role: "user", content: h.message });
      chatMessages.push({ role: "assistant", content: h.response });
    }

    // Добавляем контекст из заявки, если указана
    if (contextAppId) {
      const [app] = await db.select()
        .from(applicationsTable)
        .where(eq(applicationsTable.id, contextAppId))
        .limit(1);

      if (app && app.userId === req.userId) {
        const appData = app.structuredDataJson as any;
        const result = app.resultJson as any;
        chatMessages.push({
          role: "user",
          content: `Контекст моей заявки на ${app.rankType === "docent" ? "доцента" : "профессора"}:
Результат проверки: ${result.status} (${result.score}%)
Критерии: ${result.criteriaBreakdown?.map((c: any) => `${c.label}: ${c.actual}/${c.required} — ${c.met ? "✓" : "✗"}`).join(", ")}
Рекомендации: ${result.recommendations?.join("; ")}`
        });
        chatMessages.push({ role: "assistant", content: "Вижу данные вашей заявки. Чем могу помочь?" });
      }
    }

    chatMessages.push({ role: "user", content: message });

    // Запрос к LLM
    const llm = await generateChatCompletionDetailed(chatMessages as any);
    const responseText = llm.text;

    // Сохраняем сообщение в БД
    const [saved] = await db.insert(chatMessagesTable).values({
      userId: req.userId!,
      message: message.trim(),
      response: responseText,
      contextAppId: contextAppId || null,
      rating: null,
    }).returning();

    const payload: any = formatMessage(saved);
    if (debug === true && req.userRole === "admin") {
      let ragChunks: any[] = [];
      try {
        const metadataChunks = await searchByMetadata(message, 4);
        const fullTextChunks = await fullTextSearchChunks(message, 4);
        ragChunks = [...metadataChunks, ...fullTextChunks].slice(0, 4).map(c => ({
          documentId: c.documentId,
          documentTitle: c.documentTitle,
          chunkIndex: c.chunkIndex,
          pointNumber: c.pointNumber,
          sectionTitle: c.sectionTitle,
          preview: c.chunkText.slice(0, 220),
        }));
      } catch {
        ragChunks = [];
      }
      payload.diagnostics = {
        provider: llm.diagnostics.provider,
        model: llm.diagnostics.model,
        latencyMs: llm.diagnostics.latencyMs,
        ragChunks,
      };
    }

    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "Ошибка отправки сообщения");
    res.status(500).json({ error: "Ошибка сервера при обращении к ИИ" });
  }
});

// Отладка RAG (только admin): показать выбранные чанки по вопросу.
router.post("/chat/rag-debug", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { message, topK } = req.body ?? {};
    if (!message?.trim()) {
      res.status(400).json({ error: "Введите вопрос" });
      return;
    }

    const limit = Math.min(Math.max(Number(topK) || 6, 1), 20);
    
    const metadataChunks = await searchByMetadata(message.trim(), limit);
    const fullTextChunks = await fullTextSearchChunks(message.trim(), limit);
    
    const allChunks = [...metadataChunks, ...fullTextChunks].slice(0, limit);

    res.json({
      message: message.trim(),
      topK: limit,
      metadataResults: metadataChunks.length,
      fullTextResults: fullTextChunks.length,
      chunks: allChunks.map((c) => ({
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        chunkIndex: c.chunkIndex,
        pointNumber: c.pointNumber,
        sectionTitle: c.sectionTitle,
        chunkText: c.chunkText,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка RAG debug");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Оценить ответ ИИ (👍/👎)
router.post("/chat/messages/:id/rate", requireAuth, async (req, res) => {
  try {
    const idParam = req.params.id;
    const id = typeof idParam === 'string' ? parseInt(idParam) : parseInt(String(idParam));
    const { rating } = req.body;

    if (![1, -1].includes(rating)) {
      res.status(400).json({ error: "Оценка должна быть 1 или -1" });
      return;
    }

    const [msg] = await db.select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.id, id))
      .limit(1);

    if (!msg || msg.userId !== req.userId) {
      res.status(404).json({ error: "Сообщение не найдено" });
      return;
    }

    const [updated] = await db.update(chatMessagesTable)
      .set({ rating })
      .where(eq(chatMessagesTable.id, id))
      .returning();

    res.json(formatMessage(updated!));
  } catch (err) {
    req.log.error({ err }, "Ошибка оценки сообщения");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

function formatMessage(msg: any) {
  return {
    id: msg.id,
    userId: msg.userId,
    message: msg.message,
    response: msg.response,
    contextAppId: msg.contextAppId,
    rating: msg.rating,
    createdAt: msg.createdAt,
  };
}

export default router;