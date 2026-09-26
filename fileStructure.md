```
Lords/
├── .vscode/
│   ├── extensions.json
│   └── launch.json
├── public/
│   └── favicon/
│       ├── android-chrome-192x192.png
│       ├── android-chrome-512x512.png
│       ├── apple-touch-icon.png
│       ├── favicon-16x16.png
│       ├── favicon-32x32.png
│       ├── favicon.ico
│       └── site.webmanifest
├── src/
│   ├── assets/
│   │   ├── 1789641717009.jpg
│   │   ├── 1789641717021.jpg
│   │   ├── 1789641717273.jpg
│   │   ├── Fern.svg
│   │   ├── FernBig.png
│   │   ├── FernBig.svg
│   │   ├── headerImg-temp.jpg
│   │   ├── headerImg.jpg
│   │   ├── headerImg.webp
│   │   ├── headerImgM.jpg
│   │   ├── headerImgM.webp
│   │   ├── L&LmobileLogo.svg
│   │   ├── LordsLogo-bg.png
│   │   ├── LordsLogo.png
│   │   ├── LordsLogo.svg
│   │   ├── MenuAlcDrinks.jpg
│   │   ├── MenuColdDrinks.jpg
│   │   ├── MenuDrinks.jpg
│   │   ├── MenuL&L.jpg
│   │   ├── MenuPage1.jpg
│   │   ├── MenuPage2.jpg
│   │   ├── MenuPlatter.jpg
│   │   ├── MenuShooters.jpg
│   │   ├── mobileFernRight.svg
│   │   └── R150deal.jpg
│   ├── components/
│   │   ├── Menu/
│   │   │   ├── data/
│   │   │   │   ├── drinks.json
│   │   │   │   ├── food.json
│   │   │   │   ├── platters.json
│   │   │   │   └── specials.json
│   │   │   └── index.astro
│   │   ├── ExcelUploader.astro
│   │   ├── Fonts.astro
│   │   └── Nav.astro
│   ├── db/
│   │   └── supabase.js
│   ├── favicon-temp/
│   │   ├── android-chrome-192x192.png
│   │   ├── android-chrome-512x512.png
│   │   ├── apple-touch-icon.png
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   ├── favicon.ico
│   │   └── site.webmanifest
│   ├── layouts/
│   │   └── Layout.astro
│   ├── lib/
│   │   └── staffSales/
│   │       ├── cashUp.ts
│   │       ├── sales_by_month.json
│   │       ├── sales_by_staff.json
│   │       ├── sales_raw.json
│   │       └── storage.ts
│   └── pages/
│       ├── api/
│       │   └── update-sales.ts
│       ├── staff/
│       │   ├── [name].astro
│       │   └── index.astro
│       ├── contact.astro
│       ├── index.astro
│       └── menu.astro
├── vendor/
│   └── xlsx-0.20.3.tgz
├── .gitattributes
├── .gitignore
├── .pages.yml
├── AGENTS.md
├── astro.config.mjs
├── fileDirectory.txt
├── FilePath.md
├── package-lock.json
├── package.json
└── tsconfig.json

```

Here is a list of the folder names and img names:
Menu/
|_ MenuAlcDrinks.jpg
|_ MenuColdDrinks.jpg
|_ MenuDrinks.jpg
|_ MenuL&L.jpg
|_ MenuPage1.jpg
|_ MenuPage2.jpg
|_ MenuPlatter.jpg
|_ MenuShooters.jpg
Special/
|_ mondaySpecial.jpg
|_ R150deal.jpg
|_ thursdaySpecial-1.jpg
|_ thursdaySpecial-2.jpg
|_ tuesdaySpecial.jpg
|_ wednesdaySpecial.jpg
|_ weeklySpecials.jpg

I want the menu images to appear in different pages and in different components, could you possible assist me with making a component for the main menu, for the platter and a slider component each in their own .astro file and using the images that are stored in my supabase storage. Also please use up to date documentation of the required language, and make any styling easy to edit and using the css variables available from the layout file given.
For the main menu component, would it be possible for it to load multiple images into the component and have them displayed in a certain order, seeing as the main Menu is split into different images

I get this error:
"window is not defined
Browser APIs are not available on the server.
Move your code to a <script> tag outside of the frontmatter, so the code runs on the client." after added my supabase storage url in my version even when I try my project url, using my .env.local and tried using a direct link towards my storage folder , in which is two folders named Menu and MenuSpecials.
