// Standalone background worker: `npm run worker` (set DISABLE_INPROCESS_WORKER=1 on web servers).
import { startWorker } from "../src/lib/jobs";
startWorker(1000);
console.log("rockitdocs worker running");
