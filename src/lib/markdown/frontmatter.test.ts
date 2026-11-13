import { describe, expect, test as it } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses title and description", () => {
    const raw = `---
title: Hello World
description: A test post
---
Body content`;
    const result = parseFrontmatter(raw);
    expect(result.title).toBe("Hello World");
    expect(result.description).toBe("A test post");
    expect(result.body).toBe("Body content");
  });

  it("parses draft: true as boolean", () => {
    const raw = `---
title: Draft Post
draft: true
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.draft).toBe(true);
  });

  it("parses draft: false as undefined", () => {
    const raw = `---
title: Published Post
draft: false
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.draft).toBeUndefined();
  });

  it("parses tags from comma-separated string", () => {
    const raw = `---
title: Tagged Post
tags: blog, hello, world
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.tags).toEqual(["blog", "hello", "world"]);
  });

  it("parses date as string", () => {
    const raw = `---
title: Dated Post
date: 2025-01-01
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.date).toBe("2025-01-01");
  });

  it("returns empty title and raw body when no frontmatter", () => {
    const raw = "Just body content without frontmatter";
    const result = parseFrontmatter(raw);
    expect(result.title).toBe("");
    expect(result.body).toBe(raw);
  });

  it.each([
    ['"Hello: 世界"', "Hello: 世界"],
    ["'Hello: 世界'", "Hello: 世界"],
    ["\"Hello'", "\"Hello'"],
    ["a", "a"],
    ["", ""],
  ])("parses the title %j without changing the body", (title, expected) => {
    const body = "# Body 😀\n\n---\nMore content\n";
    const result = parseFrontmatter(`---\ntitle: ${title}\n---\n${body}`);

    expect(result.title).toBe(expected);
    expect(result.body).toBe(body);
  });
});
