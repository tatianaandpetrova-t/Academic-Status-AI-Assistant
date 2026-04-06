import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Таблица критериев учёного звания (с версионированием)
export const criteriaRulesTable = pgTable("criteria_rules", {
  id: serial("id").primaryKey(),
  rankType: text("rank_type").notNull(), // "docent" | "professor"
  rulesJson: jsonb("rules_json").notNull(),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCriteriaSchema = createInsertSchema(criteriaRulesTable).omit({ id: true, createdAt: true });
export type InsertCriteria = z.infer<typeof insertCriteriaSchema>;
export type CriteriaRule = typeof criteriaRulesTable.$inferSelect;
