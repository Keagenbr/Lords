// src/lib/optimizeImage.ts
//
// Server-side image optimisation for the admin uploads (used by
// src/pages/admin/upload-image.ts).
//
// Uses `sharp`, the image library Astro itself uses for astro:assets. It is
// actively maintained and is already in your lockfile. (Squoosh's CLI /
// libsquoosh packages were deprecated by Google in 2023 and are no longer
// maintained, so they are not used here.)
//
// FAIL-SAFE: this function NEVER throws. If anything goes wrong (sharp cannot
// load, the file is corrupt, an unsupported format ...) it returns
// `status: "failed"` with the original bytes, so the caller can still upload
// the original image and tell the admin the optimisation did not happen.

export type OptimizeStatus = "optimized" | "skipped" | "failed";

export interface OptimizeResult {
  status: OptimizeStatus;
  /** Bytes to upload (optimised, or the untouched original). */
  data: Uint8Array;
  /** MIME type of `data`. */
  contentType: string;
  originalBytes: number;
  finalBytes: number;
  /** Human-readable reason for "skipped" / "failed". */
  message?: string;
}

export interface OptimizeOptions {
  /** Longest side in pixels; larger images are scaled down (never up). */
  maxDimension: number;
  /**
   * Output format. "same" keeps the format of the uploaded file; otherwise the
   * image is converted (e.g. "webp" for new item pictures, or the format that
   * matches the target file extension when replacing an existing image).
   */
  format: "same" | "jpeg" | "png" | "webp";
  /** 1-100. Ignored for PNG (lossless). */
  quality?: number;
}

const MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Formats sharp can read and we are happy to re-encode. SVG and GIF are left
// alone (vector / animated), and anything else is reported as skipped.
const OPTIMIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/** "MenuPage1.jpg" -> "jpeg", "x.PNG" -> "png", "x.webp" -> "webp". */
export function formatFromFilename(filename: string): "jpeg" | "png" | "webp" | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  return null;
}

function formatFromMime(mime: string): "jpeg" | "png" | "webp" | null {
  if (mime === "image/jpeg") return "jpeg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

export async function optimizeImage(
  original: Uint8Array,
  originalMime: string,
  options: OptimizeOptions,
): Promise<OptimizeResult> {
  const originalBytes = original.byteLength;
  const untouched = (
    status: OptimizeStatus,
    message: string,
  ): OptimizeResult => ({
    status,
    data: original,
    contentType: originalMime,
    originalBytes,
    finalBytes: originalBytes,
    message,
  });

  try {
    if (!OPTIMIZABLE.has(originalMime)) {
      return untouched(
        "skipped",
        `${originalMime || "This file type"} is not optimised; uploaded as-is.`,
      );
    }

    // Loaded lazily so a missing / broken native binary is caught by the
    // try/catch below instead of crashing the whole upload route at import.
    const { default: sharp } = await import("sharp");

    const target = options.format === "same" ? formatFromMime(originalMime) : options.format;
    if (!target) {
      return untouched("skipped", "No suitable output format; uploaded as-is.");
    }
    const quality = options.quality ?? 82;

    let pipeline = sharp(original, { failOn: "error" })
      // Apply the camera's EXIF orientation; metadata (GPS, camera model...)
      // is dropped by default when re-encoding.
      .rotate()
      .resize({
        width: options.maxDimension,
        height: options.maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      });

    if (target === "jpeg") {
      // JPEG has no transparency: flatten onto white so it does not go black.
      pipeline = pipeline
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true, progressive: true });
    } else if (target === "png") {
      pipeline = pipeline.png({ compressionLevel: 9, effort: 7 });
    } else {
      pipeline = pipeline.webp({ quality, effort: 5 });
    }

    const out = await pipeline.toBuffer();
    const sameFormat = formatFromMime(originalMime) === target;

    // Re-encoding an already well-compressed image can make it bigger. If the
    // format is unchanged, keep whichever is smaller.
    if (sameFormat && out.byteLength >= originalBytes) {
      return untouched("skipped", "Already well optimised; original kept.");
    }

    return {
      status: "optimized",
      data: new Uint8Array(out.buffer, out.byteOffset, out.byteLength),
      contentType: MIME[target],
      originalBytes,
      finalBytes: out.byteLength,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[optimizeImage] failed, uploading the original instead:", reason);
    return untouched("failed", reason);
  }
}
