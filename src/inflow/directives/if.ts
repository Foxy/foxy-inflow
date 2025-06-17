import type { DirectiveConfig } from "../types";

const config: DirectiveConfig = {
  render: ({ value, run }) => {
    let newValue: boolean;

    try {
      newValue = !run(value);
    } catch (err) {
      console.warn("Error evaluating 'if' directive:", err);
      newValue = false; // Default to false if evaluation fails
    }

    return { skipChildren: newValue, isStashed: newValue };
  },
};

export default config;
