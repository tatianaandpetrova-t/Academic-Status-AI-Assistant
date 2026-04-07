import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ragDocumentsTable, ragDocumentChunksTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { chunkText } from "../lib/rag";
import { generateEmbeddingDetailed, type EmbeddingProvider } from "../lib/embeddings";

const router: IRouter = Router();
const DEFAULT_MAX_CONTENT_CHARS = 200_000;
const HARD_MAX_CONTENT_CHARS = 1_000_000;
const DEFAULT_MAX_CHUNKS = 200;

function getMaxContentChars(): number {
  const raw = process.env.RAG_MAX_CONTENT_CHARS;
  const parsed = raw ? Number(raw) : DEFAULT_MAX_CONTENT_CHARS;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_CONTENT_CHARS;
  return Math.min(Math.floor(parsed), HARD_MAX_CONTENT_CHARS);
}

function getMaxChunks(): number {
  const raw = process.env.RAG_MAX_CHUNKS;
  const parsed = raw ? Number(raw) : DEFAULT_MAX_CHUNKS;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_CHUNKS;
  return Math.min(Math.floor(parsed), 200);
}

// pdf-parse в bundled `dist` может не найти worker по относительному пути,
// поэтому явно задаём workerSrc на файл внутри pdf-parse.
try {
  const require = createRequire(import.meta.url);
  const workerEntryPath = require.resolve("pdf-parse/worker");
  const workerDir = path.dirname(workerEntryPath);
  const workerPath = path.resolve(workerDir, "..", "pdf.worker.mjs");
  const workerUrl = pathToFileURL(workerPath).href;
  PDFParse.setWorker(workerUrl);
  console.info("[rag] pdf-parse workerSrc set to", workerUrl);
} catch (e) {
  console.error("[rag] Failed to set pdf-parse workerSrc", {
    message: (e as Error)?.message ?? String(e),
  });
}

// Папка для нормативных документов
const ragUploadDir = "./uploads/rag";
if (!fs.existsSync(ragUploadDir)) {
  fs.mkdirSync(ragUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ragUploadDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".txt", ".md"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только PDF, DOCX, TXT, MD файлы"));
    }
  },
});

// Извлечение текста из документа (исправленная версия)
async function extractTextFromFile(filePath: string, _mimeType: string): Promise<string> {
  try {
    const maxChars = getMaxContentChars();
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === ".txt" || ext === ".md") {
      const buffer = fs.readFileSync(filePath);
      
      // Пробуем разные кодировки в порядке приоритета
      const encodings = ['utf8', 'windows-1251', 'cp866'];
      
      for (const encoding of encodings) {
        try {
          let content: string;
          
          if (encoding === 'utf8') {
            content = buffer.toString('utf8');
          } else {
            const decoder = new TextDecoder(encoding);
            content = decoder.decode(buffer);
          }
          
          // Проверяем, что текст выглядит как русский (содержит нормальные буквы)
          const hasRussianLetters = /[а-яА-ЯёЁ]/.test(content);
          const hasMojibake = /╧|╨|╚|√|─|┐|╘|╤|╥|╦|╩|╪/.test(content);
          
          if (hasRussianLetters && !hasMojibake) {
            return content.slice(0, maxChars);
          }
        } catch (e) {
          continue;
        }
      }
      
      return buffer.toString('utf8').slice(0, maxChars);
    }

    if (ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: buffer } as any);
      const data = await parser.getText();
      return (data.text ?? "").slice(0, maxChars);
    }

    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      return (result.value ?? "").slice(0, maxChars);
    }

    // .doc бинарный формат не поддерживаем надёжно без внешних утилит.
    return "";
  } catch (e) {
    console.error("[rag] extractTextFromFile failed", {
      filePath,
      ext: path.extname(filePath).toLowerCase(),
      message: (e as Error)?.message ?? String(e),
    });
    return "";
  }
}

