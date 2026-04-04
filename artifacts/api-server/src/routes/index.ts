import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkinRouter from "./tcc/checkin";
import journalRouter from "./tcc/journal";
import briefRouter from "./tcc/brief";
import emailsRouter from "./tcc/emails";
import contactsRouter from "./tcc/contacts";
import callsRouter from "./tcc/calls";
import ideasRouter from "./tcc/ideas";
import claudeRouter from "./tcc/claude";
import demosRouter from "./tcc/demos";
import tasksRouter from "./tcc/tasks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkinRouter);
router.use(journalRouter);
router.use(briefRouter);
router.use(emailsRouter);
router.use(contactsRouter);
router.use(callsRouter);
router.use(ideasRouter);
router.use(claudeRouter);
router.use(demosRouter);
router.use(tasksRouter);

export default router;
