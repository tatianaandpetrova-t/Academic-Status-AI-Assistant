import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import criteriaRouter from "./criteria.js";
import applicationsRouter from "./applications.js";
import chatRouter from "./chat.js";
import documentsRouter from "./documents.js";
import adminRouter from "./admin.js";
import ragDocsRouter from "./rag-docs.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(criteriaRouter);
router.use(applicationsRouter);
router.use(chatRouter);
router.use(documentsRouter);
router.use(adminRouter);
router.use(ragDocsRouter);

export default router;