async function rebuildDocumentChunks(
  documentId: number,
  content: string,
  req: any,
): Promise<{
  insertedChunks: number;
  providers: Record<EmbeddingProvider, number>;
  totalChunks: number;
  rawChunks: number;
  truncated: boolean;
}> {
  await db.delete(ragDocumentChunksTable).where(eq(ragDocumentChunksTable.documentId, documentId));

  const rawChunks = chunkText(content, { chunkSize: 1200, overlap: 250 });
  const maxChunks = getMaxChunks();
  const chunks = rawChunks.slice(0, maxChunks);
  let insertedChunks = 0;
  const providers: Record<EmbeddingProvider, number> = {
    ollama: 0,
    yandex: 0,
    hf: 0,
    deterministic: 0,
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const { embedding, provider } = await generateEmbeddingDetailed(chunk);
      await db.insert(ragDocumentChunksTable).values({
        documentId,
        chunkIndex: i,
        chunkText: chunk,
        embedding,
        isActive: true,
      });
      providers[provider] += 1;
      insertedChunks += 1;
    } catch (e) {
      req.log.warn({ err: e, chunkIndex: i, documentId }, "Failed to generate/insert embeddings for chunk");
    }
  }

  return {
    insertedChunks,
    providers,
    totalChunks: chunks.length,
    rawChunks: rawChunks.length,
    truncated: rawChunks.length > maxChunks,
  };
}

