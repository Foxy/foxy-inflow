import type { DirectiveConfig } from "../types";

const config: DirectiveConfig = {
  create: (context) => (context.refs = {}),
  render: ({ context, host, value }) => {
    (context.refs as Record<string, ChildNode>)[value] = host;
  },
};

export default config;
