import "./main.css";
import { Portal } from "../src/index";

new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://customer-portal.foxycart.com/s/customer/",
});
