// Where the staff JSON lives.
//  - "filesystem": reads/writes src/lib/staffSales/ (local `astro dev`).
//  - "github":     reads the current file from the repo and writes ONE commit with all three files;
//                  Vercel (or any host connected to the repo) then rebuilds from that commit.
// Vercel functions can't write to your source files, so production has to use "github".
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { RawRow } from "./cashUp";

const DIR = "src/lib/staffSales";
const RAW = "sales_raw.json";

const meta: Record<string, any> = (import.meta as any).env ?? {};
export const env = (name: string): string | undefined =>
  process.env[name] ?? meta[name];
export const isDev = Boolean(meta.DEV);

const target = () =>
  env("STAFF_UPLOAD_TARGET") ?? (isDev ? "filesystem" : "github");

export type SaveResult = { target: "filesystem" | "github"; detail: string };

function github() {
  const token = env("STAFF_GITHUB_TOKEN");
  const repo = env("STAFF_GITHUB_REPO"); // "owner/name"
  const branch = env("STAFF_GITHUB_BRANCH") ?? "main";
  if (!token || !repo)
    throw new Error(
      "GitHub storage is not configured (STAFF_GITHUB_TOKEN / STAFF_GITHUB_REPO).",
    );
  const call = async (
    p: string,
    init: RequestInit = {},
    accept = "application/vnd.github+json",
  ) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${p}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "lords-staff-upload",
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${p}`);
    return res;
  };
  return { repo, branch, call };
}

/** Current sales_raw.json. Throws if it can't be read, so a bad config can never wipe history. */
export async function loadRaw(): Promise<RawRow[]> {
  if (target() === "filesystem") {
    return JSON.parse(
      await readFile(path.resolve(process.cwd(), DIR, RAW), "utf8"),
    );
  }
  const { branch, call } = github();
  // Read from the repo (not the deployed bundle) so back-to-back uploads never overwrite each other.
  const res = await call(
    `/contents/${DIR}/${RAW}?ref=${branch}`,
    {},
    "application/vnd.github.raw+json",
  );
  return JSON.parse(await res.text());
}

export async function saveJsonFiles(
  files: Record<string, unknown>,
): Promise<SaveResult> {
  const serialised = Object.entries(files).map(
    ([name, data]) => [name, JSON.stringify(data, null, 2) + "\n"] as const,
  );
  return target() === "filesystem"
    ? saveToDisk(serialised)
    : saveToGitHub(serialised);
}

async function saveToDisk(
  files: readonly (readonly [string, string])[],
): Promise<SaveResult> {
  const dir = path.resolve(process.cwd(), DIR);
  await mkdir(dir, { recursive: true });
  // Temp files first, then swap in, so a failure never leaves half-updated data.
  for (const [name, body] of files)
    await writeFile(path.join(dir, name + ".tmp"), body, "utf8");
  for (const [name] of files)
    await rename(path.join(dir, name + ".tmp"), path.join(dir, name));
  return { target: "filesystem", detail: `Saved to ${DIR}/` };
}

async function saveToGitHub(
  files: readonly (readonly [string, string])[],
): Promise<SaveResult> {
  const { repo, branch, call } = github();
  const json = (res: Response) => res.json();
  const post = (p: string, body: unknown, method = "POST") =>
    call(p, { method, body: JSON.stringify(body) }).then(json);

  const ref = await call(`/git/ref/heads/${branch}`).then(json);
  const baseSha: string = ref.object.sha;
  const baseCommit = await call(`/git/commits/${baseSha}`).then(json);
  const tree = await post("/git/trees", {
    base_tree: baseCommit.tree.sha,
    tree: files.map(([name, content]) => ({
      path: `${DIR}/${name}`,
      mode: "100644",
      type: "blob",
      content,
    })),
  });
  const commit = await post("/git/commits", {
    message: "Update staff sales data from CASH UP upload",
    tree: tree.sha,
    parents: [baseSha],
  });
  await post(`/git/refs/heads/${branch}`, { sha: commit.sha }, "PATCH");
  return {
    target: "github",
    detail: `Committed to ${repo}@${branch} (${commit.sha.slice(0, 7)})`,
  };
}
