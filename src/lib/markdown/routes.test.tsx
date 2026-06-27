import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createMarkdownRoutes,
  markdownManifestEntries,
  toMarkdownPath,
} from "./routes";

const markdownFiles = {
  "hello.md": "---\ntitle: Hello\ndescription: Desc\n---\n# Body",
};

describe("Markdown route helpers", () => {
  it("maps page paths to raw Markdown paths", () => {
    expect(toMarkdownPath("/")).toBe("/index.md");
    expect(toMarkdownPath("/hello")).toBe("/hello.md");
  });

  it("creates manifest entries from frontmatter", () => {
    expect(markdownManifestEntries(markdownFiles)).toEqual([
      {
        description: "Desc",
        path: "/hello",
        title: "Hello",
      },
    ]);
  });

  it("serves rendered and raw Markdown routes", async () => {
    const renderMarkdown = vi.fn(async (body: string) => (
      <article>{body}</article>
    ));
    const routes = createMarkdownRoutes(markdownFiles, renderMarkdown);
    const app = new Hono();

    app.use("*", async (c, next) => {
      c.setRenderer(() => new Response("rendered"));
      await next();
    });
    app.route("/", routes);

    const page = await app.request("/hello");
    expect(page.status).toBe(200);
    expect(renderMarkdown).toHaveBeenCalledWith("# Body");

    const raw = await app.request("/hello.md");
    expect(raw.status).toBe(200);
    expect(raw.headers.get("Content-Type")).toContain("text/markdown");
  });

  it("rejects dynamic Markdown routes", () => {
    expect(() =>
      markdownManifestEntries({
        "posts/[slug].md": "---\ntitle: Post\n---\nBody",
      })
    ).toThrow("Markdown routes do not support dynamic segments");
  });
});
