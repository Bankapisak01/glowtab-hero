/**
 * Base path of the deployed app: "/" for dev, preview and the portable demo,
 * "/<repo>/" when hosted beneath a subpath such as GitHub Pages. Vite fills
 * import.meta.env.BASE_URL from its `base` option; Node tests fall back to "/".
 */
export const BASE_URL =
  (typeof import.meta.env !== "undefined" && import.meta.env.BASE_URL) || "/";

/** Prefix a root-relative path ("/assets/x" or "assets/x") with the base path. */
export function withBase(path) {
  return BASE_URL.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}
