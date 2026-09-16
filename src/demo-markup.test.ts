import { InflowPortal } from "./portal";

/**
 * The demo pages are the reference merchants copy from, and nothing else in
 * this suite looks at them. Two bugs got in that way: a form posting a field
 * name no validator covers, and error blocks comparing `validationMessage` to
 * a raw zod code, which every one of them stopped matching the moment those
 * codes got default messages.
 *
 * Both are visible in the markup, so check the markup.
 */
// Read through Vite rather than `node:fs`: this project has no Node types, and
// the glob keeps new demo pages covered without anyone remembering to add them.
const SOURCES: Record<string, string> = import.meta.glob("../demo/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

const PAGES = Object.keys(SOURCES).map((path) => path.replace("../demo/", ""));

function parse(page: string) {
  return new DOMParser().parseFromString(
    SOURCES[`../demo/${page}`],
    "text/html",
  );
}

function validators() {
  const portal = new InflowPortal({
    base: "https://store.example.com/s/customer/",
    signInPageUrl: "/sign_in.html",
    homePageUrl: "/index.html",
    manualRender: true,
  });

  return (
    portal.globalContext.portal as {
      v8n: Record<string, Record<string, unknown>>;
    }
  ).v8n;
}

describe("demo markup", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("has pages to check", () => {
    expect(PAGES.length).toBeGreaterThan(0);
  });

  // `validationMessage` holds whatever the validator returned. That is the
  // error code only while the code has no message — supply one and every
  // comparison against it silently goes false, taking the page's error display
  // with it. Render the message instead.
  it("never branches on the text of a validation message", () => {
    const offences: string[] = [];

    PAGES.forEach((page) => {
      parse(page)
        .querySelectorAll("*")
        .forEach((element) => {
          Array.from(element.attributes)
            .filter((attribute) => attribute.name.startsWith("data-"))
            .forEach((attribute) => {
              if (/validationMessage\s*[!=]==?\s*['"]/.test(attribute.value)) {
                offences.push(
                  `${page}: ${attribute.name}="${attribute.value}"`,
                );
              }
            });
        });
    });

    expect(offences).toEqual([]);
  });

  // `data-v8n` matches validators to controls by the control's `name`, so a
  // name with no validator is a field that is never checked — and, when the
  // name is simply wrong, a field the API never receives either.
  it("names every field in a validated form after a validator that exists", () => {
    const groups = validators();
    const offences: string[] = [];

    PAGES.forEach((page) => {
      parse(page)
        .querySelectorAll("[data-v8n]")
        .forEach((form) => {
          const value = form.getAttribute("data-v8n")!;
          const group = value.replace(/^portal\.v8n\./, "");
          const fields = groups[group];

          if (!fields) {
            offences.push(
              `${page}: data-v8n="${value}" names no validator group`,
            );
            return;
          }

          form
            .querySelectorAll("input[name], select[name], textarea[name]")
            .forEach((control) => {
              const name = control.getAttribute("name")!;
              if (!(name in fields)) {
                offences.push(
                  `${page}: <${control.tagName.toLowerCase()} name="${name}"> has no validator in ${group}`,
                );
              }
            });
        });
    });

    expect(offences).toEqual([]);
  });
});
