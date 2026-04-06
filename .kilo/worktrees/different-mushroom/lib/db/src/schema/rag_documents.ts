import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Нормативные документы для RAG (контекст ИИ-ассистента)
export const ragDocumentsTable = pgTable("rag_documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),           // Название документа
  description: text("description"),          // Краткое описание
  fileName: text("file_name").notNull(),     // Имя файла
  fileUrl: text("file_url").notNull(),       // Путь к файлу
  fileType: text("file_type").notNull(),     // MIME-тип
  content: text("content"),                  // Извлечённый текст для RAG
  isActive: boolean("is_active").notNull().default(true), // Используется ли в чате
  uploadedBy: integer("uploaded_by").references(() => usersTable.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertRagDocumentSchema = createInsertSchema(ragDocumentsTable).omit({ id: true, uploadedAt: true });
export type InsertRagDocument = z.infer<typeof insertRagDocumentSchema>;
export type RagDocument = typeof ragDocumentsTable.$inferSelect;
