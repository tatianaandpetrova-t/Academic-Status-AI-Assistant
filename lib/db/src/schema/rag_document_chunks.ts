import { pgTable, serial, integer, text, timestamp, boolean, vector, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ragDocumentsTable } from "./rag_documents";

// Чанки документов с embeddings (для pgvector similarity search)
// Примечание: размер вектора должен совпадать с моделью для embeddings.
// Используем multilingual-e5-base (768 измерений) - лучше поддерживается в HF Inference API
export const EMBEDDING_DIMENSIONS = 768;

export const ragDocumentChunksTable = pgTable(
  "rag_document_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id").notNull().references(() => ragDocumentsTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("rag_document_chunks_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const insertRagDocumentChunkSchema = createInsertSchema(ragDocumentChunksTable).omit({ id: true, createdAt: true });
export type InsertRagDocumentChunk = z.infer<typeof insertRagDocumentChunkSchema>;
export type RagDocumentChunk = typeof ragDocumentChunksTable.$inferSelect;

