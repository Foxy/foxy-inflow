import "./style.css";

import { inflowPortal } from "./inflow/portal";

inflowPortal({
  base: "https://store-dev-dan.foxycart.com/s/customer/",
  storage: "local",
  homePageUrl: "/index.html",
  signInPageUrl: "/sign_in.html",
  directivePrefix: "data-",
}).render();
