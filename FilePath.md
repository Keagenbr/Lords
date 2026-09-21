Directory structure:
└── keagenbr-lords/
├── AGENTS.md
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── src/
├── style.css
├── assets/
│ ├── favicon/
│ │ └── site.webmanifest
│ └── favicon-bgg/
│ └── site.webmanifest
├── components/
│ ├── ExcelUploader.astro
│ ├── Fonts.astro
│ ├── Nav.astro
│ └── Menu/
│ ├── index.astro
│ └── data/
│ ├── drinks.json
│ ├── food.json
│ ├── platters.json
│ └── specials.json
├── layouts/
│ └── Layout.astro
├── lib/
│ ├── nav.ts
│ └── staffSales/
│ ├── sales_by_month.json
│ ├── sales_by_staff.json
│ └── sales_raw.json
├── pages/
│ ├── contact.astro
│ ├── index.astro
│ ├── menu.astro
│ ├── api/
│ │ └── update-sales.ts
│ └── staff/
│ ├── [name].astro
│ └── index.astro
