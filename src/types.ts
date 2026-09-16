export type DirectiveRendererParams = {
  context: Record<string, unknown>;
  storage: Storage;
  update: () => void;
  value: string;
  isStashed: boolean;
  placeholderHost: Comment | null;
  adopt: (element: ChildNode, context: Record<string, unknown>) => void;
  /**
   * Resolves a stash placeholder back to the node it stands in for, and returns
   * anything else unchanged. A stashed node is replaced in the document by a
   * comment, so a directive that recognises nodes by identity — as `for` does
   * with its instances — has to resolve a sibling before comparing it, or it
   * will not recognise its own work once another directive has hidden it.
   */
  resolve: (node: ChildNode) => ChildNode;
  host: ChildNode;
  name: string;
  attributeName: string;
  run: <T = unknown>(
    value: string,
    additionalContext?: Record<string, unknown>,
  ) => T;
};

export type DirectiveRendererResult = {
  skipChildren?: boolean;
  beforeUpdate?: () => void;
  afterUpdate?: () => void;
  isStashed?: boolean;
};

export type DirectiveRenderer = (
  params: DirectiveRendererParams,
) => DirectiveRendererResult | void;

export type DirectiveConfig = {
  render?: DirectiveRenderer;
  create?: (
    context: Record<string, unknown>,
    storage: Storage,
    update: () => void,
    options?: Record<string, unknown>,
  ) => void;
};
