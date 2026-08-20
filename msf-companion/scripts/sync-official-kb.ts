import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../.env") });

async function main() {
  const { runOfficialKnowledgeSync } = await import("../src/lib/kb-official-sync");
  const sync = await runOfficialKnowledgeSync();
  for (const result of sync.results) {
    const marker = result.success ? "OK" : "FAILED";
    console.log(`${marker} ${result.name}: ${result.docsUploaded}/${result.recordsRead} documents uploaded${result.error ? ` (${result.error})` : ""}`);
  }
  const failures = sync.results.filter((result) => !result.success);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
