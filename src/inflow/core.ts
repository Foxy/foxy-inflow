import { LRUCache } from "lru-cache";
import { debounce } from "lodash-es";
import { Directive } from "./Directive";
import { ScopedStorage } from "./ScopedStorage";
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

  #prefix: string;

  #stash = new WeakMap<Comment, ChildNode>();

  #root: ChildNode;

  #directiveAliases: Record<string, string> = {};

  globalContext: Record<string, unknown> = {};

  #directives: Directive[] = [];

  storage: Storage;

  createAction: ActionDirective["createAction"];

  createSource: SourceDirective["createSource"];

  base: string;

  requestUpdate = debounce(() => {
    this.#beforeUpdateHandlers.forEach((fn) => fn());
    this.#beforeUpdateHandlers.length = 0;
    this.#afterUpdateHandlers.length = 0;
    this.render();
    this.#afterUpdateHandlers.forEach((fn) => fn());
  }, 250);

  constructor(config?: InflowCoreConfig) {
    this.#prefix = config?.prefix ?? "data-";
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
      ...(config?.directives ?? [])
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
        console.warn(`Overriding existing directive alias for "${key}" with "${value}".`);
      }
      this.#directiveAliases[key] = value;
    });

    this.globalContext.format = {
      currency: (value: string, lang = navigator.language) => {
        return parseFloat(value.substring(0, value.length - 3)).toLocaleString(lang, {
          currency: value.substring(value.length - 3).toLowerCase(),
          style: "currency",
        });
      },
      datetime: (value: string, lang = navigator.language) => {
        return new Date(value).toLocaleString(lang);
      },
      date: (value: string, lang = navigator.language) => {
        return new Date(value).toLocaleDateString(lang);
      },
    };

    this.createAction = this.#actionDirective.createAction.bind(this.#actionDirective);
    this.createSource = this.#sourceDirective.createSource.bind(this.#sourceDirective);
  }

  render(
    _node: ChildNode = this.#root,
    context: Record<string, any> = this.globalContext,
    processedNodes = new WeakSet<ChildNode>(),
    _lang?: string
  ) {
    const node = _node instanceof Comment ? this.#stash.get(_node) ?? _node : _node;

    // Is this truly necessary?
    if (processedNodes.has(node)) return;
    processedNodes.add(node);

    const isStashed = node !== _node;
    const lang = _lang ?? this.#getLang(node);

    if (node instanceof Element) {
      for (const directive of this.#directives) {
        const attribute = Array.from(node.attributes).find(({ name: key }) => {
          if (!key.startsWith(this.#prefix)) return false;

          const strippedKey = key.substring(this.#prefix.length);
          const resolvedKey = this.#directiveAliases[strippedKey] ?? strippedKey;

          return directive.prefix.endsWith("-")
            ? resolvedKey.startsWith(directive.prefix)
            : resolvedKey === directive.prefix;
        });

        if (attribute) {
          const handlerContext = Object.assign(context, {
            requestUpdate: this.requestUpdate,
            lang,
          });

          const strippedName = attribute.name.substring(this.#prefix.length);
          const resolvedName = this.#directiveAliases[strippedName] ?? strippedName;
          const result = directive.apply({
            isStashed,
            context: handlerContext,
            storage: this.storage,
            value: attribute.value,
            name: resolvedName,
            attributeName: attribute.name,
            placeholderHost: isStashed ? (_node as Comment) : null,
            host: node,
            base: this.base,
            update: this.requestUpdate,
            adopt: (e: ChildNode = document.body, c: Record<string, any>) => {
              this.render(e, c, processedNodes, this.#getLang(e, lang));
            },
            run: this.#createCachedFunction(handlerContext),
          });

          if (result?.beforeUpdate) this.#beforeUpdateHandlers.push(result.beforeUpdate);
          if (result?.afterUpdate) this.#afterUpdateHandlers.push(result.afterUpdate);

          if (!!result?.isStashed !== isStashed) {
            if (result?.isStashed) {
              const comment = document.createComment("");
              this.#stash.set(comment, node);
              node.replaceWith(comment);
            } else {
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
      return node.getAttribute("lang") || node.closest<Element>("[lang]")?.getAttribute("lang") || defaultValue;
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
