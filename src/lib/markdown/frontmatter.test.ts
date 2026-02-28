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
});
