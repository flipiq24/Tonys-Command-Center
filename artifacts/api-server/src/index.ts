import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Start Business Master Sheet auto-sync (every 5 minutes)
  import("./routes/tcc/sheets-sync").then(({ startAutoSync }) => {
    startAutoSync();
  }).catch(err => logger.warn({ err }, "Failed to start sheets auto-sync"));

  // Start server-side EOD scheduler (checks every 60s if it's past 4:30 PM Pacific)
  startEodScheduler();
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

function startEodScheduler(): void {
  logger.info("EOD scheduler started — checks every 60s for 4:30 PM Pacific trigger");
  setInterval(async () => {
    try {
      const nowPacific = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
      const pacific = new Date(nowPacific);
      const hour = pacific.getHours();
      const minute = pacific.getMinutes();
      const totalMinutes = hour * 60 + minute;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

      // Trigger any time on or after 4:30 PM Pacific — DB guard in sendAutoEod() prevents double-sends
      if (totalMinutes >= 16 * 60 + 30) {
        const { sendAutoEod } = await import("./routes/tcc/eod");
        const result = await sendAutoEod();
        if (result.alreadySent) {
          // DB guard handles deduplication — normal during the 90-min window
        } else if (result.ok) {
          logger.info({ today, callsMade: result.callsMade, demosBooked: result.demosBooked }, "EOD scheduler: EOD report sent");
        } else {
          logger.warn({ today }, "EOD scheduler: EOD report failed — will retry next check");
        }
      }
    } catch (err) {
      logger.warn({ err }, "EOD scheduler: error during check");
    }
  }, 60 * 1000);
}
