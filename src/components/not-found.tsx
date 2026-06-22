import type { RouteMeta } from "@/framework/types";

export const resolveMeta = (): RouteMeta => ({
  title: "Not Found",
});

export default function NotFound() {
  return (
    <main>
      <h1>404 - Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
    </main>
  );
}
