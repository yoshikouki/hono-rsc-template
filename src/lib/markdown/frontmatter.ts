const RE_FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

const stripWrappedQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed.at(-1);
  if ((first === '"' || first === "'") && last === first) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

export interface Frontmatter {
  title: string;
  description?: string;
  body: string;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const match = raw.match(RE_FRONTMATTER);
  if (!match) {
    return { title: "", body: raw };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) {
      meta[key.trim()] = stripWrappedQuotes(rest.join(":"));
    }
  }

  return {
    title: meta.title || "",
    description: meta.description,
    body: match[2],
  };
}
