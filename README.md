Lords & Legends — Astro Website / Ordering & Admin System

1. Project overview

Lords & Legends is an Astro-based restaurant website with three primary public pages:

/ — Home

/menu — Menu, takeaway ordering and menu downloads

/contact — General enquiry and group-booking forms

It also contains a role-protected Admin area for menu/content management, site settings, takeaway scheduling, image/PDF management and booking-date blocking, plus a Staff area for the existing staff workflow.

The current project uses Astro + TypeScript + Alpine.js + SCSS/CSS + Supabase + Vercel. The application is rendered dynamically where live Supabase content is required (prerender = false on the relevant pages/routes).

Styling convention: The project is intended to use vanilla CSS/SCSS. Tailwind packages/plugin are present in package.json/astro.config.mjs, but the current UI styling is written with SCSS/CSS and CSS custom properties. Continue the existing SCSS approach unless the project is deliberately migrated to Tailwind.

2. Technology stack

Area

Current implementation

Framework

Astro 7

Language

TypeScript / Astro templates

Client-side interactivity

Alpine.js 3 via CDN in Layout.astro

Styling

SCSS + CSS custom properties

Database

Supabase Postgres

Authentication

Supabase Auth + HTTP-only access/refresh cookies

Storage

Supabase Storage

Image processing

Sharp via optimizeImage.ts

Excel support

xlsx local vendor package

Icons

SVG files + icons.css

Deployment

Vercel adapter

Node

24.x (see package.json)

React

Integration/package is installed, but the main site flow is Astro/Alpine

Important runtime behaviour

src/layouts/Layout.astro loads Alpine before the page components are hydrated. Components using Alpine therefore generally register their x-data factories with script is:inline or otherwise ensure Alpine has the factory available at initialisation time.

The main layout imports the global style sheets and common UI components once, so public and admin pages inherit the same design variables.

3. Brand / visual design system

The source of truth for the global colour variables is src/layouts/Layout.astro.

3.1 Global colour tokens

CSS variable

Current value

Approx. hex

Purpose

--bg-color-light

hsl(14, 45%, 95%)

#f8efed

Main warm/light page background

--bg-color-btn

hsl(14, 45%, 30%)

#6f3a2a

Primary brown / buttons / headings

--bg-color-dark

hsl(20, 100%, 5%)

#1a0800

Dark backgrounds / hero base

--bg-color

var(--bg-color-light)

#f8efed

Active page background token

--ham-color

hsl(215 30% 10%)

#121821

Hamburger/nav icon colour

--ham-color-active

hsl(215 30% 70%)

#9cafc9

Active hamburger colour

--nav-bg

hsl(14, 45%, 85%)

#ead0c8

Navigation / borders / soft panels

--nav-bg-highlight

hsl(17 30% 85.5%)

#e5d5cf

Navigation highlight

--nav-bg-shadow

hsl(226 99.6% 7%)

#000824

Deep shadow colour

--nav-bg-shadowA

hsla(226 99.6% 7% / 0.5)

—

Semi-transparent shadow

--text-color

hsl(30, 50%, 99%)

#fefcfb

Light text

--text-color-light

hsl(20, 100%, 5%)

#1a0800

Dark text

--text-color-dark

hsl(30, 50%, 99%)

#fefcfb

Light text used over dark/brand surfaces

--txt-color

var(--text-color-light)

#1a0800

Current default text token

--text-color-hover

hsl(16, 45%, 30%)

#6f3c2a

Hover/accent brown

--MenuColor

hsl(185 85% 40%)

#0faebd

Teal accent / focus / headings underline

--MenuColorA

hsla(185 85% 5% / 0.9)

—

Dark teal overlay

--img-overlay

hsla(183 85.4% 2.3% / 0.8)

—

Hero/modal backdrop overlay

Use the CSS variables rather than repeating raw colours when adding or modifying UI. This keeps forms, modal dialogs, admin tools and menu elements visually consistent.

3.2 Typography

Noto Sans

The normal interface font. It is loaded from Google Fonts in:

src/components/Fonts.astro

It is also explicitly the global body font in src/layouts/Layout.astro:

body {
font-family: "Noto Sans", sans-serif;
}

Use it for:

body copy

navigation

form fields

buttons

labels

admin interfaces

menu item names/prices

Pinyon Script

The decorative script/brand heading font. It is loaded from Google Fonts in src/components/Fonts.astro and used for prominent headings such as the Home hero and Contact heading.

Typical usage:

font-family: "Pinyon Script", "Great Vibes", cursive;

Local font asset: GreatVibes-Regular.ttf

A local Great Vibes font exists here:

src/assets/Fonts/GreatVibes-Regular.ttf

and the font folder also contains:

src/assets/Fonts/great-vibes.zip
src/assets/Fonts/OFL.txt

The current Fonts.astro loader does not load Great Vibes directly from the local TTF. It is currently a fallback name in some decorative heading CSS. Treat Pinyon Script as the active decorative web font unless a deliberate typography change is made.

3.3 Design language

The current UI style is based on:

warm cream/pink background

muted dusty-rose navigation and borders

dark chocolate-brown headings/buttons

teal accent lines/focus rings

rounded cards and controls (8px, 10px, 12px, 14px, 16px are common)

soft shadows rather than hard black outlines

large script headings paired with clean sans-serif body text

