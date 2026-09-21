Directory structure:
└── keagenbr-lords/
├── AGENTS.md
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── src/
├── assets/
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
│ └── staffSales/
│ ├── cashUp.ts
│ ├── sales_by_month.json
│ ├── sales_by_staff.json
│ ├── sales_raw.json
│ └── storage.ts
├── pages/
│ ├── contact.astro
│ ├── index.astro
│ ├── menu.astro
│ ├── api/
│ │ └── update-sales.ts
│ └── staff/
│ ├── [name].astro
│ └── index.astro
