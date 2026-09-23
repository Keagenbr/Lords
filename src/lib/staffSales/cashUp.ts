// Reads one daily CASH UP sheet and builds the per-staff figures shown on the staff pages.
// Pure logic (no file or network access) so it is easy to test.

export class UploadError extends Error {}

export interface RawRow {
  staff_name: string;
  date: string; // YYYY-MM-DD
  year: string;
  month: string; // "08"
  month_name: string;
  day: string; // "04"
  manager: string;
  source_file: string;
  sales_data: Record<string, number>;
  summary: {
    total_sales: number;
    net_cash: number;
    total_deductions: number;
    cash_paid: number;
  };
}

// Minimal shape of a SheetJS worksheet: cell address -> cell.
export type Cell = { v?: unknown; t?: string; f?: string };
export type Sheet = Record<string, Cell | undefined>;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Fixed column layout of the MASTER sheet, mapped to the keys used in sales_raw.json.
const COLUMNS = {
  sales: "B",
  tabbs: "J",
  c_c_tips: "R",
  net_cash: "N",
  tips: "P",
  deductions: "U",
  paid: "V",
} as const;

// Header text expected on the "Waitress Name" row. If the sheet layout changes, uploads fail loudly.
const EXPECTED_HEADERS: Record<string, string> = {
  A: "waitress name",
  B: "sales",
  J: "tabbs",
  N: "net cash",
  P: "tips",
  R: "c/c tips",
  U: "deductions",
  V: "paid",
};

// Rows in column A that are not waitresses. Add any new section names here.
const NOT_STAFF = new Set([
  "LORDS BAR",
  "CASH BACKS",
  "MANAGEMENT",
  "CROSSBAR",
  "SIDEBAR",
]);

const pad = (n: number) => String(n).padStart(2, "0");
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const text = (c?: Cell) =>
  c?.v === undefined || c?.v === null ? "" : String(c.v);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "CASH UP 04.08.2026.xlsx" or "CASH_UP_04_08_2026.xlsx" -> "2026-08-04" (day first). */
export function dateFromFileName(name: string): string | null {
  const m = /(\d{1,2})[._\-/ ](\d{1,2})[._\-/ ](\d{4})/.exec(name);
  if (!m) return null;
  const d = +m[1],
    mo = +m[2],
    y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  )
    return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function readNumber(ws: Sheet, col: string, row: number, who: string): number {
  const addr = `${col}${row}`;
  const c = ws[addr];
  if (!c || c.v === undefined || c.v === null || c.v === "") {
    if (c?.f) {
      throw new UploadError(
        `${who}: ${addr} is a formula with no saved result. Open the file in Excel, save it, then upload again.`,
      );
    }
    return 0;
  }
  if (c.t === "e")
    throw new UploadError(`${who}: ${addr} contains an Excel error.`);
  const n =
    typeof c.v === "number" ? c.v : Number(String(c.v).replace(/[R\s,]/g, ""));
  if (!Number.isFinite(n))
    throw new UploadError(`${who}: ${addr} is not a number.`);
  return round4(n);
}

/** Turns the MASTER sheet of one CASH UP workbook into one row per waitress. */
export function extractRows(ws: Sheet, fileName: string): RawRow[] {
  const date = dateFromFileName(fileName);
  if (!date)
    throw new UploadError(
      `${fileName}: no date in the file name. Name it like "CASH UP 04.08.2026.xlsx".`,
    );

  let headerRow = 0;
  for (let r = 1; r <= 10 && !headerRow; r++)
    if (norm(text(ws[`A${r}`])) === "waitress name") headerRow = r;
  if (!headerRow)
    throw new UploadError(
      `${fileName}: couldn't find the "Waitress Name" header row. Is this a CASH UP sheet?`,
    );
  for (const [col, want] of Object.entries(EXPECTED_HEADERS)) {
    if (norm(text(ws[`${col}${headerRow}`])) !== want) {
      throw new UploadError(
        `${fileName}: the sheet layout has changed (expected "${want}" in column ${col}).`,
      );
    }
  }

  const manager = (/manager:\s*(.+)/i.exec(text(ws["C1"]))?.[1] ?? "")
    .trim()
    .toUpperCase();
  const [year, month, day] = date.split("-");
  const rows: RawRow[] = [];
  const seen = new Set<string>();

  for (let r = headerRow + 1; r <= headerRow + 60; r++) {
    const label = text(ws[`A${r}`]).trim();
    if (!label) continue;
    const name = label.replace(/\s+/g, " ").toUpperCase();
    if (name === "T O T A L" || name === "TOTAL") break;
    if (NOT_STAFF.has(name)) continue;

    const who = `${fileName}, ${name}`;
    const sales = readNumber(ws, COLUMNS.sales, r, who);
    if (sales === 0) continue; // listed but did not trade
    if (seen.has(name))
      throw new UploadError(`${who}: name appears twice in the sheet.`);
    seen.add(name);

    const d = Object.fromEntries(
      Object.entries(COLUMNS).map(([key, col]) => [
        key,
        key === "sales" ? sales : readNumber(ws, col, r, who),
      ]),
    );
    rows.push({
      staff_name: name,
      date,
      year,
      month,
      month_name: MONTHS[+month - 1],
      day,
      manager,
      source_file: fileName,
      sales_data: d,
      summary: {
        total_sales: d.sales,
        net_cash: d.net_cash,
        total_deductions: d.deductions,
        cash_paid: Math.abs(d.paid), // the sheet's "Paid" column, always positive; shown as "Tips Earned" on the pages
      },
    });
  }
  if (!rows.length)
    throw new UploadError(`${fileName}: no staff rows with sales were found.`);
  return rows;
}

