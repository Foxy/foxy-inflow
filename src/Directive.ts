import { InflowCore } from "./core";
import { DirectiveRendererParams, DirectiveRendererResult } from "./types";

type DirectiveConfig = { prefix: string; inflow: InflowCore };

export class Directive {
  readonly prefix: string;
  readonly inflow: InflowCore;

  constructor({ prefix, inflow }: DirectiveConfig) {
    this.prefix = prefix;
    this.inflow = inflow;
  }

  apply(_params: DirectiveRendererParams): DirectiveRendererResult | void {
    // This method should be overridden by subclasses
    console.warn("render method not implemented in Directive subclass");
  }
}

export type { DirectiveRendererParams, DirectiveRendererResult } from "./types";
