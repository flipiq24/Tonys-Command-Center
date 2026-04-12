import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/auth";

const app: Express = express();

app.use(
  // @ts-ignore — pino-http CJS/ESM interop: callable at runtime
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const frontendUrl = process.env.FRONTEND_URL;
app.use(
  cors(
    frontendUrl
      ? { origin: frontendUrl, credentials: true }
      : { origin: true, credentials: true }
  )
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", authMiddleware, router);

export default app;
