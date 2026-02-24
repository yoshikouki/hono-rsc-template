"use client";

import { useState } from "react";

export function ClickCounter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <button
        onClick={() => setCount((c) => c + 1)}
        style={{
          padding: "0.5rem 1.5rem",
          fontSize: "1rem",
          cursor: "pointer",
          borderRadius: "4px",
          border: "1px solid #ccc",
          background: count > 0 ? "#0070f3" : "#fff",
          color: count > 0 ? "#fff" : "#000",
          transition: "all 0.15s",
        }}
      >
        Click me
      </button>
      <span style={{ fontSize: "1.25rem", fontWeight: "bold" }}>
        {count} clicks
      </span>
    </div>
  );
}
