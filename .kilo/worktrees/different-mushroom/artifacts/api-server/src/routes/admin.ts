import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, applicationsTable, chatMessagesTable } from "@workspace/db/schema";
import { eq, desc, count, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// === УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ===

// Список всех пользователей (только admin)
router.get("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { role, isActive } = req.query;
    
    const allUsers = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
    
    let filtered = allUsers;
    if (role) filtered = filtered.filter(u => u.role === role);
    if (isActive !== undefined) filtered = filtered.filter(u => u.isActive === (isActive === "true"));

    res.json(filtered.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "Ошибка получения пользователей");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Изменить роль пользователя (только admin)
router.put("/admin/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { role, isActive } = req.body;

    if (!["applicant", "expert", "admin"].includes(role)) {
      res.status(400).json({ error: "Недопустимая роль" });
      return;
    }

    const updates: any = { role };
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db.update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    res.json(formatUser(updated));
  } catch (err) {
    req.log.error({ err }, "Ошибка обновления роли");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// === УПРАВЛЕНИЕ ЗАЯВКАМИ ===

// Все заявки (admin/expert)
router.get("/admin/applications", requireAuth, requireRole("admin", "expert"), async (req, res) => {
  try {
    const { status, rankType, limit = "50", offset = "0" } = req.query;
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);

    const allApps = await db.select({
      application: applicationsTable,
      user: usersTable,
    })
      .from(applicationsTable)
      .leftJoin(usersTable, eq(applicationsTable.userId, usersTable.id))
      .orderBy(desc(applicationsTable.createdAt));

    let filtered = allApps;
    if (status) filtered = filtered.filter(a => a.application.status === status);
    if (rankType) filtered = filtered.filter(a => a.application.rankType === rankType);

    const paginated = filtered.slice(offsetNum, offsetNum + limitNum);

    res.json({
      applications: paginated.map(({ application, user }) => ({
        ...formatApp(application),
        user: user ? formatUser(user) : null,
      })),
      total: filtered.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка получения заявок (admin)");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Проверить заявку вручную (expert/admin)
router.post("/admin/applications/:id/review", requireAuth, requireRole("admin", "expert"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, expertComment } = req.body;

    if (!["approved", "rejected", "partial"].includes(status)) {
      res.status(400).json({ error: "Недопустимый статус" });
      return;
    }

    const [updated] = await db.update(applicationsTable)
      .set({ status, expertComment: expertComment || null, updatedAt: new Date() })
      .where(eq(applicationsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Заявка не найдена" });
      return;
    }

    res.json(formatApp(updated));
  } catch (err) {
    req.log.error({ err }, "Ошибка проверки заявки");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// === СТАТИСТИКА ===

// Статистика (admin)
router.get("/admin/stats", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [allApps, allUsers, allChats] = await Promise.all([
      db.select().from(applicationsTable).orderBy(desc(applicationsTable.createdAt)),
      db.select().from(usersTable),
      db.select({ id: chatMessagesTable.id }).from(chatMessagesTable),
    ]);

    const approvedCount = allApps.filter(a => a.status === "approved").length;
    const rejectedCount = allApps.filter(a => a.status === "rejected").length;
    const partialCount = allApps.filter(a => a.status === "partial").length;
    const pendingCount = allApps.filter(a => a.status === "pending").length;

    // Статистика по дням (последние 30 дней)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dayCountMap: Record<string, number> = {};
    allApps
      .filter(a => a.createdAt >= thirtyDaysAgo)
      .forEach(a => {
        const day = a.createdAt.toISOString().split("T")[0]!;
        dayCountMap[day] = (dayCountMap[day] || 0) + 1;
      });

    const applicationsByDay = Object.entries(dayCountMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totalApplications: allApps.length,
      approvedCount,
      rejectedCount,
      partialCount,
      pendingCount,
      totalUsers: allUsers.length,
      totalChatMessages: allChats.length,
      recentApplications: allApps.slice(0, 5).map(formatApp),
      applicationsByDay,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка получения статистики");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

function formatUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    department: user.department,
    position: user.position,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

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
