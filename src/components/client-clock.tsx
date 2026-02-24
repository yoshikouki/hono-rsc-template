"use client";

import { useEffect, useState } from "react";

export function ClientClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString("ja-JP"));

  useEffect(() => {
    const id = setInterval(
      () => setTime(new Date().toLocaleTimeString("ja-JP")),
      1000
    );
    return () => clearInterval(id);
  }, []);

  return (
    <code
      style={{
        fontFamily: "monospace",
        fontSize: "1.5rem",
        background: "#f0f0f0",
        padding: "0.25rem 0.75rem",
        borderRadius: "4px",
      }}
    >
      {time}
    </code>
  );
}