responsive mobile-first layouts

The date/time pickers, order popup and admin confirmation dialogs are intentionally styled using these same variables.

4. High-level project map

Lords-Dev2/
├── public/ Static public assets and SVG icons
├── src/
│ ├── assets/ Source images/fonts
│ ├── components/ Reusable Astro UI components
│ │ ├── Form/ Public enquiry + booking forms
│ │ ├── Menu/ Public menu/order/display components
│ │ └── MetaData/ SEO/favicon metadata components
│ ├── db/ Legacy/alternate Supabase client helper
│ ├── favicon-temp/ Temporary favicon source set
│ ├── layouts/ Global site shell
│ ├── lib/ Server/shared data helpers
│ ├── pages/ Astro routes + API/admin endpoints
│ │ ├── admin/ Protected admin pages/endpoints
│ │ ├── api/ Public/server API routes
│ │ └── staff/ Staff pages
│ ├── scripts/ Build/helper scripts
│ └── styles/ Global SCSS/CSS
├── vendor/ Local package archive(s)
├── BOOKING_FORMS_SUPABASE.sql Booking/enquiry DB migration
├── BOOKING_TIME_SUPABASE.sql Booking time migration
├── ORDER_AND_TAKEAWAY_SUPABASE.sql Ordering/takeaway migration
├── astro.config.mjs Astro/Vite/Vercel config
├── package.json Dependencies and scripts
├── tsconfig.json TypeScript/Astro config
├── structure.md Detailed repository inventory
├── AGENTS.md Repository-specific agent/development notes
└── WebHook.md Existing WhatsApp/webhook documentation

5. Global application shell

src/layouts/Layout.astro

This is the main site layout used by Home, Menu, Contact and most Admin pages.

It:

sets the HTML shell and viewport metadata;

adds favicons through MetaData/Favicons.astro;

loads Google fonts through Fonts.astro;

loads Alpine.js Collapse and Alpine.js from CDN;

imports:

icons.css

main.scss

contact.scss

menu.scss;

defines the global CSS custom properties/brand tokens;

renders:

TopBtn

Nav

the page <slot />

Footer

SiteDialog.

Layout interaction diagram

Every normal page
│
▼
src/layouts/Layout.astro
│
├── Fonts.astro
├── Nav.astro
├── TopBtn.astro
├── Footer.astro
├── SiteDialog.astro
├── icons.css
├── main.scss
├── contact.scss
└── menu.scss
│
└── <slot /> = page-specific content

6. Public pages

src/pages/index.astro — /

Home page.

Responsibilities

wraps content in Layout;

renders the hero area;

links to /menu;

renders the About section;

renders the Daily/Weekly Specials image from Supabase Storage;

provides an image lightbox/download experience.

Data interaction

The weekly-special image URL is generated server-side using:

src/lib/supabaseStorage.ts

rather than building the URL in the browser.

src/pages/menu.astro — /menu

Current main public menu route.

It renders:

Layout
├── Menu/index.astro
└── Menu/MenuDownloads.astro

prerender = false is used so current menu edits can appear without waiting for a rebuild.

src/pages/contact.astro — /contact

This page is the public entry point for the two customer communication flows:

Contact page
├── InquiryForm.astro
└── BookingForm.astro

Before rendering it obtains:

getWhatsAppNumber() -> site_settings
getBlockedDates() -> blocked_dates

and passes those values to the form components.

Contact interaction diagram

/contact
│
├── InquiryForm
│ │
│ └── POST /api/inquiry
│ ├── validate
│ ├── rate-limit
│ ├── save contact_inquiries
│ └── return wa.me URL
│
└── BookingForm
│
└── POST /api/booking
├── validate people/date/time/contact data
├── re-check blocked_dates
├── rate-limit
├── save booking_requests
└── return wa.me URL

7. Form components

src/components/Form/InquiryForm.astro

Public general enquiry form.

Required fields

Name

Contact phone number

Message

Behaviour

validates in the browser;

normalises the South African/WhatsApp phone number through src/lib/phone.ts;

POSTs to /api/inquiry;

API stores the enquiry in Supabase;

API returns a pre-filled WhatsApp URL;

browser navigates to WhatsApp so the customer can send the message.

If the API save fails, the form has a fallback wa.me message so the customer can still send the enquiry.

src/components/Form/BookingForm.astro

Public group booking request form.

Current required data

People count — minimum 10

Contact person's name

Contact phone number

Booking date

Booking time

Booking name is optional; when blank, the API uses the contact name as the booking label.

Current booking rules

minimum people: 10

Monday–Saturday: 10:30–19:30

Sunday: group bookings currently unavailable

blocked dates: rejected

past dates: rejected

booking time: 30-minute selection increments in the UI

Calendar behaviour

The picker is intentionally custom-styled rather than using the browser's native date control.

It includes:

month navigation

date cells

blocked-date indication

Today marker/indicator

date → time flow

time → close/submit flow

accessible modal handling

focus restoration / inert handling for closed picker state

The server performs the same critical checks again because frontend validation is only a UX layer.

8. Menu display + ordering architecture

src/components/Menu/index.astro

This is the core public menu/order component.

It:

loads live menu data from src/lib/menu.ts;

displays menu types/categories/items;

supports search and category navigation/filtering;

displays modifiers/options;

