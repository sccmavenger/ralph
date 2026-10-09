import { describe, expect, it } from "vitest";
import { CommitAcknowledgmentGate } from "./commit-acknowledgment";

function frame(type: string, payload: string) {
  const body = Buffer.from(payload);
  const header = Buffer.alloc(5);
  header[0] = type.charCodeAt(0);
  header.writeUInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
}

describe("BOOT-13 wire fault framing (no database or private source)", () => {
  it("preserves noncommit replies byte-for-byte, including COMMIT text inside rows", () => {
    const gate = new CommitAcknowledgmentGate();
    const replies = Buffer.concat([frame("D", "COMMIT\0"), frame("C", "SELECT 1\0"), frame("Z", "T")]);
    expect(Buffer.concat(gate.push(replies))).toEqual(replies);
    expect(gate.dropped).toBe(false);
  });

  it("drops only the commit acknowledgment across every possible network split", () => {
    const before = Buffer.concat([frame("C", "INSERT 0 1\0"), frame("Z", "T")]);
    const bytes = Buffer.concat([before, frame("C", "COMMIT\0"), frame("N", "notice\0"), frame("Z", "I")]);
    for (let split = 0; split <= bytes.length; split++) {
      const gate = new CommitAcknowledgmentGate();
      expect(Buffer.concat([...gate.push(bytes.subarray(0, split)), ...gate.push(bytes.subarray(split))])).toEqual(before);
      expect(gate.dropped).toBe(true);
      expect(gate.push(frame("Z", "I"))).toEqual([]);
    }
  });

  it("waits for the actual idle response before reporting a dropped confirmed commit", () => {
    const gate = new CommitAcknowledgmentGate();
    expect(gate.push(frame("C", "COMMIT\0"))).toEqual([]);
    expect(gate.dropped).toBe(false);
    expect(gate.push(frame("Z", "I"))).toEqual([]);
    expect(gate.dropped).toBe(true);
  });

  it.each(["T", "E", "", "II"])("never treats ReadyForQuery(%j) as a completed commit", status => {
    const gate = new CommitAcknowledgmentGate();
    expect(() => gate.push(Buffer.concat([frame("C", "COMMIT\0"), frame("Z", status)]))).toThrow("COMMIT_NOT_IDLE");
    expect(gate.dropped).toBe(false);
  });

  it.each([0, 3, 16 * 1024 * 1024 + 1])("rejects invalid frame length %i before waiting for its body", length => {
    const header = Buffer.alloc(5); header[0] = 0x43; header.writeUInt32BE(length, 1);
    expect(() => new CommitAcknowledgmentGate().push(header)).toThrow("INVALID_BACKEND_FRAME");
  });
});
