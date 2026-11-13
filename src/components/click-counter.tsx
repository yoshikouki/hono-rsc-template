"use client";

import { useCallback, useState } from "react";

export function ClickCounter() {
  const [count, setCount] = useState(0);

  const handleClick = useCallback(() => {
    setCount((c) => c + 1);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <button
        onClick={handleClick}
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
        type="button"
      >
        Click me
      </button>
      <span style={{ fontSize: "1.25rem", fontWeight: "bold" }}>
        {count} clicks
      </span>
    </div>
  );
}
