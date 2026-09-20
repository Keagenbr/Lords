import type { APIRoute } from "astro";
import fs from "fs";
import path from "path";

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { byMonth, byStaff, raw } = data;

    // Path to save JSON files (adjust based on your structure)
    const outputDir = path.join(process.cwd(), "src", "lib", "staffSales");

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Merge with existing data (if any)
    let existingByMonth = {};
    let existingByStaff = {};
    let existingRaw = [];

    try {
      existingByMonth = JSON.parse(
        fs.readFileSync(path.join(outputDir, "sales_by_month.json"), "utf-8"),
      );
    } catch {}
    try {
      existingByStaff = JSON.parse(
        fs.readFileSync(path.join(outputDir, "sales_by_staff.json"), "utf-8"),
      );
    } catch {}
    try {
      existingRaw = JSON.parse(
        fs.readFileSync(path.join(outputDir, "sales_raw.json"), "utf-8"),
      );
    } catch {}

    // Merge function for byMonth data
    const mergeByMonth = (existing: any, incoming: any) => {
      const merged = { ...existing };
      for (const year in incoming) {
        if (!merged[year]) merged[year] = {};
        for (const month in incoming[year]) {
          if (!merged[year][month]) merged[year][month] = {};
          for (const staff in incoming[year][month]) {
            // If staff exists, merge data
            if (merged[year][month][staff]) {
              const existing = merged[year][month][staff];
              const incoming = incoming[year][month][staff];

              // Merge sales totals
              existing.sales.totalSales += incoming.sales.totalSales;
              existing.sales.netCash += incoming.sales.netCash;
              existing.sales.totalDeductions += incoming.sales.totalDeductions;
              existing.sales.cashPaid += incoming.sales.cashPaid;
              existing.days_worked += incoming.days_worked;

              // Merge daily records (avoid duplicates)
              const existingDates = new Set(
                existing.daily_records.map((r: any) => r.date),
              );
              for (const record of incoming.daily_records) {
                if (!existingDates.has(record.date)) {
                  existing.daily_records.push(record);
                }
              }

              // Recalculate averages
              if (existing.days_worked > 0) {
                existing.sales.averageDailySales =
                  Math.round(
                    (existing.sales.totalSales / existing.days_worked) * 100,
                  ) / 100;
                existing.sales.averageNetCash =
                  Math.round(
                    (existing.sales.netCash / existing.days_worked) * 100,
                  ) / 100;
              }
            } else {
              merged[year][month][staff] = incoming[year][month][staff];
            }
          }
        }
      }
      return merged;
    };

    // Merge function for byStaff data
    const mergeByStaff = (existing: any, incoming: any) => {
      const merged = { ...existing };
      for (const staffName in incoming) {
        if (!merged[staffName]) {
          merged[staffName] = incoming[staffName];
        } else {
          // Merge years
          for (const year in incoming[staffName].years) {
            if (!merged[staffName].years[year]) {
              merged[staffName].years[year] = incoming[staffName].years[year];
            } else {
              // Merge months
              for (const month in incoming[staffName].years[year]) {
                if (!merged[staffName].years[year][month]) {
                  merged[staffName].years[year][month] =
                    incoming[staffName].years[year][month];
                } else {
                  // Merge month data
                  const existing = merged[staffName].years[year][month];
                  const incoming = incoming[staffName].years[year][month];

                  existing.sales.totalSales += incoming.sales.totalSales;
                  existing.sales.netCash += incoming.sales.netCash;
                  existing.sales.totalDeductions +=
                    incoming.sales.totalDeductions;
                  existing.sales.cashPaid += incoming.sales.cashPaid;
                  existing.days_worked += incoming.days_worked;

                  // Merge records
                  const existingDates = new Set(
                    existing.daily_records.map((r: any) => r.date),
                  );
                  for (const record of incoming.daily_records) {
                    if (!existingDates.has(record.date)) {
                      existing.daily_records.push(record);
                    }
                  }
                }
              }
            }
          }

          // Update all-time stats
          const at = merged[staffName].allTime;
          const incomingAt = incoming[staffName].allTime;
          at.totalSales += incomingAt.totalSales;
          at.netCash += incomingAt.netCash;
          at.totalDeductions += incomingAt.totalDeductions;
          at.cashPaid += incomingAt.cashPaid;
          at.daysWorked += incomingAt.daysWorked;
          if (at.daysWorked > 0) {
            at.averageDailySales =
              Math.round((at.totalSales / at.daysWorked) * 100) / 100;
            at.averageNetCash =
              Math.round((at.netCash / at.daysWorked) * 100) / 100;
          }
        }
      }
      return merged;
    };

    // Merge raw data (avoid duplicates by date+staff)
    const mergeRaw = (existing: any[], incoming: any[]) => {
      const seen = new Set(existing.map((r) => `${r.date}-${r.staff_name}`));
      const merged = [...existing];
      for (const record of incoming) {
        const key = `${record.date}-${record.staff_name}`;
        if (!seen.has(key)) {
          merged.push(record);
          seen.add(key);
        }
      }
      return merged;
    };

    const finalByMonth = mergeByMonth(existingByMonth, byMonth);
    const finalByStaff = mergeByStaff(existingByStaff, byStaff);
    const finalRaw = mergeRaw(existingRaw, raw);

    // Save files
    fs.writeFileSync(
      path.join(outputDir, "sales_by_month.json"),
      JSON.stringify(finalByMonth, null, 2),
    );
    fs.writeFileSync(
      path.join(outputDir, "sales_by_staff.json"),
      JSON.stringify(finalByStaff, null, 2),
    );
    fs.writeFileSync(
      path.join(outputDir, "sales_raw.json"),
      JSON.stringify(finalRaw, null, 2),
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Data saved successfully",
        stats: {
          recordsProcessed: raw.length,
          staffCount: Object.keys(byStaff).length,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("API Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
