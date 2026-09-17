import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncedCharacter } from "./kb-official-sync";
import { prepareCharacterEmailAssets } from "./new-character-email-assets";

const portrait = "https://assets.marvelstrikeforce.com/portrait.png";
const art = "https://assets.marvelstrikeforce.com/full.jpg";
const icon = "https://assets.marvelstrikeforce.com/basic.png";
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const fetchMock = vi.fn();
const character: SyncedCharacter = {
  id: "Hero", name: "Hero", traits: ["Hero"], teams: [], portrait,
  fullBodyArt: { url: art, costumeName: "Default" },
  abilities: [{ name: "Hit", description: "Attack target.", type: "basic", icon, level: 7 }],
};
const imageResponse = () => new Response(png, { headers: { "content-type": "image/png" } });

describe("character email inline assets", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset().mockImplementation(imageResponse);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("embeds verified images, preserves metadata, and does not mutate the source", async () => {
    const result = await prepareCharacterEmailAssets(character);
    expect(result.attachments).toHaveLength(3);
    expect(result.character.portrait).toMatch(/^cid:msf-character-/);
    expect(result.character.fullBodyArt).toEqual({ url: expect.stringMatching(/^cid:/), costumeName: "Default" });
    expect(result.character.abilities[0]).toEqual({ ...character.abilities[0], icon: expect.stringMatching(/^cid:/) });
    expect(character.portrait).toBe(portrait);
    expect(fetchMock).toHaveBeenCalledWith(portrait, expect.objectContaining({ redirect: "error", credentials: "omit", cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("headers");
  });

  it("deduplicates repeated asset URLs within a character", async () => {
    const result = await prepareCharacterEmailAssets({ ...character, fullBodyArt: { url: portrait }, abilities: [{ ...character.abilities[0], icon: portrait }] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.attachments).toHaveLength(1);
    expect(result.character.fullBodyArt?.url).toBe(result.character.portrait);
  });

  it("falls back to portrait and keeps the complete kit when art/icons return 404", async () => {
    fetchMock.mockImplementation((url: string) => url === portrait ? imageResponse() : new Response(null, { status: 404 }));
    const result = await prepareCharacterEmailAssets(character);
    expect(result.attachments).toHaveLength(1);
    expect(result.character.portrait).toMatch(/^cid:/);
    expect(result.character.fullBodyArt).toBeUndefined();
    expect(result.character.abilities[0]).toEqual({ ...character.abilities[0], icon: undefined });
  });

  it.each(["http://assets.marvelstrikeforce.com/a.png", "https://localhost/a.png", "https://assets.marvelstrikeforce.com.evil.test/a.png", "https://user:secret@assets.marvelstrikeforce.com/a.png", "cid:unverified"])("does not fetch an unsafe input %s", async url => {
    const result = await prepareCharacterEmailAssets({ ...character, portrait: url, fullBodyArt: undefined, abilities: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.attachments).toEqual([]);
    expect(result.character.portrait).toBeUndefined();
  });

  it("rejects non-image bodies and misleading MIME types without failing delivery", async () => {
    fetchMock.mockImplementationOnce(() => new Response("<html>error</html>", { headers: { "content-type": "text/html" } }))
      .mockImplementationOnce(() => new Response("not an image", { headers: { "content-type": "image/png" } }))
      .mockRejectedValueOnce(new Error("network unavailable"));
    const result = await prepareCharacterEmailAssets(character);
    expect(result.attachments).toEqual([]);
    expect(result.character.abilities[0].description).toBe("Attack target.");
  });

  it("bounds both advertised and streamed response sizes", async () => {
    fetchMock.mockImplementationOnce(() => new Response(png, { headers: { "content-type": "image/png", "content-length": "2000001" } }))
      .mockImplementationOnce(() => new Response(new Uint8Array(2_000_001), { headers: { "content-type": "image/png" } }));
    const result = await prepareCharacterEmailAssets({ ...character, abilities: [] });
    expect(result.attachments).toEqual([]);
  });

  it("bounds the combined attachment size", async () => {
    const large = new Uint8Array(2_000_000);
    large.set(png);
    fetchMock.mockImplementation(() => new Response(large, { headers: { "content-type": "image/png" } }));
    const result = await prepareCharacterEmailAssets({ ...character, abilities: [...character.abilities, { name: "Passive", description: "Guard", icon: "https://assets.marvelstrikeforce.com/passive.png" }] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.attachments.reduce((sum, image) => sum + image.content.length, 0)).toBe(6_000_000);
    expect(result.character.abilities[1].icon).toBeUndefined();
  });

  it("stops new image requests after the per-character time budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    fetchMock.mockImplementation(() => { vi.setSystemTime(10_001); return imageResponse(); });
    const result = await prepareCharacterEmailAssets(character);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.attachments).toHaveLength(1);
    expect(result.character.abilities[0].description).toBe("Attack target.");
  });
});
