import "./demo.css";
import { Portal } from "./inflow";

new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  base: "https://store-dev-dan.foxycart.com/s/customer/",
});
