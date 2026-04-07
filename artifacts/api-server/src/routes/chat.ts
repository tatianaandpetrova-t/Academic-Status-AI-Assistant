import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatMessagesTable, applicationsTable, ragDocumentsTable, ragDocumentChunksTable } from "@workspace/db/schema";
import { cosineDistance, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { generateChatCompletionDetailed } from "../lib/llm";
import { generateEmbedding } from "../lib/embeddings";

const router: IRouter = Router();

// Базовый системный промпт для ИИ-ассистента
const BASE_SYSTEM_PROMPT = `Ты — ИИ-ассистент Университета ИТМО, специализирующийся на вопросах получения учёных званий (доцент, профессор).

Ты помогаешь преподавателям разобраться в:
1. Критериях и требованиях для получения учёного звания согласно Постановлению Правительства РФ от 20.10.2023 №1746 (ред. от 17.02.2026) "О порядке присвоения ученых званий"
2. Процедуре подачи заявки в ИТМО
3. Трактовке понятий "педагогический стаж", "научно-педагогический стаж", публикации и т.д.
4. Требуемых документах
5. Особенностях процедуры в ИТМО

Правила:
- Отвечай чётко, структурированно, используй markdown форматирование (заголовки ##, списки -, жирный **текст**)
- Ссылайся на нормативные документы когда это уместно
- Если вопрос выходит за рамки компетенции — скажи об этом
- Не давай юридических советов, только информационную помощь

Основные критерии (Постановление Правительства РФ №1746):

**ДОЦЕНТ:**
- Стаж научно-педагогической работы: ≥ 5 лет
- Стаж педагогической работы по специальности: ≥ 3 лет
- Публикации в рецензируемых изданиях: ≥ 10 за последние 5 лет
- Учебные издания: ≥ 2 за 3 года
- Публикации в Scopus/WoS: ≥ 2
- Учёная степень: кандидат наук

**ПРОФЕССОР:**
- Стаж научно-педагогической работы: ≥ 10 лет
- Стаж педагогической работы по специальности: ≥ 5 лет
- Публикации в рецензируемых изданиях: ≥ 20 за последние 5 лет
- Учебные издания: ≥ 3 за 5 лет
- Публикации в Scopus/WoS: ≥ 5
- Учёная степень: доктор наук
- Подготовка аспирантов: ≥ 1 защитившегося`;

// Старое поведение (fallback): подмешиваем текст всех активных документов.
async function buildSystemPromptFallback(): Promise<string> {
  try {
    const ragDocs = await db.select()
      .from(ragDocumentsTable)
      .where(eq(ragDocumentsTable.isActive, true));

    const docsWithContent = ragDocs.filter(d => d.content && d.content.trim().length > 0);

    if (docsWithContent.length === 0) {
      return BASE_SYSTEM_PROMPT;
    }

    // Добавляем контент нормативных документов в промпт
    const ragContext = docsWithContent.map(d =>
      `--- ДОКУМЕНТ: ${d.title} ---\n${d.content!.slice(0, 8000)}\n---`
    ).join("\n\n");

    return `${BASE_SYSTEM_PROMPT}

---
ДОПОЛНИТЕЛЬНЫЕ НОРМАТИВНЫЕ ДОКУМЕНТЫ ИТМО:

${ragContext}

При ответах используй информацию из этих документов в первую очередь, если она релевантна вопросу.`;
  } catch {
    return BASE_SYSTEM_PROMPT;
  }
}

async function buildSystemPromptWithVectorRag(userMessage: string): Promise<string> {
  const topK = 12;
  const similarityThreshold = 0.18;

  try {
    const chunks = await selectRagChunks(userMessage, topK * 3);

    const validChunks = chunks
      .map((c) => c.chunkText)
      .filter((t) => !!t && t.trim().length > 0);

    if (validChunks.length === 0) return buildSystemPromptFallback();

    const ragContext = chunks
      .filter((c) => c.score >= similarityThreshold)
      .slice(0, topK)
      .map(
        (c, idx) =>
          `[SOURCE_${idx + 1}] ДОКУМЕНТ: ${c.documentTitle}; ФРАГМЕНТ: ${c.chunkIndex}; SCORE: ${c.score.toFixed(3)}; KEYWORD: ${c.keywordScore.toFixed(3)}; SEMANTIC: ${c.semanticScore.toFixed(3)}\n${c.chunkText.slice(0, 2200)}`,
      )
      .join("\n\n");

    if (!ragContext.trim()) return buildSystemPromptFallback();

    return `${BASE_SYSTEM_PROMPT}

---
ДОПОЛНИТЕЛЬНЫЕ НОРМАТИВНЫЕ ДОКУМЕНТЫ ИТМО (по релевантности):

${ragContext}

КРИТИЧЕСКИ ВАЖНО:
- СНАЧАЛА используй факты из приведённых фрагментов документов (они приоритетнее любых общих знаний)
- Если точного ответа нет в предоставленных фрагментах — скажи "В предоставленных документах нет информации по этому вопросу"
- ЦИТИРУЙ дословно текст документа, не выдумывай и не обобщай
- Если просит процитировать конкретный пункт — найди и приведи ТОЧНУЮ цитату из документа
- В конце каждого содержательного утверждения ставь ссылку на источник в формате [SOURCE_N]
- Не используй общие знания или предположения`;
  } catch {
    return buildSystemPromptFallback();
  }
}

function normalizeTokenForSearch(token: string): string {
  return token.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");
}

function extractRequestedPoints(query: string): string[] {
  const matches = query.match(/(?:пункт|п\.?)\s*(\d{1,3})/gi) ?? [];
  return matches
    .map((m) => m.match(/(\d{1,3})/)?.[1] ?? "")
    .filter(Boolean);
}

function pointScore(text: string, query: string): number {
  const points = extractRequestedPoints(query);
  if (points.length === 0) return 0;
  const textLc = text.toLowerCase();
  let hit = 0;
  for (const p of points) {
    const patterns = [
      `пункт ${p}`,
      `п. ${p}`,
      `п.${p}`,
      `${p}.`,
      `(${p})`,
    ];
    if (patterns.some((pt) => textLc.includes(pt))) hit += 1;
  }
  return hit / points.length;
}

function keywordScore(text: string, query: string): number {
  const textLc = text.toLowerCase();
  const queryTokens = Array.from(
    new Set(
      query
        .split(/\s+/)
        .map((t) => normalizeTokenForSearch(t))
        .filter((t) => t.length >= 3),
    ),
  );
  if (queryTokens.length === 0) return 0;

  let score = 0;
  for (const token of queryTokens) {
    if (textLc.includes(token)) score += 1;
  }
  return score / queryTokens.length;
}

async function selectRagChunks(userMessage: string, topK = 12) {
  const lexicalRaw = await db
    .select({
      documentId: ragDocumentsTable.id,
      documentTitle: ragDocumentsTable.title,
      chunkIndex: ragDocumentChunksTable.chunkIndex,
      chunkText: ragDocumentChunksTable.chunkText,
    })
    .from(ragDocumentChunksTable)
    .innerJoin(ragDocumentsTable, eq(ragDocumentsTable.id, ragDocumentChunksTable.documentId))
    .where(eq(ragDocumentsTable.isActive, true))
    .limit(Math.max(topK * 12, 200));

  const lexicalScored = lexicalRaw
    .map((c) => {
      const kScore = keywordScore(c.chunkText, userMessage);
      const pScore = pointScore(c.chunkText, userMessage);
      const combinedKeyword = kScore * 0.75 + pScore * 0.25;
      return {
        ...c,
        keywordScore: combinedKeyword,
        semanticScore: 0,
        similarity: 0,
        score: combinedKeyword,
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 4);

  let semanticScored: Array<{
    documentId: number;
    documentTitle: string;
    chunkIndex: number;
    chunkText: string;
    keywordScore: number;
    semanticScore: number;
    similarity: number;
    score: number;
  }> = [];

  try {
    const queryEmbedding = await generateEmbedding(userMessage);
    const similarity = sql<number>`1 - (${cosineDistance(ragDocumentChunksTable.embedding, queryEmbedding)})`;

    const semanticRaw = await db
      .select({
        documentId: ragDocumentsTable.id,
        documentTitle: ragDocumentsTable.title,
        chunkIndex: ragDocumentChunksTable.chunkIndex,
        chunkText: ragDocumentChunksTable.chunkText,
        similarity,
      })
      .from(ragDocumentChunksTable)
      .innerJoin(ragDocumentsTable, eq(ragDocumentsTable.id, ragDocumentChunksTable.documentId))
      .where(eq(ragDocumentsTable.isActive, true))
      .orderBy((t) => desc(t.similarity))
      .limit(topK * 8);

    semanticScored = semanticRaw.map((c) => {
      const sim = Number(c.similarity);
      const kScore = keywordScore(c.chunkText, userMessage);
      const pScore = pointScore(c.chunkText, userMessage);
      const combinedKeyword = kScore * 0.7 + pScore * 0.3;
      return {
        ...c,
        keywordScore: combinedKeyword,
        semanticScore: sim,
        score: sim * 0.75 + combinedKeyword * 0.25,
      };
    });
  } catch {
    // Важный fallback: RAG остаётся рабочим даже без embedding-провайдера.
    semanticScored = [];
  }

  const merged = new Map<string, (typeof lexicalScored)[number]>();
  for (const c of [...semanticScored, ...lexicalScored]) {
    const key = `${c.documentId}:${c.chunkIndex}`;
    const prev = merged.get(key);
    if (!prev || c.score > prev.score) merged.set(key, c);
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// История чата пользователя
router.get("/chat/messages", requireAuth, async (req, res) => {
  try {
    const { limit = "50" } = req.query;

    const messages = await db.select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.userId, req.userId!))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(parseInt(limit as string));

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

    // Строим системный промпт с pgvector-RAG
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

    // Запрос к LLM (HF -> local Qwen fallback)
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
        ragChunks = await selectRagChunks(message, 4);
      } catch {
        ragChunks = [];
      }
      payload.diagnostics = {
        provider: llm.diagnostics.provider,
        model: llm.diagnostics.model,
        latencyMs: llm.diagnostics.latencyMs,
        ragChunks: ragChunks.map((c) => ({
          documentId: c.documentId,
          documentTitle: c.documentTitle,
          chunkIndex: c.chunkIndex,
          similarity: Number(c.similarity),
          preview: c.chunkText.slice(0, 220),
        })),
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
    const chunks = await selectRagChunks(message.trim(), limit);

    res.json({
      message: message.trim(),
      topK: limit,
      chunks: chunks.map((c) => ({
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        chunkIndex: c.chunkIndex,
        similarity: Number(c.similarity),
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
    const id = parseInt(req.params.id);
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
