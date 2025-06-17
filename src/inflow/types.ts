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
