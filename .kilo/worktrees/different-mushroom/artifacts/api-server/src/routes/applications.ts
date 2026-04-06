import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { applicationsTable, criteriaRulesTable, usersTable } from "@workspace/db/schema";
import { eq, and, desc, count, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { checkCriteria } from "../lib/criteria-checker.js";

const router: IRouter = Router();

// Получить список заявок текущего пользователя
router.get("/applications", requireAuth, async (req, res) => {
  try {
    const { status, limit = "20", offset = "0" } = req.query;
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);

    const allApps = await db.select()
      .from(applicationsTable)
      .where(eq(applicationsTable.userId, req.userId!))
      .orderBy(desc(applicationsTable.createdAt));

    const filtered = status
      ? allApps.filter(a => a.status === status)
      : allApps;

    const paginated = filtered.slice(offsetNum, offsetNum + limitNum);

    res.json({
      applications: paginated.map(formatApp),
      total: filtered.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка получения заявок");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Создать заявку и автоматически проверить её
router.post("/applications", requireAuth, async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !data.rankType) {
      res.status(400).json({ error: "Укажите данные заявки и тип звания" });
      return;
    }

    // Получаем актуальные критерии для данного типа звания
    const [criteria] = await db.select()
      .from(criteriaRulesTable)
      .where(and(
        eq(criteriaRulesTable.rankType, data.rankType),
        eq(criteriaRulesTable.isActive, true)
      ))
      .limit(1);

    if (!criteria) {
      res.status(400).json({ error: "Критерии для данного звания не найдены в системе" });
      return;
    }

    // Проверяем соответствие критериям
    const result = checkCriteria(data, criteria.rulesJson as any);

    // Сохраняем заявку со статусом 'pending' для последующей проверки экспертом
    const [application] = await db.insert(applicationsTable).values({
      userId: req.userId!,
      rankType: data.rankType,
      structuredDataJson: data,
      resultJson: result,
      status: 'pending',
    }).returning();

    res.status(201).json(formatApp(application));
  } catch (err) {
    req.log.error({ err }, "Ошибка создания заявки");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получить заявку по ID
router.get("/applications/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const [application] = await db.select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, id))
      .limit(1);

    if (!application) {
      res.status(404).json({ error: "Заявка не найдена" });
      return;
    }

    // Пользователь может видеть только свои заявки (или эксперт/admin видит все)
    if (application.userId !== req.userId && !["expert", "admin"].includes(req.userRole!)) {
      res.status(403).json({ error: "Нет доступа" });
      return;
    }

    res.json(formatApp(application));
  } catch (err) {
    req.log.error({ err }, "Ошибка получения заявки");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Форматирование заявки для ответа API
function formatApp(app: any) {
  return {
    id: app.id,
    userId: app.userId,
    rankType: app.rankType,
    status: app.status,
    structuredData: app.structuredDataJson,
    result: app.resultJson,
    expertComment: app.expertComment,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export default router;
