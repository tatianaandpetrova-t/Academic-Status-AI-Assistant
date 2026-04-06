import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// Настройка хранилища файлов
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только PDF, DOC, DOCX, JPG, PNG файлы"));
    }
  },
});

// Список документов пользователя
router.get("/documents", requireAuth, async (req, res) => {
  try {
    const { applicationId } = req.query;
    
    const allDocs = await db.select()
      .from(documentsTable)
      .where(eq(documentsTable.userId, req.userId!));

    const filtered = applicationId
      ? allDocs.filter(d => d.applicationId === parseInt(applicationId as string))
      : allDocs;

    res.json(filtered.map(d => ({
      id: d.id,
      applicationId: d.applicationId,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileType: d.fileType,
      uploadedAt: d.uploadedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Ошибка получения документов");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Загрузка документа
router.post("/documents/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Файл не загружен" });
      return;
    }

    const { applicationId } = req.body;
    const fileUrl = `/api/documents/file/${req.file.filename}`;

    const [doc] = await db.insert(documentsTable).values({
      userId: req.userId!,
      applicationId: applicationId ? parseInt(applicationId) : null,
      fileName: req.file.originalname,
      fileUrl,
      fileType: req.file.mimetype,
    }).returning();

    res.status(201).json({
      id: doc.id,
      applicationId: doc.applicationId,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      fileType: doc.fileType,
      uploadedAt: doc.uploadedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Ошибка загрузки документа");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Скачать файл
router.get("/documents/file/:filename", requireAuth, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Файл не найден" });
    return;
  }
  res.sendFile(path.resolve(filePath));
});

export default router;
