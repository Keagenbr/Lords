import type { APIRoute } from "astro";
import { read } from "xlsx";
import { timingSafeEqual } from "node:crypto";
import {
  extractRows,
  mergeRows,
  buildAll,
  UploadError,
  type RawRow,
  type Sheet,
} from "../../lib/staffSales/cashUp.ts";
import {
  loadRaw,
  saveJsonFiles,
  env,
  isDev,
} from "../../lib/staffSales/storage.ts";

export const prerender = false; // runs on the server, on demand

const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // stays under Vercel's ~4.5 MB request limit
const MAX_FILES = 31;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function keyMatches(given: string | null, expected: string) {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request }) => {
  // This endpoint overwrites business data, so it stays closed in production unless a key is set.
  const key = env("STAFF_UPLOAD_TOKEN");
  if (!key && !isDev)
    return json(
      {
        error:
          "Uploads are disabled: STAFF_UPLOAD_TOKEN is not set on the server.",
      },
      503,
    );
  if (key && !keyMatches(request.headers.get("x-upload-key"), key))
    return json({ error: "Wrong upload key." }, 401);

  let files: File[];
  try {
    files = (await request.formData())
      .getAll("file")
      .filter((f): f is File => f instanceof File);
  } catch {
    return json({ error: "Expected a file upload." }, 400);
  }
  if (!files.length) return json({ error: "No files received." }, 400);
  if (files.length > MAX_FILES)
    return json({ error: `Upload at most ${MAX_FILES} files at a time.` }, 400);
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES)
    return json({ error: "Files are larger than 4 MB in total." }, 400);

  try {
    const incoming: RawRow[] = [];
    const summary: { name: string; date: string; staff: number }[] = [];
    const dates = new Set<string>();

    for (const file of files) {
      if (!/\.(xlsx|xls)$/i.test(file.name))
        throw new UploadError(
          `${file.name}: only .xlsx or .xls files are accepted.`,
        );
      let sheet: Sheet;
      try {
        const wb = read(Buffer.from(await file.arrayBuffer()), {
          type: "buffer",
        });
        sheet = (wb.Sheets["MASTER"] ??
          wb.Sheets[wb.SheetNames[0]]) as unknown as Sheet;
      } catch {
        throw new UploadError(
          `${file.name}: could not be read as an Excel workbook.`,
        );
      }
      if (!sheet)
        throw new UploadError(`${file.name}: the workbook has no sheets.`);
      const rows = extractRows(sheet, file.name);
      if (dates.has(rows[0].date))
        throw new UploadError(
          `${file.name}: another file in this upload is for the same date (${rows[0].date}).`,
        );
      dates.add(rows[0].date);
      incoming.push(...rows);
      summary.push({ name: file.name, date: rows[0].date, staff: rows.length });
    }

    // Add to the existing data (re-uploading a date replaces that date), then rebuild all three files.
    const { rows, replaced } = mergeRows(await loadRaw(), incoming);
    const saved = await saveJsonFiles(buildAll(rows));
    return json({
      ok: true,
      files: summary,
      replaced,
      target: saved.target,
      detail: saved.detail,
    });
  } catch (err) {
    if (err instanceof UploadError)
      return json({ error: `Nothing was saved. ${err.message}` }, 400);
    console.error("[update-sales]", err);
    return json(
      {
        error:
          "Saving failed on the server. Nothing was changed; check the server logs.",
      },
      500,
    );
  }
};