allows quantity and note selection;

manages the client-side cart using Alpine;

displays the order popup;

builds the collection date/time picker for takeaway orders;

sends the cart to /api/orders/whatsapp;

opens WhatsApp with the stored order reference/message.

Current order rules

customer phone number is not collected for menu orders;

opt-in is not collected for menu orders;

the WhatsApp order heading keeps _NEW ORDER_;

order name is required;

collection time is required for all takeaway orders;

collection date is only required for platter orders;

platter orders are subject to the configured advance notice (PLATTER_NOTICE_DAYS = 2);

clear-order button clears the current cart/order state;

takeaway-day availability is checked client-side and then server-side.

Collection schedule for regular takeaway orders

Current API enforcement is:

Monday–Saturday: 11:00 through 20:00

Sunday: 11:00 through 16:00

Platter orders additionally require a collection date, which is checked against the selected item's takeaway weekday schedule.

src/components/Menu/MenuMain.astro

Multi-page menu image slider for the menu-board/image-based presentation.

Uses:

src/lib/menuImages.ts
src/lib/supabaseStorage.ts

It provides:

slider navigation

pagination dots

lightbox

download links

The current /menu page's primary ordering UI is Menu/index.astro; this component remains part of the image/menu presentation system.

src/components/Menu/MenuSlider.astro

Weekly specials slider.

Data sources/fallback hierarchy:

explicitly supplied props;

Supabase Storage listing;

SPECIALS fallback from src/lib/menuImages.ts.

Includes lightbox/download behaviour.

src/components/Menu/MenuPlatter.astro

Platter menu image display with lightbox/download support.

Uses PLATTER / PLATTER_FOLDER from src/lib/menuImages.ts.

src/components/Menu/MenuDownloads.astro

Provides the menu download area:

full menu PDF

download-all-images ZIP

individual image browsing/downloads

It gets managed image lists from:

src/lib/menuImages.ts
src/lib/menuImageStore.ts

and uses the public Supabase Storage URLs generated by src/lib/supabaseStorage.ts.

src/lib/menu.ts

Shared menu data access layer.

Reads these Supabase tables

menu_types
menu_categories
menu_items
modifier_groups
modifier_options
category_modifier_groups

It assembles them into a nested structure:

MenuType
└── categories[]
└── items[]
└── modifier_groups[]
└── options[]

It now includes:

takeaway
takeaway_days

on each menu item.

This helper is used by both the public menu and the Admin Menu Editor, keeping the data model consistent.

src/lib/orders.ts

Small shared order helper library.

Current primary helper:

orderRef(orderNo) // => LL-1042

9. Takeaway scheduling system

Database field

public.menu_items.takeaway_days

is a recurring weekly schedule using JavaScript weekday numbering:

0 = Sunday
1 = Monday
2 = Tuesday
3 = Wednesday
4 = Thursday
5 = Friday
6 = Saturday

The database migration creates the column with all seven days enabled by default so existing menu items do not unexpectedly stop being takeaway items.

src/components/MenuEditor.astro

Admin UI for editing menu item data.

For every item it can edit:

name

price

description

serves

image URL

takeaway enabled/disabled

takeaway days

When takeaway is enabled, the editor shows weekday controls and an Every day shortcut.

It prevents saving a takeaway-enabled item with zero selected takeaway days.

src/pages/admin/menu-crud.ts

Server endpoint used by the Menu Editor.

It is protected by:

getAdminUser()

and contains an explicit table/column allow-list.

takeaway_days is explicitly allow-listed for menu_items, so the browser cannot arbitrarily update an unrelated database column/table through this endpoint.

Data flow

/admin/menu-editor
│
▼
MenuEditor.astro
│
├── getMenu() -> reads Supabase
│
└── Save Menu
│
▼
POST /admin/menu-crud
│
├── getAdminUser()
├── allow-list table/columns
└── supabaseAdmin update

10. Order API

src/pages/api/orders/whatsapp.ts

Server-side menu-order endpoint.

Important point: it does not send WhatsApp server-side

The endpoint:

validates the order;

checks item availability against current database values;

enforces takeaway-day rules where a collection date applies;

applies basic IP rate limiting;

inserts into whatsapp_orders with the service-role Supabase client;

returns an order reference.

The browser then constructs/opens the WhatsApp wa.me link.

This means closing WhatsApp after the order is saved does not lose the database record.

Why supabaseAdmin is used here

The public browser does not directly write to whatsapp_orders. The Astro API uses the service-role client on the server after validating the request.

11. Contact / booking APIs

src/pages/api/inquiry.ts

Server route for the General Enquiry form.

Flow

InquiryForm
│
▼
POST /api/inquiry
│
├── JSON validation
├── name validation
├── phone normalisation/validation
├── message validation
├── IP + phone rate limit
├── insert contact_inquiries
└── return wa.me URL

src/pages/api/booking.ts

Server route for group bookings.

Flow

BookingForm
│
▼
POST /api/booking
│
├── people >= 10
├── name required
├── phone required/normalised
├── date valid + not in past
├── Monday–Saturday only
├── time 10:30–19:30
├── blocked_dates re-check
├── IP + phone rate limit
├── insert booking_requests
└── return pre-filled WhatsApp URL

The booking API rechecks blocked_dates immediately before inserting so that a date blocked after the page loaded cannot still be accepted.

