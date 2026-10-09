import { createServer, createConnection, type Socket } from "node:net";
import type { TestEnvironment } from "./test-database";

/** Test-only PostgreSQL backend framing. Never decodes or records row/auth data.
 * Withhold CommandComplete(COMMIT), then cut the connection only after the
 * server reports ReadyForQuery(I). Neither message reaches the real driver. */
export class CommitAcknowledgmentGate {
  private pending = Buffer.alloc(0);
  private withholding = false;
  dropped = false;

  push(chunk: Buffer): Buffer[] {
    if (this.dropped) return [];
    this.pending = Buffer.concat([this.pending, chunk]);
    const forwarded: Buffer[] = [];
    while (this.pending.length >= 5) {
      const length = this.pending.readUInt32BE(1);
      if (length < 4 || length > 16 * 1024 * 1024) throw new Error("INVALID_BACKEND_FRAME");
      if (this.pending.length < length + 1) break;
      const frame = this.pending.subarray(0, length + 1);
      this.pending = this.pending.subarray(length + 1);
      if (frame[0] === 0x43 && frame.subarray(5).equals(Buffer.from("COMMIT\0"))) this.withholding = true;
      if (!this.withholding) forwarded.push(frame);
      else if (frame[0] === 0x5a) {
        if (length !== 5 || frame[5] !== 0x49) throw new Error("COMMIT_NOT_IDLE");
        this.dropped = true;
        this.pending = Buffer.alloc(0);
        break;
      }
    }
    return forwarded;
  }
}

/** The relay has no configurable upstream: only the owned disposable PG port.
 * Callers validate the complete test environment before listening or connecting.
 * An ephemeral listener avoids changing the operator's fixed target contract. */
export async function startCommitAcknowledgmentRelay(env: TestEnvironment) {
  const { validateTestEnvironment } = await import("./test-database");
  validateTestEnvironment(env);
  const sockets = new Set<Socket>();
  const gates: CommitAcknowledgmentGate[] = [];
  let failed = false;
  const server = createServer(downstream => {
    const upstream = createConnection({ host: "127.0.0.1", port: 55432 });
    const gate = new CommitAcknowledgmentGate();
    gates.push(gate);
    const stop = () => { downstream.destroy(); upstream.destroy(); };
    for (const socket of [downstream, upstream]) {
      sockets.add(socket);
      socket.setTimeout(20_000, () => { failed = true; stop(); });
      socket.on("error", () => { failed = true; stop(); });
      socket.on("close", () => { sockets.delete(socket); stop(); });
    }
    downstream.pipe(upstream);
    downstream.on("drain", () => upstream.resume());
    upstream.on("data", chunk => {
      try {
        for (const frame of gate.push(chunk)) if (!downstream.write(frame)) upstream.pause();
        if (gate.dropped) stop();
      } catch { failed = true; stop(); }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("RELAY_NOT_LISTENING");
  return {
    port: address.port,
    evidence: () => ({ connections: gates.length, dropped: gates.filter(gate => gate.dropped).length, failed }),
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
