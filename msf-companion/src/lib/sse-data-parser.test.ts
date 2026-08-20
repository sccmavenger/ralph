import { describe, expect, it } from "vitest";
import { SseDataParser } from "./sse-data-parser";

const STREAM =
  'data: {"content":"Alpha "}\n\n' +
  'data: {"content":"Beta"}\r\n\r\n' +
  "data: [DONE]\n\n";

describe("SseDataParser", () => {
  it("parses complete SSE frames", () => {
    const parser = new SseDataParser();
    expect(parser.push(STREAM)).toEqual([
      '{"content":"Alpha "}',
      '{"content":"Beta"}',
      "[DONE]",
    ]);
  });

  it("does not lose an event at any possible chunk boundary", () => {
    for (let split = 1; split < STREAM.length; split++) {
      const parser = new SseDataParser();
      const events = [
        ...parser.push(STREAM.slice(0, split)),
        ...parser.push(STREAM.slice(split)),
        ...parser.finish(),
      ];

      expect(events, `split at character ${split}`).toEqual([
        '{"content":"Alpha "}',
        '{"content":"Beta"}',
        "[DONE]",
      ]);
    }
  });

  it("joins multiple data lines and ignores comments", () => {
    const parser = new SseDataParser();
    expect(parser.push(": keepalive\n" + "data: first\n" + "data: second\n\n")).toEqual([
      "first\nsecond",
    ]);
  });
});
