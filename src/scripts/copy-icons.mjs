import { copyFileSync, existsSync, mkdirSync } from "node:fs";

// data-icon name -> Lucide icon name (swap any you like from lucide.dev/icons)
const MAP = {
  home: "house",
  menu: "book-open",
  contact: "mail",
  "menu-editor": "square-pen",
  "chevron-down": "chevron-down",
  "chevron-right": "chevron-right",
  drinks: "beer",
  food: "utensils",
  specials: "star",
  platters: "utensils-crossed",
  email: "mail",
  password: "lock",
  eye: "eye",
  "eye-off": "eye-off",
  user: "user",
  edit: "pencil",
  logout: "log-out",
  "menu-items": "list",
  "main-menu": "book-open",
  "specials-slider": "gallery-horizontal",
  platter: "image",
  staff: "users",
  "live-menu": "globe",
  back: "arrow-left",
  open: "arrow-up-right",
};

mkdirSync("public/icons", { recursive: true });
for (const [name, lucide] of Object.entries(MAP)) {
  const from = `node_modules/lucide-static/icons/${lucide}.svg`;
  if (!existsSync(from)) {
    console.warn("Not found:", lucide);
    continue;
  }
  copyFileSync(from, `public/icons/${name}.svg`);
}
