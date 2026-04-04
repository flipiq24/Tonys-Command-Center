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
import eodRouter from "./tcc/eod";
import systemInstructionsRouter from "./tcc/system-instructions";
import phoneLogRouter from "./tcc/phone-log";
import sendSmsRouter from "./tcc/send-sms";

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
router.use(eodRouter);
router.use(systemInstructionsRouter);
router.use(phoneLogRouter);
router.use(sendSmsRouter);

// ─── Canonical aliases (spec-matching paths) ─────────────────────────────────
// /morning-brief is registered directly in briefRouter (both /brief/today and /morning-brief)
// /email-action, /call-log, /idea route aliases share handler modules:
router.post("/email-action", (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  req.url = "/emails/action";
  emailsRouter(req, res, next);
});
router.post("/call-log", (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  req.url = "/calls";
  callsRouter(req, res, next);
});
router.post("/idea", (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  req.url = "/ideas";
  ideasRouter(req, res, next);
});

export default router;
