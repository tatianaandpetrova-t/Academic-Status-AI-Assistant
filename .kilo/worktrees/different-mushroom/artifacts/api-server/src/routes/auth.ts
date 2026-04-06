import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateToken, requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// Регистрация нового пользователя
router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, fullName, department, position } = req.body;
    
    if (!email || !password || !fullName) {
      res.status(400).json({ error: "Заполните обязательные поля: email, пароль, ФИО" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
      return;
    }

    // Проверяем, не существует ли пользователь с таким email
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Пользователь с таким email уже существует" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const [user] = await db.insert(usersTable).values({
      email,
      passwordHash,
      fullName,
      department: department || null,
      position: position || null,
      role: "applicant",
      isActive: true,
    }).returning();

    const token = generateToken(user.id, user.role);
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.department,
        position: user.position,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      }
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка регистрации");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Вход в систему
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: "Введите email и пароль" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      res.status(401).json({ error: "Неверный email или пароль" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "Учётная запись заблокирована" });
      return;
    }

    const token = generateToken(user.id, user.role);
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.department,
        position: user.position,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      }
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка входа");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получить текущего пользователя
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    
    if (!user) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      department: user.department,
      position: user.position,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка получения профиля");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

export default router;