// Получить список нормативных документов (только admin)
router.get("/admin/rag-documents", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const docs = await db.select().from(ragDocumentsTable).orderBy(ragDocumentsTable.uploadedAt);
    const docIds = docs.map((d) => d.id);
    const chunks = docIds.length
      ? await db
          .select({
            documentId: ragDocumentChunksTable.documentId,
            chunkIndex: ragDocumentChunksTable.chunkIndex,
            chunkText: ragDocumentChunksTable.chunkText,
          })
          .from(ragDocumentChunksTable)
          .where(inArray(ragDocumentChunksTable.documentId, docIds))
          .orderBy(ragDocumentChunksTable.chunkIndex)
      : [];

    const chunksByDocId = new Map<number, string[]>();
    for (const c of chunks) {
      if (!chunksByDocId.has(c.documentId)) chunksByDocId.set(c.documentId, []);
      chunksByDocId.get(c.documentId)!.push(c.chunkText);
    }

    res.json(
      docs.map((d) => {
        const reconstructed = chunksByDocId.get(d.id)?.join("\n\n") ?? "";
        const baseContent = d.content ?? "";
        const resolvedContent = baseContent.trim().length > 0 ? baseContent : reconstructed;

        return {
          id: d.id,
          title: d.title,
          description: d.description,
          fileName: d.fileName,
          fileUrl: d.fileUrl,
          fileType: d.fileType,
          content: resolvedContent,
          hasContent: resolvedContent.trim().length > 0,
          contentLength: resolvedContent.length,
          isActive: d.isActive,
          uploadedAt: d.uploadedAt,
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Ошибка получения RAG документов");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Загрузить нормативный документ (только admin)
router.post("/admin/rag-documents/upload", requireAuth, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Файл не загружен" });
      return;
    }

    const { title, description } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "Укажите название документа" });
      return;
    }

    const fileUrl = `/api/admin/rag-documents/file/${req.file.filename}`;
    const content = await extractTextFromFile(req.file.path, req.file.mimetype);

    if (!content || content.trim().length < 50) {
      res.status(400).json({
        error:
          "Не удалось извлечь текст из файла. Поддерживаются PDF/TXT/MD/DOCX (для .doc сначала сохраните как .docx).",
      });
      return;
    }

    const chunks = chunkText(content, { chunkSize: 1200, overlap: 250 }).slice(0, getMaxChunks());
    if (chunks.length === 0) {
      res.status(400).json({ error: "После обработки документ не содержит пригодных фрагментов для RAG" });
      return;
    }

    const [doc] = await db.insert(ragDocumentsTable).values({
      title: title.trim(),
      description: description?.trim() || null,
      fileName: req.file.originalname,
      fileUrl,
      fileType: req.file.mimetype,
      content: content || null,
      isActive: true,
      uploadedBy: req.userId,
    }).returning();

    const indexing = await rebuildDocumentChunks(doc.id, content, req);

    if (indexing.insertedChunks === 0) {
      await db.delete(ragDocumentsTable).where(eq(ragDocumentsTable.id, doc.id));
      res.status(500).json({ error: "Не удалось построить индекс документа (эмбеддинги не создались)" });
      return;
    }

    res.status(201).json({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      fileType: doc.fileType,
      hasContent: !!doc.content,
      contentLength: doc.content?.length || 0,
      isActive: doc.isActive,
      uploadedAt: doc.uploadedAt,
      indexing,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка загрузки RAG документа");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Обновить содержимое документа вручную
router.put("/admin/rag-documents/:id/content", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { content, title, description, isActive } = req.body;

    const updates: any = {};
    if (content !== undefined) updates.content = content;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db.update(ragDocumentsTable)
      .set(updates)
      .where(eq(ragDocumentsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Документ не найден" });
      return;
    }

    if (updates.content !== undefined) {
      const newContent = typeof content === "string" ? content : updated.content;
      if (newContent && newContent.trim().length > 0) {
        const indexing = await rebuildDocumentChunks(id, newContent, req);

        if (indexing.insertedChunks === 0) {
          res.status(500).json({ error: "Не удалось переиндексировать документ: эмбеддинги не создались" });
          return;
        }
        (updated as any)._indexing = indexing;
      }
    }

    res.json({
      id: updated.id,
      title: updated.title,
      description: updated.description,
      fileName: updated.fileName,
      fileUrl: updated.fileUrl,
      fileType: updated.fileType,
      content: updated.content ?? "",
      hasContent: !!updated.content,
      contentLength: (updated.content ?? "").length,
      isActive: updated.isActive,
      uploadedAt: updated.uploadedAt,
      indexing: (updated as any)._indexing ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка обновления RAG документа");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Переиндексация всех активных RAG-документов (только admin)
router.post("/admin/rag-documents/reindex", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const docs = await db.select().from(ragDocumentsTable).where(eq(ragDocumentsTable.isActive, true));
    let reindexed = 0;
    const failed: Array<{ id: number; title: string; reason: string }> = [];

    for (const doc of docs) {
      const content = (doc.content ?? "").trim();
      if (!content) {
        failed.push({ id: doc.id, title: doc.title, reason: "empty content" });
        continue;
      }

      const indexing = await rebuildDocumentChunks(doc.id, content, req);
      if (indexing.insertedChunks > 0) {
        reindexed += 1;
      } else {
        failed.push({ id: doc.id, title: doc.title, reason: "no embeddings" });
      }
    }

    res.json({
      success: true,
      total: docs.length,
      reindexed,
      failed,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка переиндексации RAG документов");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Удалить документ (только admin)
router.delete("/admin/rag-documents/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const [doc] = await db.select().from(ragDocumentsTable).where(eq(ragDocumentsTable.id, id)).limit(1);
    if (!doc) {
      res.status(404).json({ error: "Документ не найден" });
      return;
    }

    try {
      const filename = doc.fileUrl.split("/").pop();
      if (filename) {
        const filePath = path.join(ragUploadDir, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch {}

    await db.delete(ragDocumentsTable).where(eq(ragDocumentsTable.id, id));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Ошибка удаления RAG документа");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Скачать файл документа
router.get("/admin/rag-documents/file/:filename", requireAuth, requireRole("admin"), (req, res) => {
  const filePath = path.join(ragUploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Файл не найден" });
    return;
  }
  res.sendFile(path.resolve(filePath));
});

export default router;