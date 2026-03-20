import { describe, expect, test } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  test("parses title and description", () => {
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

  test("returns empty title and raw body when no frontmatter", () => {
    const raw = "Just body content without frontmatter";
    const result = parseFrontmatter(raw);
    expect(result.title).toBe("");
    expect(result.body).toBe(raw);
  });

  test("strips wrapped quotes from values", () => {
    const raw = `---
title: "Quoted Title"
description: 'Single quoted'
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.title).toBe("Quoted Title");
    expect(result.description).toBe("Single quoted");
  });

  test("handles missing description", () => {
    const raw = `---
title: Only Title
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.title).toBe("Only Title");
    expect(result.description).toBeUndefined();
    expect(result.body).toBe("Body");
  });

  test("parses draft: true as boolean", () => {
    const raw = `---
title: Draft Post
draft: true
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.draft).toBe(true);
  });

  test("parses draft: false as undefined", () => {
    const raw = `---
title: Published Post
draft: false
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.draft).toBeUndefined();
  });

  test("parses tags from comma-separated string", () => {
    const raw = `---
title: Tagged Post
tags: blog, hello, world
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.tags).toEqual(["blog", "hello", "world"]);
  });

  test("parses date as string", () => {
    const raw = `---
title: Dated Post
date: 2025-01-01
---
Body`;
    const result = parseFrontmatter(raw);
    expect(result.date).toBe("2025-01-01");
  });
});
