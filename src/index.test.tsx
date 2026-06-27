import { describe, expect, it, vi } from "vitest";
import { createApp } from "./index";

const rscHeaders = { Accept: "text/x-component", RSC: "1" };

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function testApp() {
  return createApp({
    renderHtml: vi.fn(async () => streamFromText("<html>stub</html>")),
    renderRsc: vi.fn(async () => streamFromText("rsc")),
  });
}

describe("createApp", () => {
  it("returns HTML for a normal page request", async () => {
    const res = await testApp().request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Vary")).toContain("RSC");
    expect(res.headers.get("Vary")).toContain("Accept");
  });

  it("returns Flight for the same page path with RSC headers", async () => {
    const res = await testApp().request("/", { headers: rscHeaders });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/x-component");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("serves a nested Hono route module", async () => {
    const res = await testApp().request("/about");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("serves nested dynamic Hono route modules", async () => {
    const app = testApp();

    const html = await app.request("/posts/alpha/detail");
    expect(html.status).toBe(200);
    expect(html.headers.get("Content-Type")).toContain("text/html");

    const flight = await app.request("/posts/alpha/detail", {
      headers: rscHeaders,
    });
    expect(flight.status).toBe(200);
    expect(flight.headers.get("Content-Type")).toContain("text/x-component");
  });

  it("serves Markdown as an RSC-rendered page", async () => {
    const res = await testApp().request("/hello");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("serves raw Markdown next to the rendered Markdown page", async () => {
    const res = await testApp().request("/hello.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(await res.text()).toContain("# Hello, World!");
  });

  it("serves plain Hono route modules", async () => {
    const health = await testApp().request("/healthz");
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");

    const robots = await testApp().request("/robots.txt");
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain("User-agent: *");
  });

  it("serves site index endpoints from the explicit site manifest", async () => {
    const sitemap = await testApp().request("/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(await sitemap.text()).toContain("https://example.com/about");

    const llms = await testApp().request("/llms.txt");
    expect(llms.status).toBe(200);
    expect(await llms.text()).toContain("- [Hello, World!](/hello)");
  });

  it("returns a rendered 404 for missing routes", async () => {
    const res = await testApp().request("/missing");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("returns a Flight 404 for missing RSC requests", async () => {
    const res = await testApp().request("/missing", { headers: rscHeaders });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/x-component");
  });

  it("does not expose the old /__rsc route namespace", async () => {
    const res = await testApp().request("/__rsc");
    expect(res.status).toBe(404);
  });
});
