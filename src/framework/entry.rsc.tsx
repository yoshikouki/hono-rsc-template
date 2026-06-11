import { notFound, routeGlobs, site } from "@/site";
import { createApp } from "./server";

const app = createApp({ site, globs: routeGlobs, notFound });

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
