import { bootstrapReadiness } from "./bootstrap-fixtures";
import { createTestPrisma, validateTestEnvironment } from "./test-database";
import { runBootstrap, type BootstrapPrepared } from "../../src/lib/executive/bootstrap";

// Test-only service caller, never the trusted constitutional CLI. Inputs are
// synthetic IPC data; credentials travel only in the guarded child environment.
async function execute(prepared: BootstrapPrepared, barrier: boolean) {
  validateTestEnvironment(); // Validate both roles before client construction.
  const client = await createTestPrisma();
  try {
    const readiness = bootstrapReadiness(process.env);
    const outcome = await runBootstrap({ client, mode: "apply", prepared,
      readiness: async tx => {
        await readiness(tx);
        if (barrier) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { cleanup(); reject(new Error("BARRIER_TIMEOUT")); }, 10_000);
            const release = (message: unknown) => {
              if (message !== "release") return;
              cleanup(); resolve();
            };
            const disconnected = () => { cleanup(); reject(new Error("BARRIER_DISCONNECTED")); };
            const cleanup = () => {
              clearTimeout(timer);
              process.off("message", release);
              process.off("disconnect", disconnected);
            };
            process.on("message", release);
            process.once("disconnect", disconnected);
            process.send?.({ kind: "locked", pid: process.pid });
          });
        }
      },
    });
    return outcome;
  } finally { await client.$disconnect(); }
}

// No work on import, no raw exception/SQL/credential output, one invocation.
if (require.main === module) {
  process.once("message", (message: { prepared: BootstrapPrepared; barrier: boolean }) => {
    void execute(message.prepared, message.barrier).then(
      outcome => process.send?.({ kind: "outcome", outcome }, () => process.disconnect()),
      () => process.send?.({ kind: "failed" }, () => process.disconnect()),
    );
  });
}
