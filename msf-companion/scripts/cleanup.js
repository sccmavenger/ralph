/**
 * Kill stale node.exe processes to prevent accumulation during ralph-loop.
 * 
 * Preserves the CURRENT process (the one running this script).
 * Kills all other node.exe processes that are NOT the current one.
 * 
 * Usage: node scripts/cleanup.js
 *        npm run cleanup
 */
const { execSync } = require("child_process");

const myPid = process.pid;
const parentPid = process.ppid;

// Safe PIDs we must never kill (this script + its parent npm process)
const safePids = new Set([myPid, parentPid]);

try {
  // Get all node.exe processes as CSV
  const output = execSync(
    'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH',
    { encoding: "utf8", timeout: 10000 }
  );

  const pids = output
    .split("\n")
    .filter((line) => line.includes("node.exe"))
    .map((line) => {
      const match = line.match(/"node\.exe","(\d+)"/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter((pid) => pid && !safePids.has(pid));

  if (pids.length === 0) {
    console.log("cleanup: no stale node processes found");
    process.exit(0);
  }

  // Kill in batches of 20 to avoid command-line length limits
  const batchSize = 20;
  let killed = 0;
  for (let i = 0; i < pids.length; i += batchSize) {
    const batch = pids.slice(i, i + batchSize);
    const args = batch.map((p) => `/PID ${p}`).join(" ");
    try {
      execSync(`taskkill /F ${args}`, { stdio: "ignore", timeout: 15000 });
      killed += batch.length;
    } catch {
      // Some processes may have already exited — that's fine
    }
  }

  console.log(`cleanup: killed ${killed} stale node processes`);
} catch (err) {
  // tasklist might fail if no node processes exist
  console.log("cleanup: no node processes to clean");
}
