import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class IfNotDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { value, run } = params;
    let newValue: boolean;

    try {
      newValue = !!run(value);
    } catch (err) {
      console.warn("Error evaluating 'if' directive:", err);
      newValue = false; // Default to false if evaluation fails
    }

    return { skipChildren: newValue, isStashed: newValue };
  }
}
