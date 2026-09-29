export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_INPROCESS_WORKER !== "1") {
    const { startWorker } = await import("./lib/jobs");
    startWorker();
  }
}
