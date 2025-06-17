export type DirectiveRenderer = (params: {
  options?: Record<string, unknown>;
  context: Record<string, unknown>;
  storage: Storage;
  update: () => void;
  value: string;
  isStashed: boolean;
  placeholderHost: Comment | null;
  adopt: (element: ChildNode, context: Record<string, unknown>) => void;
  host: ChildNode;
  base: string;
  name: string;
  attributeName: string;
  run: <T = unknown>(
    value: string,
    additionalContext?: Record<string, unknown>
  ) => T;
}) => {
  skipChildren?: boolean;
  beforeUpdate?: () => void;
  isStashed?: boolean;
} | void;

export type DirectiveConfig = {
  render?: DirectiveRenderer;
  create?: (
    context: Record<string, unknown>,
    storage: Storage,
    update: () => void,
    options?: Record<string, unknown>
  ) => void;
};

export type PluginConfig = {
  create?: (
    context: Inflow,
    options?: Record<string, unknown>
  ) => Record<string, unknown>;
};

export type Inflow = {
  globalContext: Record<string, unknown>;
  storage: Storage;
  render: (
    element?: Element,
    context?: Record<string, any>,
    processedNodes?: WeakSet<Node>,
    lang?: string
  ) => void;
  requestUpdate: () => void;
  directive: (
    name: string | RegExp,
    config: DirectiveConfig,
    options?: Record<string, unknown>
  ) => void;
  plugin: (
    name: string,
    config: PluginConfig,
    options?: Record<string, unknown>
  ) => void;
  base: string;
};
