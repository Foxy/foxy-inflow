import { LRUCache } from "lru-cache";
import { debounce } from "lodash-es";
import { Directive } from "./Directive";
import { ScopedStorage } from "./ScopedStorage";
import { AsDirective } from "./directives/as";
import { CloakDirective } from "./directives/cloak";
import { RefDirective } from "./directives/ref";
import { SourceDirective } from "./directives/source";
import { IfDirective } from "./directives/if";
import { IfNotDirective } from "./directives/if-not";
import { ForDirective } from "./directives/for";
import { PropDirective } from "./directives/prop";
import { AttrDirective } from "./directives/attr";
import { BAttrDirective } from "./directives/battr";
import { OnDirective } from "./directives/on";
import { V8NDirective } from "./directives/v8n";
import { ActionDirective } from "./directives/action";

export type InflowCoreConfig = {
  onTokenExpiry?: () => void;
  getToken?: () => string | null;
  prefix?: string;
  base?: string;
  root?: ChildNode;
  directives?: Directive[];
  directiveAliases?: Record<string, string>;
};

export class InflowCore {
  #beforeUpdateHandlers: (() => void)[] = [];

  #afterUpdateHandlers: (() => void)[] = [];

  #sourceDirective: SourceDirective;

  #actionDirective: ActionDirective;

  #functionCache = new LRUCache<string, Function>({ max: 1000 });

  /**
   * The attribute prefix every directive is matched by, `data-` unless
   * configured otherwise. Public because markers that are not directives —
   * `data-json` on a form field — have to follow it too.
   */
  readonly prefix: string;

  // The owner is the directive that put the node away. Only it may take the
  // node back out — see the un-stash branch in `render()`.
  #stash = new WeakMap<Comment, { node: ChildNode; owner: Directive }>();

  #root: ChildNode;

  #directiveAliases: Record<string, string> = {};

  globalContext: Record<string, unknown> = {};

  #directives: Directive[] = [];

  storage: Storage;

  createAction: ActionDirective["createAction"];

  createSource: SourceDirective["createSource"];

  base: string;

  // Annotated rather than inferred: without this the public type is lodash's
  // DebouncedFunc, which drags `@types/lodash` into the published
  // declarations. Nothing here uses its `cancel`/`flush`, and the documented
  // surface is a plain call.
  requestUpdate: () => void = debounce(() => {
    this.#beforeUpdateHandlers.forEach((fn) => fn());
    this.#beforeUpdateHandlers.length = 0;
    this.#afterUpdateHandlers.length = 0;
    this.render();
    this.#afterUpdateHandlers.forEach((fn) => fn());
  }, 250);