/** One row of the Supabase table `cash_up_rows` (see supabase/schema.sql). */
export interface DbRow {
  date: string;
  staff_name: string;
  manager: string;
  source_file: string;
  sales: number;
  tabbs: number;
  c_c_tips: number;
  net_cash: number;
  tips: number;
  deductions: number;
  paid: number;
}

/** What gets saved: the sheet's own numbers, with the sign of "paid" untouched. */
export function rowToDb(r: RawRow): DbRow {
  const d = r.sales_data;
  return {
    date: r.date,
    staff_name: r.staff_name,
    manager: r.manager,
    source_file: r.source_file,
    sales: d.sales,
    tabbs: d.tabbs,
    c_c_tips: d.c_c_tips,
    net_cash: d.net_cash,
    tips: d.tips,
    deductions: d.deductions,
    paid: d.paid,
  };
}

/** Rebuilds the row shape the aggregation below expects. cash_paid is always positive. */
export function dbToRaw(d: DbRow): RawRow {
  const n = (v: unknown) => Number(v) || 0; // numeric columns can arrive as strings
  const [year, month, day] = d.date.split("-");
  const paid = n(d.paid);
  const sales_data = {
    sales: n(d.sales),
    tabbs: n(d.tabbs),
    c_c_tips: n(d.c_c_tips),
    net_cash: n(d.net_cash),
    tips: n(d.tips),
    deductions: n(d.deductions),
    paid,
  };
  return {
    staff_name: d.staff_name,
    date: d.date,
    year,
    month,
    month_name: MONTHS[+month - 1],
    day,
    manager: d.manager ?? "",
    source_file: d.source_file ?? "",
    sales_data,
    summary: {
      total_sales: sales_data.sales,
      net_cash: sales_data.net_cash,
      total_deductions: sales_data.deductions,
      cash_paid: Math.abs(paid),
    },
  };
}

type Totals = {
  totalSales: number;
  netCash: number;
  totalDeductions: number;
  cashPaid: number;
};
const sumDaily = (recs: any[]): Totals => ({
  totalSales: round2(recs.reduce((s, x) => s + x.totalSales, 0)),
  netCash: round2(recs.reduce((s, x) => s + x.netCash, 0)),
  totalDeductions: round2(recs.reduce((s, x) => s + x.totalDeductions, 0)),
  cashPaid: round2(recs.reduce((s, x) => s + x.cashPaid, 0)),
});

export function buildByStaff(rows: RawRow[]) {
  const out: Record<string, any> = {};
  for (const r of rows) {
    const yr = r.date.slice(0, 4);
    const mn = MONTHS[+r.date.slice(5, 7) - 1];
    const staff = (out[r.staff_name] ??= { name: r.staff_name, years: {} });
    const month = ((staff.years[yr] ??= {})[mn] ??= {
      sales: {},
      daily_records: [],
      days_worked: 0,
    });
    month.daily_records.push({
      date: r.date,
      totalSales: r.summary.total_sales,
      netCash: r.summary.net_cash,
      totalDeductions: r.summary.total_deductions,
      cashPaid: r.summary.cash_paid,
    });
  }
  for (const staff of Object.values(out)) {
    const all: any[] = [];
    for (const months of Object.values<any>(staff.years)) {
      for (const m of Object.values<any>(months)) {
        m.daily_records.sort((a: any, b: any) => a.date.localeCompare(b.date));
        m.sales = sumDaily(m.daily_records);
        m.days_worked = m.daily_records.length;
        all.push(...m.daily_records);
      }
    }
    const t = sumDaily(all);
    staff.allTime = {
      ...t,
      daysWorked: all.length,
      averageDailySales: round2(t.totalSales / all.length),
      averageNetCash: round2(t.netCash / all.length),
    };
  }
  return out;
}

export function buildByMonth(byStaff: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const staff of Object.values<any>(byStaff)) {
    for (const [year, months] of Object.entries<any>(staff.years)) {
      for (const [month, m] of Object.entries<any>(months)) {
        const n = m.days_worked;
        ((out[year] ??= {})[month] ??= {})[staff.name] = {
          sales: {
            ...m.sales,
            averageDailySales: round2(m.sales.totalSales / n),
            averageNetCash: round2(m.sales.netCash / n),
            averageDeductions: round2(m.sales.totalDeductions / n),
            averageCashPaid: round2(m.sales.cashPaid / n),
          },
          daily_records: m.daily_records,
          days_worked: n,
        };
      }
    }
  }
  return out;
}
