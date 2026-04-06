import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { criteriaRulesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// Получить актуальные критерии (публичный эндпоинт)
router.get("/criteria", async (req, res) => {
  try {
    const { rankType } = req.query;
    
    let query = db.select().from(criteriaRulesTable).where(eq(criteriaRulesTable.isActive, true));
    
    const allCriteria = await db.select()
      .from(criteriaRulesTable)
      .where(eq(criteriaRulesTable.isActive, true));

    const filtered = rankType 
      ? allCriteria.filter(c => c.rankType === rankType)
      : allCriteria;

    res.json(filtered.map(c => ({
      id: c.id,
      rankType: c.rankType,
      version: c.version,
      isActive: c.isActive,
      createdAt: c.createdAt,
      rules: c.rulesJson,
    })));
  } catch (err) {
    req.log.error({ err }, "Ошибка получения критериев");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Создать новые критерии (только admin)
router.post("/criteria", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rankType, rules } = req.body;
    
    if (!rankType || !rules) {
      res.status(400).json({ error: "Укажите rankType и rules" });
      return;
    }

    // Деактивируем старые критерии для этого типа звания
    await db.update(criteriaRulesTable)
      .set({ isActive: false })
      .where(and(eq(criteriaRulesTable.rankType, rankType), eq(criteriaRulesTable.isActive, true)));

    // Получаем последнюю версию
    const existing = await db.select().from(criteriaRulesTable)
      .where(eq(criteriaRulesTable.rankType, rankType));
    const maxVersion = existing.reduce((max, c) => Math.max(max, c.version), 0);

    const [newCriteria] = await db.insert(criteriaRulesTable).values({
      rankType,
      rulesJson: rules,
      version: maxVersion + 1,
      isActive: true,
      createdBy: req.userId,
    }).returning();

    res.status(201).json({
      id: newCriteria.id,
      rankType: newCriteria.rankType,
      version: newCriteria.version,
      isActive: newCriteria.isActive,
      createdAt: newCriteria.createdAt,
      rules: newCriteria.rulesJson,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка создания критериев");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Обновить критерии по ID (только admin)
router.put("/criteria/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { rankType, rules } = req.body;

    const [updated] = await db.update(criteriaRulesTable)
      .set({ rulesJson: rules, rankType })
      .where(eq(criteriaRulesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Критерии не найдены" });
      return;
    }

    res.json({
      id: updated.id,
      rankType: updated.rankType,
      version: updated.version,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      rules: updated.rulesJson,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка обновления критериев");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

export default router;
