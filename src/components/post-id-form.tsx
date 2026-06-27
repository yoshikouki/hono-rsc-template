"use client";

import { useState } from "react";

interface PostIdFormProps {
  id: string;
}

function postDetailPath(id: string): string {
  return `/posts/${encodeURIComponent(id)}/detail`;
}

export function PostIdForm({ id }: PostIdFormProps) {
  const [nextId, setNextId] = useState(id);

  return (
    <form
      className="mt-8 flex flex-col gap-3 rounded border bg-gray-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = nextId.trim();
        if (trimmed) {
          window.location.assign(postDetailPath(trimmed));
        }
      }}
    >
      <label className="font-semibold text-sm" htmlFor="post-id">
        Post ID
      </label>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border bg-white px-3 py-2"
          id="post-id"
          name="id"
          onChange={(event) => setNextId(event.currentTarget.value)}
          type="text"
          value={nextId}
        />
        <button
          className="rounded border bg-gray-100 px-4 py-2 font-semibold hover:bg-white"
          type="submit"
        >
          Open
        </button>
      </div>
    </form>
  );
}