12. Booking date blocking / Admin workflow

src/pages/admin/booking-dates.astro

Admin + Owner page at:

/admin/booking-dates

Used to block/unblock booking dates.

It supports:

start date

end date

optional reason

existing blocked-date list

block

unblock

custom confirmation dialog

page status/success/error messaging

The confirmation UI is deliberately styled in the site's colours rather than using window.confirm().

src/pages/admin/blocked-dates.ts

Server endpoint for adding/removing blocked date ranges.

It is protected with the existing Admin role guard and uses the server-only Supabase client for database mutations.

Booking date data flow

Admin user
│
▼
/admin/booking-dates
│
└── POST /admin/blocked-dates
│
├── role/session validation
├── overlap/range validation
└── supabaseAdmin -> blocked_dates

Public /contact
│
└── getBlockedDates()
│
└── public read of blocked_dates
│
▼
BookingForm

Blocked date visibility

Blocked dates are passed to the public booking form and are clearly marked in the custom date picker. The server still treats the browser picker as a convenience only and checks the database again during submission.

13. Authentication / roles

src/lib/adminAuth.ts

Central authentication/authorisation helper for Admin pages and endpoints.

Current roles:

staff < admin < owner

Key functions

Function

Purpose

getUserRole()

Resolve user role from Supabase metadata

hasMinimumRole()

Compare current role against required role

isAdminUser()

True for Admin or Owner

isOwnerUser()

True for Owner only

getSessionUser()

Validate access token / refresh session

getAdminUser()

Return user only when Admin or Owner

guardAdminPage()

Protect an Admin page and return redirect/403

guardOwnerPage()

Protect Owner-only pages

getDisplayName()

Resolve name shown in admin UI

Role usage in current project

Admin or Owner:

menu editor

staff/admin tools

booking-date blocking

admin portal

Owner only:

user-role management

site settings such as the WhatsApp ordering number

14. Admin pages

src/pages/admin/index.astro

Admin Control Panel.

Provides links to admin functions, including booking date management.

Uses AuthSessionManager.astro for the active-session UI and timeout behaviour.

src/pages/admin/login.astro

Admin login UI.

The sign-in request is handled by:

src/pages/api/auth/signin.ts

Successful login stores the Supabase access/refresh tokens in HTTP-only cookies.

src/pages/admin/settings.astro

Owner-only site settings page.

Current configurable setting:

WhatsApp ordering number

It uses:

src/lib/siteInfo.ts
src/lib/siteSettings.ts
src/pages/admin/set-whatsapp-number.ts

Changing this setting changes the WhatsApp destination without a code deployment.

src/pages/admin/menu-editor.astro

Entry page for the database-driven menu editor.

Loads:

MenuEditorNav
MenuEditor

and is protected by guardAdminPage().

src/pages/admin/menu-editor/[section].astro

Dynamic image/PDF editor page.

Current sections include:

/admin/menu-editor/main-menu
/admin/menu-editor/specials
/admin/menu-editor/platter

Uses:

MenuImageEditor.astro
MenuPdfEditor.astro
src/lib/menuImages.ts

src/pages/admin/set-user-role.ts

Owner-only endpoint used to assign roles. New role assignments are written to Supabase Auth app_metadata so users cannot self-escalate through normal client-side metadata updates.

src/pages/admin/set-whatsapp-number.ts

Owner-only endpoint for updating the WhatsApp ordering number in site_settings.

src/pages/admin/menu-files.ts

Admin endpoint for managed Storage files/images/PDF assets.

Supports the image editor's list/replace/delete/rename flows according to the managed image rules in src/lib/menuImages.ts.

src/pages/admin/upload-image.ts

Admin-only image upload endpoint.

Responsibilities:

checks admin access;

validates uploaded image type/size;

decides destination folder;

optimises images where possible;

uploads to Supabase Storage using service role;

returns the public Storage URL and optimisation information.

The current optimisation strategy is defined in the file using different dimensions for:

managed menu/special/platter images

menu item thumbnails

category images

src/pages/admin/user.astro

Existing staff/admin user-facing admin page. Role/display/session behaviour is based on adminAuth.ts.

15. Site settings / shared business information

src/lib/siteInfo.ts

Shared restaurant information used by multiple pages.

Current values/functions include:

RESTAURANT_NAME
TAGLINE
LOCATIONS
LOCATION_URL
PLATTER_NOTICE_DAYS
PLATTER_NOTICE_TITLE
PLATTER_NOTICE_TEXT
getWhatsAppNumber()
getWhatsAppLink()

getWhatsAppNumber() reads the Owner-editable site_settings value and falls back to a hardcoded safety value if the setting is unavailable.

Why this file matters

Do not hardcode the WhatsApp destination separately in the menu, footer, contact forms, booking API or inquiry API. Use this shared helper so all customer-facing flows stay in sync.

src/lib/siteSettings.ts

Key/value setting access layer.

Reads

Uses the regular Supabase client because settings are public-readable.

Writes

Uses supabaseAdmin and should only be reached by Owner-gated routes.

Current major setting:

whatsapp_number

16. Supabase clients and server security

src/lib/supabase.ts

General Supabase client used by public/live data access helpers such as menu/site settings/blocked-date reads.

Current environment names used by this file:

PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY

