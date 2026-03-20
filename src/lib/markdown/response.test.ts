import { describe, expect, it } from "vitest";
import { markdownResponse } from "./response";

describe("markdownResponse", () => {
  it("returns 200 with markdown content type", () => {
    const res = markdownResponse("# Hello");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/markdown; charset=utf-8"
    );
  });

  it("includes Cache-Control header", () => {
    const res = markdownResponse("# Hello");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("includes Content-Signal header", () => {
    const res = markdownResponse("# Hello");
    expect(res.headers.get("Content-Signal")).toBe("search=yes ai-input=yes");
  });

  it("includes X-Markdown-Tokens header", () => {
    const res = markdownResponse("Hello world");
    const tokens = res.headers.get("X-Markdown-Tokens");
    expect(tokens).toBeTruthy();
    expect(Number(tokens)).toBeGreaterThan(0);
  });

  it("sets Vary header when varyAccept is true", () => {
    const res = markdownResponse("# Hello", { varyAccept: true });
    expect(res.headers.get("Vary")).toBe("Accept");
  });

  it("does not set Vary header by default", () => {
    const res = markdownResponse("# Hello");
    expect(res.headers.get("Vary")).toBeNull();
  });

  it("returns the content as body", async () => {
    const content = "# Hello World\n\nSome content";
    const res = markdownResponse(content);
    await expect(res.text()).resolves.toBe(content);
  });
});
