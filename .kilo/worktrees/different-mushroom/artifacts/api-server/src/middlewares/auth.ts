import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// Расширяем Request для хранения информации о пользователе
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
    }
  }
}

const SECRET = process.env["JWT_SECRET"] || "itmo-secret-key-2024";

// Генерация JWT токена
export function generateToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, SECRET, { expiresIn: "7d" });
}

// Middleware проверки авторизации
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Не авторизован" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, SECRET) as { userId: number; role: string };
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "Недействительный токен" });
  }
}

// Middleware проверки роли
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: "Недостаточно прав" });
      return;
    }
    next();
  };
}
