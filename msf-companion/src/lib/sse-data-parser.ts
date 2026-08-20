/**
 * Incrementally parses Server-Sent Events and returns only their `data` payloads.
 * Network reads may split an SSE frame at any byte, so callers must retain the
 * unfinished tail between reads instead of splitting each chunk independently.
 */
export class SseDataParser {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    return this.drainCompleteEvents();
  }

  finish(): string[] {
    const events = this.drainCompleteEvents();
    const tail = this.buffer.trim();
    this.buffer = "";

    if (tail) {
      const data = parseEventData(tail);
      if (data !== null) events.push(data);
    }

    return events;
  }

  private drainCompleteEvents(): string[] {
    const events: string[] = [];

    while (true) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match || match.index === undefined) break;

      const rawEvent = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = parseEventData(rawEvent);
      if (data !== null) events.push(data);
    }

    return events;
  }
}

function parseEventData(rawEvent: string): string | null {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line === "data" || line.startsWith("data:"))
    .map((line) => {
      const value = line === "data" ? "" : line.slice(5);
      return value.startsWith(" ") ? value.slice(1) : value;
    });

  return dataLines.length > 0 ? dataLines.join("\n") : null;
}
