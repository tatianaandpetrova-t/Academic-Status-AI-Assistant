import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, timestamp, boolean, vector, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ragDocumentsTable } from "./rag_documents";

// Чанки документов с embeddings (для pgvector similarity search)
// Примечание: размер вектора должен совпадать с моделью для embeddings.
// Используем Yandex Embeddings (768 измерений)
export const EMBEDDING_DIMENSIONS = 768;

export const ragDocumentChunksTable = pgTable(
  "rag_document_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id").notNull().references(() => ragDocumentsTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    // Нормализованный текст для to_tsvector (см. GIN-индекс ниже; не «сырой» tsvector в колонке)
    chunkTextSearch: text("chunk_text_search"),
    // Метаданные для улучшения поиска
    pointNumber: text("point_number"), // Номер пункта (например, "2", "22.1")
    sectionTitle: text("section_title"), // Заголовок раздела (например, "I. Общие положения")
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("rag_document_chunks_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
    // GIN по выражению: GIN(text) без opclass в PostgreSQL недопустим; совпадает с artifacts/api-server/migrations/003_rag_improvements.sql
    index("rag_document_chunks_text_search_gin").using(
      "gin",
      sql`to_tsvector('russian', ${table.chunkTextSearch})`,
    ),
  ],
);

export const insertRagDocumentChunkSchema = createInsertSchema(ragDocumentChunksTable).omit({ id: true, createdAt: true });
export type InsertRagDocumentChunk = z.infer<typeof insertRagDocumentChunkSchema>;
export type RagDocumentChunk = typeof ragDocumentChunksTable.$inferSelect;