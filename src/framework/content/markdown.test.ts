import { describe, expect, it, vi } from "vitest";
import { createMarkdownAdapter } from "./markdown";

describe("createMarkdownAdapter", () => {
  const stubRender = vi.fn(
    async (body: string) => ({ body }) as unknown as React.ReactElement
  );

  it("creates meta with title from frontmatter", () => {
    const adapter = createMarkdownAdapter(stubRender);
    const { meta } = adapter("---\ntitle: Hello\n---\nBody", "/hello");
    expect(meta.title).toBe("Hello");
  });

  it("falls back to path when title is empty", () => {
    const adapter = createMarkdownAdapter(stubRender);
    const { meta } = adapter("---\ntitle: \n---\nBody", "/untitled");
    expect(meta.title).toBe("/untitled");
  });

  it("falls back to path when no frontmatter", () => {
    const adapter = createMarkdownAdapter(stubRender);
    const { meta } = adapter("No frontmatter here", "/no-fm");
    expect(meta.title).toBe("/no-fm");
  });

  it("sets description from frontmatter", () => {
    const adapter = createMarkdownAdapter(stubRender);
    const { meta } = adapter(
      "---\ntitle: T\ndescription: Desc\n---\nBody",
      "/t"
    );
    expect(meta.description).toBe("Desc");
  });

  it("sets date from frontmatter", () => {
    const adapter = createMarkdownAdapter(stubRender);
    const { meta } = adapter(
      "---\ntitle: T\ndate: 2025-01-01\n---\nBody",
      "/t"
    );
    expect(meta.date).toBe("2025-01-01");
  });

  it("sets draft from frontmatter", () => {
    const adapter = createMarkdownAdapter(stubRender);
    const { meta } = adapter("---\ntitle: T\ndraft: true\n---\nBody", "/t");
    expect(meta.draft).toBe(true);
  });

  it("markdown accessor returns raw content", async () => {
    const adapter = createMarkdownAdapter(stubRender);
    const raw = "---\ntitle: T\n---\nContent";
    const { meta } = adapter(raw, "/t");
    expect(await meta.markdown?.()).toBe(raw);
  });

  it("load returns module with correct meta", async () => {
    const adapter = createMarkdownAdapter(stubRender);
    const { load } = adapter("---\ntitle: Post\n---\nBody", "/post");
    const mod = await load();
    expect(mod.meta?.title).toBe("Post");
  });

  it("load calls renderMarkdown with body", async () => {
    const render = vi.fn(
      async (_body: string) => null as unknown as React.ReactElement
    );
    const adapter = createMarkdownAdapter(render);
    const { load } = adapter("---\ntitle: T\n---\nmy body", "/t");
    const mod = await load();
    await mod.default();
    expect(render).toHaveBeenCalledWith("my body");
  });
});
