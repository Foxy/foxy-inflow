// Entry point for consumers that only need the rendering engine, exposed as
// `@foxy.io/inflow/core` and `inflow@1/core.js` on the CDN. Directive ships
// here too — custom directives are a Core-level extension point, and this
// entry leaves out the portal (and zod with it).
export { InflowCore as Core, type InflowCoreConfig } from "../core";
export { Directive } from "../Directive";
export type {
  DirectiveRendererParams,
  DirectiveRendererResult,
} from "../types";
