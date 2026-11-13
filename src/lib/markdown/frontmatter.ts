const RE_FRONTMATTER = /^---\n(?<metadata>[\s\S]*?)\n---\n(?<body>[\s\S]*)$/u;

const stripWrappedQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const [first] = trimmed;
  const last = trimmed.at(-1);
  if ((first === '"' || first === "'") && last === first) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

export interface Frontmatter {
  body: string;
  date?: string;
  description?: string;
  draft?: boolean;
  tags?: string[];
  title: string;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const match = raw.match(RE_FRONTMATTER);
  if (!match?.groups) {
    return { title: "", body: raw };
  }

  const meta: Record<string, string> = {};
  for (const line of match.groups.metadata.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) {
      meta[key.trim()] = stripWrappedQuotes(rest.join(":"));
    }
  }

  const tags = meta.tags
    ? meta.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : undefined;

  return {
    title: meta.title || "",
    description: meta.description,
    date: meta.date,
    draft: meta.draft === "true" ? true : undefined,
    tags,
    body: match.groups.body,
  };
}