Keep environment variable naming consistent with the existing project. Do not rename or expose secrets casually because several files currently expect specific variable names.

src/lib/supabaseAdmin.ts

Server-only service-role Supabase client.

Used when the server must:

insert protected customer submissions;

modify Admin-managed data;

write settings;

manage Storage.

Expected server-only key:

SUPABASE_SERVICE_ROLE_KEY

Never use the service-role key in browser/client code.

src/lib/Supabaseserver.ts

Another server-only Supabase service-role helper used by parts of the existing codebase.

It currently supports:

SUPABASE_URL
PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

Prefer the dedicated purpose-built helpers already used by the relevant route when extending the application instead of introducing a third client pattern.

src/db/supabase.js

Legacy/alternate Supabase client helper.

It references:

PUBLIC_SUPABASE_URL
SUPABASE_KEY

Treat this as an existing compatibility/legacy path. New code should normally follow the src/lib/ client conventions already used by the current application.

17. Storage / images

src/lib/supabaseStorage.ts

Central helper for Supabase Storage public URLs.

Current default bucket is:

lordsImg

and the public bucket can be changed with:

PUBLIC_SUPABASE_BUCKET

It also supports Supabase's download query parameter so customer/admin download links work correctly across domains.

src/lib/menuImages.ts

Single source of truth for the fixed image sets used by the menu image editors/components.

Current logical groups:

Main menu -> Menu
Weekly specials -> MenuSpecials
Platter -> MenuSpecials

It also defines editor section metadata and the full-menu PDF configuration.

If a managed image is added/removed/renamed at code level, update the arrays in this file so the public component and admin editor remain aligned.

src/lib/menuImageStore.ts

Storage listing/access helpers for menu image/PDF management.

Used by admin image tooling and MenuDownloads.astro.

src/lib/menuImages.ts + upload-image.ts relationship

menuImages.ts
│
├── tells editors which fixed images are managed
├── tells public sliders which defaults to display
└── validates managed image references

upload-image.ts
│
├── validates admin request
├── optimises image
└── writes to Supabase Storage

18. Image optimisation

src/lib/optimizeImage.ts

Shared image-processing helper used by the Admin uploader.

upload-image.ts selects optimisation settings based on the type of image being uploaded/replaced.

This keeps large source photos from being used as oversized public assets.

19. Phone number handling

src/lib/phone.ts

Shared phone/WhatsApp number normalisation and formatting helper.

It is used by:

General Enquiry form/API

Group Booking form/API

WhatsApp message formatting

Menu ordering no longer asks the customer for a phone number, so the menu order flow does not use a customer phone input.

20. Metadata components

Under:

src/components/MetaData/

Aeo.astro

AI/answer-engine oriented metadata component.

Seo.astro

SEO metadata helper.

Geo.astro

Geographic/location metadata.

Llmo.astro

Large-language/AI metadata helper.

Favicons.astro

Loads favicon, Apple touch icon and web manifest references.

These are primarily composed by the site's page/layout/head setup.

21. Navigation / footer / shared UI

src/components/Nav.astro

Global navigation/header.

Used by Layout.astro and therefore appears on the public site and pages that use the main layout.

The current header uses the brand tokens from Layout.astro and responds to the mobile breakpoint/compact header sizing.

src/components/Footer.astro

Global footer.

Consumes shared data from src/lib/siteInfo.ts including:

restaurant name

tagline

locations

WhatsApp link

This is why the WhatsApp setting can be changed once from Admin Settings and then propagate to footer links and ordering flows.

src/components/CategoryNav.astro

Menu category navigation/helper UI.

Used as part of menu browsing/navigation behaviour where applicable.

src/components/topBtn.astro

Floating/back-to-top style button rendered by Layout.astro.

src/components/SiteDialog.astro

Global replacement for browser alert(), confirm() and prompt() plus toast notifications.

This is important for maintaining the visual language of the Admin UI. It uses the native <dialog> element with custom CSS and exposes a small global API:

siteDialog.confirm(...)
siteDialog.alert(...)
siteDialog.prompt(...)
siteDialog.toast(...)

It is included once from Layout.astro.

Current design/security/accessibility benefit

Using <dialog> avoids the unstyleable browser localhost:4321 says ... confirmation shown by window.confirm() and provides better focus/backdrop behaviour.

src/components/AuthSessionManager.astro

Shared signed-in session UI for Admin/Staff pages.

Current admin pages pass display name, email, login path and a timeout value into it.

22. Authentication API routes

Under:

src/pages/api/auth/

signin.ts

Signs into Supabase with email/password and stores access/refresh tokens in HTTP-only cookies.

signout.ts

Signs the session out/clears login cookies according to the existing auth flow.

display-name.ts

Updates/display-manages the authenticated user's display name according to the existing profile flow.

23. Other API routes

src/pages/api/menu/index.ts

Menu API endpoint used by parts of the existing application where menu data is consumed through an API request.

The main Menu/index.astro component currently reads live data through src/lib/menu.ts.

src/pages/api/nav.ts

Navigation-related API route.

src/pages/api/logout.ts

Existing logout helper route used by the current auth/staff flow.

src/pages/api/update-sales.ts

Existing staff-sales update endpoint.

24. Staff system

Under:

src/pages/staff/

index.astro

Staff landing/dashboard.

[name].astro

Per-staff route.

