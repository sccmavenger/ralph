import { execSync } from "child_process";

/**
 * Playwright global teardown — kills stale node processes after test run.
 * This prevents process accumulation when tests are run repeatedly
 * (e.g., during ralph-loop iterations).
 */
export default async function globalTeardown() {
  try {
    // Kill Next.js dev server processes on port 3000
    execSync(
      'for /f "tokens=5" %a in (\'netstat -ano ^| findstr :3000 ^| findstr LISTENING\') do taskkill /f /pid %a',
      { shell: "cmd.exe", stdio: "ignore", timeout: 10000 }
    );
  } catch {
    // No process on port 3000 — that's fine
  }
}
