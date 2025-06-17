export type DirectiveRendererParams = {
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
};

export type DirectiveRendererResult = {
  skipChildren?: boolean;
  beforeUpdate?: () => void;
  isStashed?: boolean;
};

export type DirectiveRenderer = (
  params: DirectiveRendererParams
) => DirectiveRendererResult | void;

export type DirectiveConfig = {
  render?: DirectiveRenderer;
  create?: (
    context: Record<string, unknown>,
    storage: Storage,
    update: () => void,
    options?: Record<string, unknown>
  ) => void;
};
