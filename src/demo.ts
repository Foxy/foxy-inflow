import "./demo.css";
import { Portal } from "./inflow";

new Portal({
  signInPageUrl: "/sign_in.html",
  homePageUrl: "/index.html",
  // Point this at your own store's Customer API before running `npm run dev`.
  base: "https://your-store.foxycart.com/s/customer/",
});