login.astro

Staff login page.

Staff sales/cash-up supporting code lives under:

src/lib/staffSales/

including:

cashUp.ts
storage.ts
sales_by_month.json
sales_by_staff.json
sales_raw.json

The staff system is separate from the public customer ordering flow, although it shares the same project layout/auth infrastructure.

25. Menu editor media system

src/components/MenuEditorNav.astro

Navigation between the admin menu editing areas.

src/components/MenuImageEditor.astro

Admin UI for replacing/adding/renaming/deleting managed/additional menu images.

src/components/MenuPdfEditor.astro

Admin UI for replacing/removing the full menu PDF.

src/pages/admin/menu-files.ts

Server endpoint backing the media editor operations.

src/pages/admin/upload-image.ts

Uploads/optimises image files and writes them to Supabase Storage.

26. Error pages

src/pages/404.astro

Custom not-found page.

src/pages/500.astro

Custom server error page.

src/components/ErrorPage.astro

Reusable error-page presentation component.

27. Static assets

public/icons/

Reusable SVG icon set for UI elements such as:

alert
back
cart
clock
contact
download
email
home
map-pin
menu
open
receipt
save
search
seat
staff
trash
user
whatsapp

src/styles/icons.css provides the CSS/icon-slot behaviour used by components with data-icon / icon helper classes.

public/assets/

General public static assets.

src/assets/

Build/import source images and font assets, including:

headerImg.webp
LordsLogo.*
L&LmobileLogo.svg
Fern*.svg/png
menuImg/*
assets/Fonts/*

The distinction to remember is:

src/assets/ — build-time/source assets imported by the app

public/ — files served directly at their public URL

Supabase Storage — runtime-managed customer/admin menu images/PDFs

28. Global styling files

src/styles/main.scss

Primary home/global page styling.

Contains styling for:

Home hero

About section

specials/download presentation

common page structures and responsive rules

Uses the global colour variables from Layout.astro.

src/styles/contact.scss

Contact-page structural styling:

.contact

.contact-page

.contact-hero

.contact-forms

responsive form-column behaviour

The individual form components contain their own detailed form-control styles, while contact.scss controls the broader page layout.

src/styles/menu.scss

Menu page/order UI styling.

Contains styling for:

menu browser

search/filter controls

category cards

item rows

badges/notices

order modal

cart

collection date/time controls

time option grid

responsive order UI

The current date/time picker is intentionally styled with the same variables used by the booking form so the two customer-facing pickers feel like one component family.

src/styles/icons.css

Icon slot/utility rules for the SVG icon system.

src/styles/password-toggle.css

Styling for the password visibility control used by the login/password flows.

29. Database model

The supplied Supabase schema currently includes these major application tables:

cash_up_rows
menu_types
menu_categories
menu_items
site_settings
whatsapp_orders
whatsapp_messages
modifier_groups
modifier_options
category_modifier_groups
blocked_dates
contact_inquiries
booking_requests

Core relationships

menu_types
│
└── menu_categories
│
└── menu_items

menu_categories
│
└── category_modifier_groups
│
└── modifier_groups
│
└── modifier_options

site_settings
└── whatsapp_number

blocked_dates
└── used by BookingForm + booking API

contact_inquiries
└── written by /api/inquiry

booking_requests
└── written by /api/booking

whatsapp_orders
└── written by /api/orders/whatsapp

30. Supabase migrations included with the current project

BOOKING_FORMS_SUPABASE.sql

Creates:

contact_inquiries
booking_requests

and enables RLS on both submission tables so public users do not directly read/write the records through the Supabase Data API.

The Astro API routes use the server-only service-role client for inserts after performing application-level validation.

It also adds a validity constraint/index for blocked_dates.

BOOKING_TIME_SUPABASE.sql

Adds/updates:

booking_requests.booking_time

Historical rows remain compatible because the DB field is nullable, while the website/API requires a time for new requests.

ORDER_AND_TAKEAWAY_SUPABASE.sql

Current ordering/takeaway migration.

It:

makes legacy whatsapp_orders.customer_phone nullable;

keeps historical phone/opt-in columns so old data is not destroyed;

adds menu_items.takeaway_days;

adds a validation constraint for weekday values 0–6;

adds an index for takeaway schedule querying where appropriate.

31. Supabase RLS model

The supplied project database policies currently indicate:

site_settings

public read is allowed;

Admin/Owner writes are allowed by policy;

application code additionally treats settings writes as Owner-only through the Admin route.

blocked_dates

public SELECT is allowed so the booking calendar can show unavailable dates;

Admin/Owner full access is allowed.

whatsapp_orders

No public RLS policies were supplied. The current application writes through supabaseAdmin from the server route.

whatsapp_messages

No public RLS policies were supplied. The current public order flow does not depend on directly querying this table.

General rule

Prefer this security model:

Browser
│
├── public read -> normal Supabase client (only for intentionally public data)
│
└── protected write
│
▼
Astro API
│
├── validate/authenticate/authorise
└── supabaseAdmin
│
▼
Supabase

Never ship SUPABASE_SERVICE_ROLE_KEY to the browser.

32. Environment variables

The current code references the following names. Exact secret values belong in local/deployment environment configuration and should never be committed to Git.

PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_BUCKET # optional; defaults to lordsImg
SUPABASE_SERVICE_ROLE_KEY # server-only
SUPABASE_URL # server fallback used by some helpers
SUPABASE_SECRET_KEY # used by src/lib/supabase.ts in current code
SUPABASE_KEY # legacy src/db/supabase.js path

Security

Anything beginning with PUBLIC_ is intended for code that may reach the browser. The service-role key must not use the PUBLIC_ prefix.

33. npm / development commands

From package.json:

npm run dev
npm run build
npm run preview
npm run astro

The existing sass script points at an older SCSS source path (src/styles/scss/index.scss). The active project currently imports page/global SCSS directly through Layout.astro, so check the current project structure before relying on the sass watch command.

Recommended normal development flow:

npm install
npm run dev

Then open:

http://localhost:4321/
http://localhost:4321/menu
http://localhost:4321/contact
http://localhost:4321/admin

34. File interaction cheat sheet

Customer menu order

/menu
↓
Menu/index.astro
↓
lib/menu.ts
↓
Supabase menu tables
↓
Customer selects items
↓
Cart/order popup
↓
POST /api/orders/whatsapp
↓
Supabase whatsapp_orders
↓
Return order reference
↓
Open wa.me with pre-filled _NEW ORDER_ message

Customer enquiry

/contact
↓
InquiryForm.astro
↓
POST /api/inquiry
↓
contact_inquiries
↓
wa.me URL

Group booking

/contact
↓
BookingForm.astro
↓
blocked_dates supplied by contact.astro
↓
POST /api/booking
↓
server re-checks blocked_dates
↓
booking_requests
↓
wa.me booking request

Admin menu edit

/admin/menu-editor
↓
MenuEditor.astro
↓
getMenu()
↓
Supabase menu tables
↓
Edit takeaway / takeaway days
↓
POST /admin/menu-crud
↓
adminAuth role check
↓
column allow-list
↓
supabaseAdmin

Admin booking-date management

/admin/booking-dates
↓
adminAuth / Admin+Owner check
↓
POST /admin/blocked-dates
↓
Supabase blocked_dates
↓
Public BookingForm reads blocked dates

Owner WhatsApp-number management

/admin/settings
↓
Owner-only guard
↓
POST /admin/set-whatsapp-number
↓
site_settings
↓
getWhatsAppNumber()
├── Footer
├── Menu ordering
├── Inquiry API
└── Booking API

35. Where to make common changes

Requirement

Primary file(s)

Change brand colours

src/layouts/Layout.astro

Change active fonts

src/components/Fonts.astro + heading CSS

Change Home hero/layout

src/pages/index.astro + src/styles/main.scss

Change Contact layout

src/pages/contact.astro + src/styles/contact.scss

Change enquiry fields/UX

src/components/Form/InquiryForm.astro

Change enquiry validation/storage/WhatsApp

src/pages/api/inquiry.ts

Change booking fields/UX

src/components/Form/BookingForm.astro

Change booking rules

src/components/Form/BookingForm.astro + src/pages/api/booking.ts

Change blocked-date admin UI

src/pages/admin/booking-dates.astro

Change blocked-date database operations

src/pages/admin/blocked-dates.ts

Change public menu UI/order popup

src/components/Menu/index.astro

Change menu/order styling

src/styles/menu.scss

Change order API/storage rules

src/pages/api/orders/whatsapp.ts

Change menu DB model/query

src/lib/menu.ts

Change per-item takeaway schedule

src/components/MenuEditor.astro + src/pages/admin/menu-crud.ts

Change default image lists

src/lib/menuImages.ts

Change Storage URL logic

src/lib/supabaseStorage.ts

Change admin roles

src/lib/adminAuth.ts + role endpoint

Change WhatsApp destination

/admin/settings → site_settings → src/lib/siteSettings.ts

Replace/add menu images

src/components/MenuImageEditor.astro + src/pages/admin/upload-image.ts

Replace full menu PDF

src/components/MenuPdfEditor.astro / src/pages/admin/menu-files.ts

Change global confirmation/toasts

src/components/SiteDialog.astro

Change footer business info

src/lib/siteInfo.ts + src/components/Footer.astro

36. Developer conventions

Prefer existing helpers over duplicating infrastructure. Use siteInfo.ts, siteSettings.ts, menu.ts, blockedDates.ts, adminAuth.ts, supabaseStorage.ts and phone.ts rather than creating another helper for the same concern.

Keep customer-facing validation and server validation together. The browser improves UX; the API protects data and business rules.

Do not put secrets in .astro components or client scripts. Service-role Supabase access belongs on the server.

Use the global CSS variables for new UI. Do not introduce a second colour system for a single component.

Keep interactive UI accessible. The project already uses labels, status regions, aria-* attributes, focus handling and native <dialog> where appropriate.

Use the existing SiteDialog system instead of window.alert() / window.confirm() / window.prompt() for new admin interactions that need site styling.

Use SCSS/CSS, not Tailwind utility classes, for new styling unless the project is intentionally migrated.

Preserve historical data where possible. The menu-order migration deliberately keeps old phone/opt-in columns rather than deleting existing order history.

When changing Supabase schema, update the migration SQL and the corresponding TypeScript types/data helpers.

When adding a new Admin capability, protect both the page and the server endpoint. Hiding a button is not authorisation.

37. Current important business rules

Menu takeaway

menu_items.takeaway = false means the item is unavailable for takeaway.

menu_items.takeaway_days controls recurring weekdays.

Admin/Owner can edit these values through the Menu Editor.

The server re-checks item takeaway availability before saving an order.

Menu order collection

Every takeaway order needs a collection time.

Only platter orders require a collection date.

Regular takeaway time window:

Monday–Saturday: 11:00–20:00

Sunday: 11:00–16:00

Platter orders

Must follow the configured platter notice period (PLATTER_NOTICE_DAYS, currently 2 days).

Collection date is required.

The selected date must satisfy the selected item's takeaway-day availability.

Group bookings

Minimum 10 people.

Booking date required.

Booking time required.

Monday–Saturday only in the current implementation.

10:30–19:30.

Blocked dates cannot be booked.

Admin date blocking

Admin and Owner can block/unblock dates.

Public users can read blocked dates so the booking calendar can mark them.

The booking API rechecks the database before saving.

38. Existing/legacy areas to treat carefully

The repository contains some older code paths and commented-out/legacy components. Examples include:

src/db/supabase.js versus the newer src/lib/* Supabase helpers;

older MenuMain, MenuSlider, MenuPlatter presentation components alongside the newer data-driven Menu/index.astro ordering system;

Tailwind packages/plugin still present even though current styles are SCSS/CSS;

an older sass watch path in package.json that does not match the current src/styles/ layout.

Do not remove these simply because they are not central to the current customer flow without checking their remaining references first.

39. Detailed source path reference

Components

src/components/
├── AuthSessionManager.astro
├── CategoryNav.astro
├── ErrorPage.astro
├── ExcelUploader.astro
├── Fonts.astro
├── Footer.astro
├── MenuEditor.astro
├── MenuEditorNav.astro
├── MenuImageEditor.astro
├── MenuPdfEditor.astro
├── Nav.astro
├── SiteDialog.astro
├── topBtn.astro
│
├── Form/
│ ├── BookingForm.astro
│ └── InquiryForm.astro
│
├── Menu/
│ ├── index.astro
│ ├── MenuDownloads.astro
│ ├── MenuMain.astro
│ ├── MenuPlatter.astro
│ └── MenuSlider.astro
│
└── MetaData/
├── Aeo.astro
├── Favicons.astro
├── Geo.astro
├── Llmo.astro
└── Seo.astro

Shared libraries

src/lib/
├── adminAuth.ts
├── blockedDates.ts
├── menu.ts
├── menuImageStore.ts
├── menuImages.ts
├── optimizeImage.ts
├── orders.ts
├── phone.ts
├── siteInfo.ts
├── siteSettings.ts
├── supabase.ts
├── supabaseAdmin.ts
├── Supabaseserver.ts
├── supabaseStorage.ts
└── staffSales/
├── cashUp.ts
├── sales_by_month.json
├── sales_by_staff.json
├── sales_raw.json
└── storage.ts

Public/API pages

src/pages/
├── index.astro
├── menu.astro
├── contact.astro
├── 404.astro
├── 500.astro
│
├── api/
│ ├── auth/
│ │ ├── display-name.ts
│ │ ├── signin.ts
│ │ └── signout.ts
│ ├── menu/index.ts
│ ├── orders/whatsapp.ts
│ ├── booking.ts
│ ├── inquiry.ts
│ ├── logout.ts
│ ├── nav.ts
│ └── update-sales.ts
│
├── admin/
│ ├── index.astro
│ ├── login.astro
│ ├── settings.astro
│ ├── user.astro
│ ├── booking-dates.astro
│ ├── blocked-dates.ts
│ ├── menu-editor.astro
│ ├── menu-crud.ts
│ ├── menu-files.ts
│ ├── set-user-role.ts
│ ├── set-whatsapp-number.ts
│ ├── upload-image.ts
│ └── menu-editor/[section].astro
│
└── staff/
├── index.astro
├── login.astro
└── [name].astro

Styles

src/styles/
├── main.scss
├── contact.scss
├── menu.scss
├── icons.css
└── password-toggle.css

40. Database change checklist

When changing a DB-backed feature, update all of these layers as applicable:

1. Supabase schema / migration SQL
2. RLS policy (if data exposure changes)
3. src/lib helper / TypeScript model
4. public component
5. API route / server validation
6. Admin editor (if owner/admin editable)
7. README/business-rule documentation

A useful example is takeaway_days, which crosses the full stack:

SQL column
↓
menu.ts type/query
↓
MenuEditor.astro
↓
admin/menu-crud.ts allow-list
↓
Menu/index.astro
↓
api/orders/whatsapp.ts server re-check

41. Final maintenance note

For most future changes, start at the feature's page/component, then trace to the corresponding shared library, then the API route, and finally the Supabase table/storage object.

The most important architectural boundaries in this project are:

UI / presentation
↓
Shared helper / data model
↓
Astro API / authenticated server route
↓
Supabase database or Storage
↓
External customer action (WhatsApp)

Keeping those boundaries intact makes the project easier to maintain and prevents browser code from becoming responsible for security-sensitive database operations.

Repository references

The repository metadata currently points to:

https://github.com/Keagenbr/Lords

The local structure.md remains the authoritative exhaustive file inventory for the supplied project snapshot. This README is the higher-level architectural/maintenance guide.