  constructor(config?: InflowCoreConfig) {
    this.prefix = config?.prefix ?? "data-";
    this.#root = config?.root ?? document.body;
    this.base = config?.base ?? "";

    // Must be assigned before the directives are constructed: SourceDirective
    // reads inflow.storage in a field initializer.
    this.storage = new ScopedStorage(this.base);

    this.#sourceDirective = new SourceDirective({
      prefix: "source",
      inflow: this,
      getToken: config?.getToken,
      onTokenExpiry: config?.onTokenExpiry,
    });

    this.#actionDirective = new ActionDirective({
      prefix: "action",
      inflow: this,
    });

    this.#directives.push(
      // First: everything after this has to see the element `as` produced.
      new AsDirective({ prefix: "as", inflow: this }),
      new CloakDirective({ prefix: "cloak", inflow: this }),
      new RefDirective({ prefix: "ref", inflow: this }),
      this.#sourceDirective,
      this.#actionDirective,
      new IfDirective({ prefix: "if", inflow: this }),
      new IfNotDirective({ prefix: "if-not", inflow: this }),
      new ForDirective({ prefix: "for", inflow: this }),
      new PropDirective({ prefix: "prop-", inflow: this }),
      new AttrDirective({ prefix: "attr-", inflow: this }),
      new BAttrDirective({ prefix: "battr-", inflow: this }),
      new OnDirective({ prefix: "on-", inflow: this }),
      new V8NDirective({ prefix: "v8n", inflow: this }),
      ...(config?.directives ?? []),
    );

    this.#directiveAliases["text"] = "prop-textcontent";
    this.#directiveAliases["value"] = "attr-value";
    this.#directiveAliases["href"] = "attr-href";
    this.#directiveAliases["disabled"] = "battr-disabled";
    this.#directiveAliases["readonly"] = "battr-readonly";
    this.#directiveAliases["hidden"] = "battr-hidden";
    this.#directiveAliases["checked"] = "battr-checked";
    this.#directiveAliases["selected"] = "battr-selected";
    this.#directiveAliases["required"] = "battr-required";
    this.#directiveAliases["open"] = "battr-open";

    Object.entries(config?.directiveAliases ?? {}).forEach(([key, value]) => {
      if (this.#directiveAliases[key]) {
        console.warn(
          `Overriding existing directive alias for "${key}" with "${value}".`,
        );
      }
      this.#directiveAliases[key] = value;
    });

    this.globalContext.format = {
      currency: (value: string, lang = navigator.language) => {
        return parseFloat(value.substring(0, value.length - 3)).toLocaleString(
          lang,
          {
            currency: value.substring(value.length - 3).toLowerCase(),
            style: "currency",
          },
        );
      },
      datetime: (value: string, lang = navigator.language) => {
        return new Date(value).toLocaleString(lang);
      },
      date: (value: string, lang = navigator.language) => {
        return new Date(value).toLocaleDateString(lang);
      },
    };

    this.createAction = this.#actionDirective.createAction.bind(
      this.#actionDirective,
    );
    this.createSource = this.#sourceDirective.createSource.bind(
      this.#sourceDirective,
    );
  }

  render(
    _node: ChildNode = this.#root,
    context: Record<string, any> = this.globalContext,
    processedNodes = new WeakSet<ChildNode>(),
    _lang?: string,
  ) {
    const stashEntry =
      _node instanceof Comment ? this.#stash.get(_node) : void 0;
    const node = stashEntry?.node ?? _node;

    // Is this truly necessary?
    if (processedNodes.has(node)) return;
    processedNodes.add(node);

    const isStashed = node !== _node;
    const lang = _lang ?? this.#getLang(node);

    if (node instanceof Element) {
      for (const directive of this.#directives) {
        // Every matching attribute, not just the first. The prefix directives
        // (`attr-`, `prop-`, `battr-`, `on-`) are the ones an element can
        // legitimately repeat, and they only ever read and write the host, so
        // applying each in document order is enough.
        const matches = Array.from(node.attributes).filter(({ name: key }) => {
          if (!key.startsWith(this.prefix)) return false;

          const strippedKey = key.substring(this.prefix.length);
          const resolvedKey =
            this.#directiveAliases[strippedKey] ?? strippedKey;

          return directive.prefix.endsWith("-")
            ? resolvedKey.startsWith(directive.prefix)
            : resolvedKey === directive.prefix;
        });

        // The exact-match directives are the ones that stash the node or skip
        // its children, and the loop below reads the stash state it was given
        // once. Keep them to a single attribute so that stays true: HTML has no
        // duplicate attribute names, but a custom alias in `directiveAliases`
        // can resolve a second name onto the same exact prefix.
        const attributes = directive.prefix.endsWith("-")
          ? matches
          : matches.slice(0, 1);

        for (const attribute of attributes) {
          const handlerContext = Object.assign(context, {
            requestUpdate: this.requestUpdate,
            lang,
          });

          const strippedName = attribute.name.substring(this.prefix.length);
          const resolvedName =
            this.#directiveAliases[strippedName] ?? strippedName;
          const result = directive.apply({
            isStashed,
            context: handlerContext,
            storage: this.storage,
            value: attribute.value,
            name: resolvedName,
            attributeName: attribute.name,
            placeholderHost: isStashed ? (_node as Comment) : null,
            host: node,
            update: this.requestUpdate,
            adopt: (e: ChildNode = document.body, c: Record<string, any>) => {
              this.render(e, c, processedNodes, this.#getLang(e, lang));
            },
            resolve: (n: ChildNode) =>
              n instanceof Comment ? (this.#stash.get(n)?.node ?? n) : n,
            run: this.#createCachedFunction(handlerContext),
          });

          if (result?.beforeUpdate)
            this.#beforeUpdateHandlers.push(result.beforeUpdate);
          if (result?.afterUpdate)
            this.#afterUpdateHandlers.push(result.afterUpdate);

          // Only a directive that actually expressed a stash decision may move
          // the node in or out of the stash. Treating a missing `isStashed` as
          // `false` un-stashed whatever the directive before it had put away.
          // `if` and `for` got away with it because they also skip the node's
          // children, which leaves this loop before any later directive runs —
          // but `as` is registered first and returns nothing once the tag
          // already matches, so from the second render on it restored the
          // template `for` was holding. That detached the placeholder `for`
          // counts its instances from, so it cloned the row again every pass.
          //
          // Staying silent is not enough on its own, because `if` never does:
          // it reports `isStashed: false` whenever its condition is true, which
          // is a claim about `if` alone, not about the node. On an element
          // carrying both `data-if` and `data-for` that claim used to restore
          // the template `for` had stashed on the pass before — putting the
          // bare template back in the document and detaching the placeholder,
          // so `for` no longer recognised its own instances and the child walk
          // re-rendered them against the outer context, blanking every bound
          // value. Hence ownership: a directive may only take back the node it
          // put away itself.
          if (
            result &&
            "isStashed" in result &&
            !!result.isStashed !== isStashed
          ) {
            if (result?.isStashed) {
              const comment = document.createComment("");
              this.#stash.set(comment, { node, owner: directive });
              node.replaceWith(comment);
            } else if (stashEntry?.owner === directive) {
              _node.replaceWith(node);
              this.#stash.delete(_node as Comment);
            }
          }

          if (result?.skipChildren) return;
        }
      }
    }

    for (const child of node.childNodes) {
      this.render(child, context, processedNodes, this.#getLang(child, lang));
    }
  }

  #getLang(node: ChildNode, defaultValue = navigator.language): string {
    if (node instanceof Element) {
      return (
        node.getAttribute("lang") ||
        node.closest<Element>("[lang]")?.getAttribute("lang") ||
        defaultValue
      );
    } else {
      return defaultValue;
    }
  }

  #createCachedFunction(context: Record<string, any>) {
    return (value: string, additionalContext = {}) => {
      let cachedFunction = this.#functionCache.get(value);
      const resolvedContext = { ...context, ...additionalContext };

      if (!cachedFunction) {
        const contextKeys = Object.keys(resolvedContext);
        const code = `const{${contextKeys}}=this;return(${value});`;
        cachedFunction = new Function(code);
        this.#functionCache.set(value, cachedFunction);
      }

      return cachedFunction.call(resolvedContext);
    };
  }
}
