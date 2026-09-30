Lords/
├── .astro/
│   ├── collections/
│   ├── content.d.ts
│   ├── dev.json
│   ├── dev.log
│   ├── preview.json
│   ├── settings.json
│   └── types.d.ts
├── public/
│   ├── assets/
│   ├── icons/
│   │   ├── back.svg
│   │   ├── chevron-down.svg
│   │   ├── chevron-right.svg
│   │   ├── contact.svg
│   │   ├── double-chevron-down.svg
│   │   ├── drinks.svg
│   │   ├── edit.svg
│   │   ├── email.svg
│   │   ├── eye-off.svg
│   │   ├── eye.svg
│   │   ├── food.svg
│   │   ├── home.svg
│   │   ├── live-menu.svg
│   │   ├── logout.svg
│   │   ├── main-menu.svg
│   │   ├── menu-editor.svg
│   │   ├── menu-items.svg
│   │   ├── menu.svg
│   │   ├── open.svg
│   │   ├── password.svg
│   │   ├── platter.svg
│   │   ├── platters.svg
│   │   ├── specials-slider.svg
│   │   ├── specials.svg
│   │   ├── staff.svg
│   │   └── user.svg
│   ├── android-chrome-192x192.png
│   ├── android-chrome-512x512.png
│   ├── apple-touch-icon.png
│   ├── favicon-96x96.png
│   ├── favicon.ico
│   ├── favicon.svg
│   ├── robots.txt
│   ├── site.webmanifest
│   ├── web-app-manifest-192x192.png
│   └── web-app-manifest-512x512.png
├── src/
│   ├── assets/
│   │   ├── Fonts/
│   │   │   ├── great-vibes.zip
│   │   │   ├── GreatVibes-Regular.ttf
│   │   │   └── OFL.txt
│   │   ├── menuImg/
│   │   │   ├── MenuAlcDrinks.jpg
│   │   │   ├── MenuColdDrinks.jpg
│   │   │   ├── MenuDrinks.jpg
│   │   │   ├── MenuDrinkSpecial(gin).jpeg
│   │   │   ├── MenuL&L.jpg
│   │   │   ├── MenuPage1.jpg
│   │   │   ├── MenuPage2.jpg
│   │   │   ├── MenuPlatter.jpg
│   │   │   ├── MenuShooters.jpg
│   │   │   ├── mondaySpecial.jpg
│   │   │   ├── R150deal.jpg
│   │   │   ├── thursdaySpecial-1.jpg
│   │   │   ├── thursdaySpecial-2.jpg
│   │   │   ├── tuesdaySpecial.jpg
│   │   │   ├── wednesdaySpecial.jpg
│   │   │   └── weeklySpecials.jpg
│   │   ├── 1789641717009.jpg
│   │   ├── 1789641717021.jpg
│   │   ├── 1789641717273.jpg
│   │   ├── angles-up-solid-full.svg
│   │   ├── Fern.svg
│   │   ├── FernBig.png
│   │   ├── FernBig.svg
│   │   ├── headerBottom.svg
│   │   ├── headerImg.webp
│   │   ├── L&LmobileLogo.svg
│   │   ├── lordsBar.jpg
│   │   ├── lordsBar.webp
│   │   ├── lordsEntrance.jpg
│   │   ├── lordsEntrance.webp
│   │   ├── LordsLogo-bg.png
│   │   ├── LordsLogo.png
│   │   ├── LordsLogo.svg
│   │   └── mobileFernRight.svg
│   ├── components/
│   │   ├── Menu/
│   │   │   ├── index.astro
│   │   │   ├── MenuMain.astro
│   │   │   ├── MenuPlatter.astro
│   │   │   └── MenuSlider.astro
│   │   ├── MetaData/
│   │   │   ├── Aeo.astro
│   │   │   ├── Favicons.astro
│   │   │   ├── Geo.astro
│   │   │   ├── Llmo.astro
│   │   │   └── Seo.astro
│   │   ├── AuthSessionManager.astro
│   │   ├── CategoryNav.astro
│   │   ├── ExcelUploader.astro
│   │   ├── Fonts.astro
│   │   ├── Footer.astro
│   │   ├── MenuEditor.astro
│   │   ├── MenuEditorNav.astro
│   │   ├── MenuImageEditor.astro
│   │   ├── Nav.astro
│   │   └── topBtn.astro
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
│   │   ├── staffSales/
│   │   │   ├── cashUp.ts
│   │   │   ├── sales_by_month.json
│   │   │   ├── sales_by_staff.json
│   │   │   ├── sales_raw.json
│   │   │   └── storage.ts
│   │   ├── adminAuth.ts
│   │   ├── menu.ts
│   │   ├── menuImages.ts
│   │   ├── supabase.ts
│   │   ├── supabaseAdmin.ts
│   │   ├── Supabaseserver.ts
│   │   └── supabaseStorage.ts
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── menu-editor/
│   │   │   │   └── [section].astro
│   │   │   ├── index.astro
│   │   │   ├── login.astro
│   │   │   ├── menu-crud.ts
│   │   │   ├── menu-editor.astro
│   │   │   └── upload-image.ts
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── display-name.ts
│   │   │   │   ├── signin.ts
│   │   │   │   └── signout.ts
│   │   │   ├── menu/
│   │   │   │   └── index.ts
│   │   │   ├── logout.ts
│   │   │   ├── nav.ts
│   │   │   └── update-sales.ts
│   │   ├── staff/
│   │   │   ├── [name].astro
│   │   │   ├── index.astro
│   │   │   └── login.astro
│   │   ├── contact.astro
│   │   ├── index.astro
│   │   └── menu.astro
│   ├── scripts/
│   │   ├── copy-icons.mjs
│   │   └── passwordToggle.ts
│   └── styles/
│       ├── icons.css
│       └── password-toggle.css
├── vendor/
│   └── xlsx-0.20.3.tgz
├── .env
├── .env.local
├── .env.production
├── .gitattributes
├── .gitignore
├── AGENTS.md
├── astro.config.mjs
├── package-lock.json
├── package.json
├── tree.py
└── tsconfig.json

27 directories, 154 files