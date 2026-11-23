import { withBase } from "./base-url.mjs";

/** Shared URLs work in the browser build and geometry tests. */
export function assetUrl(path) {
  return typeof window === "undefined"
    ? new URL("../../public/assets/" + path, import.meta.url).href
    : new URL(withBase("assets/" + path), window.location.href).href;
}
