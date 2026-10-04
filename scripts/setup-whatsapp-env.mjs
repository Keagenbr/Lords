#!/usr/bin/env node
// scripts/setup-whatsapp-env.mjs
//
// Interactive helper for the WhatsApp Cloud API TEST environment.
//   npm run setup:whatsapp            -> asks for each value, checks it with Meta, writes .env
//   npm run setup:whatsapp -- --check -> only checks the values already in .env
//   npm run setup:whatsapp -- --vercel -> also pushes the values to Vercel (Production + Preview)
//
// Runs on YOUR machine – secrets are typed here, never pasted into chat or git.
// No dependencies (Node 22+).
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";

const ENV_FILE = ".env";
const args = new Set(argv.slice(2));
const CHECK_ONLY = args.has("--check");
const PUSH_VERCEL = args.has("--vercel");

const c = {
  ok: (s) => `\x1b[32m✔\x1b[0m ${s}`,
  warn: (s) => `\x1b[33m!\x1b[0m ${s}`,
  err: (s) => `\x1b[31m✘\x1b[0m ${s}`,
  h: (s) => `\n\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ── .env read / write (keeps every other key + comments) ─────────
function readEnv() {
  if (!existsSync(ENV_FILE)) return { lines: [], values: {} };
  const lines = readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return { lines, values };
}

function writeEnv(updates) {
  const { lines } = readEnv();
  const done = new Set();
  const out = lines.map((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (m && m[1] in updates) {
      done.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  const missing = Object.keys(updates).filter((k) => !done.has(k));
  if (missing.length) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push("# ── WhatsApp Cloud API (written by scripts/setup-whatsapp-env.mjs) ──");
    missing.forEach((k) => out.push(`${k}=${updates[k]}`));
  }
  if (existsSync(ENV_FILE)) copyFileSync(ENV_FILE, `${ENV_FILE}.bak`);
  writeFileSync(ENV_FILE, out.join("\n").replace(/\n*$/, "\n"));
}

// ── Same rules as src/lib/phone.ts ───────────────────────────────
function normalisePhone(input) {
  const raw = String(input ?? "").trim();
  if (!raw || !/^\+?[\d\s\-().]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!international) {
    if (digits.startsWith("0")) digits = "27" + digits.slice(1);
    else if (!digits.startsWith("27")) return null;
  }
  if (digits.startsWith("27")) return /^27[678]\d{8}$/.test(digits) ? digits : null;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

// ── Prompts ──────────────────────────────────────────────────────
// A fresh readline per visible question; raw-mode reading for secrets so
// tokens are never echoed to the screen.
async function readVisible(prompt) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  const answer = await rl.question(prompt);
  rl.close();
  return answer;
}

function readHidden(prompt) {
  if (!stdin.isTTY) return readVisible(prompt);
  return new Promise((resolve) => {
    stdout.write(prompt);
    let buf = "";
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (chunk) => {
      // Strip bracketed-paste / escape sequences some terminals add.
      const text = chunk.toString("utf8").replace(/\x1b\[[0-9;~]*[A-Za-z~]?/g, "");
      for (const ch of text) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(buf);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          exit(130); // Ctrl+C
        }
        if (ch === "\u007f" || ch === "\b") {
          if (buf) {
            buf = buf.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (ch >= " ") {
          buf += ch;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function ask(label, { current, def, secret = false, validate } = {}) {
  const shown = current
    ? secret
      ? `${current.slice(0, 6)}…${current.slice(-4)}`
      : current
    : def;
  const hint = shown ? c.dim(` [${shown}]`) : "";
  for (;;) {
    const prompt = `${label}${hint}: `;
    const answer = (secret ? await readHidden(prompt) : await readVisible(prompt)).trim();
    const value = answer || current || def || "";
    const problem = validate ? validate(value) : value ? null : "Required";
    if (!problem) return value;
    console.log(c.err(problem));
  }
}

// ── Meta Graph API checks ────────────────────────────────────────
async function graph(base, version, path, token) {
  const res = await fetch(`${base}/${version}/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function verify(v) {
  const base = (v.WHATSAPP_API_BASE || "https://graph.facebook.com").replace(/\/$/, "");
  const ver = v.WHATSAPP_GRAPH_VERSION;
  let problems = 0;
  console.log(c.h("Checking with Meta…"));

  // 1. Token + phone number ID
  const phone = await graph(
    base,
    ver,
    `${v.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`,
    v.WHATSAPP_ACCESS_TOKEN,
  );
  if (phone.ok) {
    console.log(
      c.ok(`Phone number ID works: ${phone.data.display_phone_number} ("${phone.data.verified_name}")`),
    );
    if (v.WHATSAPP_MODE === "test" && !/test/i.test(phone.data.verified_name ?? "")) {
      console.log(c.warn("This doesn't look like Meta's test number – check WHATSAPP_MODE."));
    }
  } else {
    problems++;
    const e = phone.data?.error;
    console.log(c.err(`Phone number check failed: ${e?.message ?? "unknown error"} (code ${e?.code ?? "?"})`));
    if (e?.code === 190) console.log(c.dim("  → token is invalid or expired; generate a System User token."));
    if (e?.code === 100) console.log(c.dim("  → wrong Phone number ID (use the ID, not the phone number)."));
  }

  // 2. Token type / expiry (needs App ID + secret, optional)
  if (v._APP_ID && v.WHATSAPP_APP_SECRET) {
    const dbg = await graph(
      base,
      ver,
      `debug_token?input_token=${encodeURIComponent(v.WHATSAPP_ACCESS_TOKEN)}&access_token=${encodeURIComponent(`${v._APP_ID}|${v.WHATSAPP_APP_SECRET}`)}`,
    );
    if (dbg.ok && dbg.data?.data) {
      const d = dbg.data.data;
      const scopes = d.scopes ?? [];
      const exp = d.expires_at ? new Date(d.expires_at * 1000) : null;
      console.log(c.ok("App ID + App secret are valid."));
      if (!d.is_valid) {
        problems++;
        console.log(c.err("Access token is NOT valid."));
      } else if (exp && exp.getTime() > 0) {
        console.log(c.warn(`Access token expires ${exp.toLocaleString()} – fine for a quick test, use a System User token (never expires) after that.`));
      } else {
        console.log(c.ok("Access token never expires (System User token)."));
      }
      for (const s of ["whatsapp_business_messaging", "whatsapp_business_management"]) {
        if (!scopes.includes(s)) {
          problems++;
          console.log(c.err(`Token is missing permission: ${s}`));
        }
      }
    } else {
      problems++;
      console.log(c.err(`App secret check failed: ${dbg.data?.error?.message ?? "unknown"} – check App ID and App secret.`));
    }
  } else {
    console.log(c.dim("  (Skipped app-secret/token-expiry check – no App ID given.)"));
  }

  // 3. Templates
  const tpl = await graph(
    base,
    ver,
    `${v.WHATSAPP_WABA_ID}/message_templates?fields=name,status,language&limit=200`,
    v.WHATSAPP_ACCESS_TOKEN,
  );
  if (!tpl.ok) {
    problems++;
    console.log(c.err(`Couldn't list templates: ${tpl.data?.error?.message ?? "unknown"} – check WHATSAPP_WABA_ID.`));
  } else {
    const list = tpl.data?.data ?? [];
    for (const name of [
      v.WHATSAPP_TEMPLATE_STAFF_ALERT,
      v.WHATSAPP_TEMPLATE_ORDER_RECEIVED,
      v.WHATSAPP_TEMPLATE_ORDER_READY,
    ]) {
      const found = list.filter((t) => t.name === name);
      const match = found.find((t) => t.language === v.WHATSAPP_TEMPLATE_LANG);
      if (match?.status === "APPROVED") console.log(c.ok(`Template ${name} (${match.language}) approved`));
      else if (match) console.log(c.warn(`Template ${name} (${match.language}) is ${match.status} – wait for APPROVED`));
      else if (found.length) {
        problems++;
        console.log(
          c.err(`Template ${name} exists in [${found.map((t) => t.language).join(", ")}] but not "${v.WHATSAPP_TEMPLATE_LANG}" – set WHATSAPP_TEMPLATE_LANG to match`),
        );
      } else console.log(c.warn(`Template ${name} not created yet (see docs/WHATSAPP_TEST_SETUP.md step 3)`));
    }
  }
  return { problems, base };
}

async function sendHelloWorld(v, base, to) {
  const res = await fetch(`${base}/${v.WHATSAPP_GRAPH_VERSION}/${v.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${v.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) console.log(c.ok(`hello_world sent to +${to} – check your WhatsApp.`));
  else {
    console.log(c.err(`Send failed: ${data?.error?.message} (code ${data?.error?.code})`));
    if (data?.error?.code === 131030)
      console.log(c.dim("  → add this number under WhatsApp → API Setup → To → Manage phone number list."));
  }
}

function pushToVercel(v) {
  console.log(c.h("Pushing to Vercel (Production + Preview)…"));
  const sensitive = new Set(["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]);
  for (const [key, value] of Object.entries(v)) {
    if (key.startsWith("_") || key === "WHATSAPP_API_BASE" || !key.startsWith("WHATSAPP_")) continue;
    for (const target of ["production", "preview"]) {
      const flags = ["vercel", "env", "add", key, target, "--force", "--yes"];
      if (sensitive.has(key)) flags.push("--sensitive");
      const r = spawnSync("npx", flags, { input: value, encoding: "utf8", shell: process.platform === "win32" });
      if (r.status === 0) console.log(c.ok(`${key} → ${target}`));
      else {
        console.log(c.err(`${key} → ${target} failed`));
        console.log(c.dim((r.stderr || r.stdout || "").trim().split("\n").slice(-2).join("\n")));
      }
    }
  }
  console.log(c.warn("Redeploy on Vercel now – values are read at build time."));
}

// ── Main ─────────────────────────────────────────────────────────
const { values: cur } = readEnv();
const v = { ...cur };

console.log(c.h("Lords & Legends – WhatsApp Cloud API TEST setup"));
console.log(c.dim("Values come from developers.facebook.com → your app → WhatsApp → API Setup.\nPress Enter to keep the value in [brackets]."));

if (!CHECK_ONLY) {
  v.WHATSAPP_MODE = "test";
  v.WHATSAPP_GRAPH_VERSION = await ask("Graph API version", {
    current: cur.WHATSAPP_GRAPH_VERSION,
    def: "v23.0",
    validate: (x) => (/^v\d+\.\d$/.test(x) ? null : "Format: v23.0"),
  });
  v.WHATSAPP_PHONE_NUMBER_ID = await ask("Phone number ID (not the phone number)", {
    current: cur.WHATSAPP_PHONE_NUMBER_ID,
    validate: (x) => (/^\d{10,20}$/.test(x) ? null : "Should be a 15-16 digit ID"),
  });
  v.WHATSAPP_WABA_ID = await ask("WhatsApp Business Account ID", {
    current: cur.WHATSAPP_WABA_ID,
    validate: (x) => (/^\d{10,20}$/.test(x) ? null : "Should be a 15-16 digit ID"),
  });
  v.WHATSAPP_ACCESS_TOKEN = await ask("Access token (hidden)", {
    current: cur.WHATSAPP_ACCESS_TOKEN,
    secret: true,
    validate: (x) => (/^EA[A-Za-z0-9]{50,}$/.test(x) ? null : "Tokens start with EA… – copy the whole thing"),
  });
  v._APP_ID = await ask("App ID (optional, to check the secret)", {
    validate: (x) => (!x || /^\d{10,20}$/.test(x) ? null : "Digits only"),
  });
  v.WHATSAPP_APP_SECRET = await ask("App secret (hidden)", {
    current: cur.WHATSAPP_APP_SECRET,
    secret: true,
    validate: (x) => (/^[a-f0-9]{32}$/i.test(x) ? null : "App secret is 32 hex characters"),
  });
  v.WHATSAPP_VERIFY_TOKEN = await ask("Webhook verify token (Enter = generate)", {
    current: cur.WHATSAPP_VERIFY_TOKEN,
    def: randomBytes(24).toString("hex"),
    validate: (x) => (x.length >= 16 ? null : "Use at least 16 characters"),
  });
  v.WHATSAPP_TEMPLATE_LANG = await ask("Template language (en or en_US)", {
    current: cur.WHATSAPP_TEMPLATE_LANG,
    def: "en",
  });
  v.WHATSAPP_TEMPLATE_STAFF_ALERT = cur.WHATSAPP_TEMPLATE_STAFF_ALERT || "new_order_alert";
  v.WHATSAPP_TEMPLATE_ORDER_RECEIVED = cur.WHATSAPP_TEMPLATE_ORDER_RECEIVED || "order_received";
  v.WHATSAPP_TEMPLATE_ORDER_READY = cur.WHATSAPP_TEMPLATE_ORDER_READY || "order_ready";

  const myPhone = await ask("Your WhatsApp number (e.g. 082 555 0142)", {
    current: cur.WHATSAPP_ORDER_RECIPIENTS?.split(",")[0],
    validate: (x) => (normalisePhone(x) ? null : "Not a valid WhatsApp mobile number"),
  });
  const me = normalisePhone(myPhone);
  const extra = await ask("Other verified test numbers (optional)", {
    validate: (x) =>
      !x || x.split(",").every((n) => normalisePhone(n)) ? null : "One of those numbers isn't valid",
  });
  const others = extra ? extra.split(",").map(normalisePhone) : [];

  v.WHATSAPP_ORDER_RECIPIENTS = me;
  v.WHATSAPP_TEST_ALLOWED_RECIPIENTS = [...new Set([me, ...others])].slice(0, 5).join(",");
} else {
  const required = [
    "WHATSAPP_GRAPH_VERSION", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID",
    "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_ORDER_RECIPIENTS",
  ];
  const missing = required.filter((k) => !v[k]);
  if (missing.length) {
    console.log(c.err(`Missing in .env: ${missing.join(", ")} – run without --check.`));
    exit(1);
  }
  v.WHATSAPP_TEMPLATE_LANG ||= "en";
  v.WHATSAPP_TEMPLATE_STAFF_ALERT ||= "new_order_alert";
  v.WHATSAPP_TEMPLATE_ORDER_RECEIVED ||= "order_received";
  v.WHATSAPP_TEMPLATE_ORDER_READY ||= "order_ready";
  v.WHATSAPP_MODE ||= "test";
}

const { problems, base } = await verify(v);

if (!CHECK_ONLY) {
  const toSave = Object.fromEntries(
    Object.entries(v).filter(([k]) => k.startsWith("WHATSAPP_") && k !== "WHATSAPP_API_BASE"),
  );
  writeEnv(toSave);
  console.log(c.h(`Saved ${Object.keys(toSave).length} WhatsApp values to ${ENV_FILE}`) + c.dim(existsSync(`${ENV_FILE}.bak`) ? ` (backup: ${ENV_FILE}.bak)` : ""));
}

const first = (v.WHATSAPP_ORDER_RECIPIENTS || "").split(",")[0];
if (first && (await ask(`Send Meta's hello_world test message to +${first}? (y/n)`, { def: "y" })).toLowerCase().startsWith("y")) {
  await sendHelloWorld(v, base, first);
}

if (PUSH_VERCEL) pushToVercel(v);

console.log(c.h("Next steps"));
console.log(`  1. Webhook (App dashboard → WhatsApp → Configuration):
       Callback URL: https://<your-domain>/api/whatsapp/webhook
       Verify token: ${v.WHATSAPP_VERIFY_TOKEN}
       then Subscribe to the "messages" field.
  2. ${PUSH_VERCEL ? "Redeploy on Vercel." : "Add the same values in Vercel (or re-run with --vercel), then redeploy."}
  3. npm run dev → open /menu and place a test order with your number.`);
console.log("");
console.log(problems ? c.warn(`${problems} problem(s) above – fix them, then run: npm run setup:whatsapp -- --check`) : c.ok("All checks passed."));
