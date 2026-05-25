import { CopypartySettings, buildAuthHeaders } from "./settings";

/**
 * Upload a File to copyparty via HTTP PUT using XMLHttpRequest.
 * fetch() with PUT is blocked in no-cors mode; XHR bypasses this in Electron.
 * Returns the remote URL with ?raw appended, ready to embed.
 */
export async function uploadFileToCopyparty(
  file: File,
  settings: CopypartySettings
): Promise<string> {
  if (!settings.serverUrl) {
    throw new Error("Copyparty server URL is not configured.");
  }

  const safeName = sanitizeFilename(file.name);
  const uploadPath = buildUploadPath(settings, safeName);
  const authHeaders = buildAuthHeaders(settings) as Record<string, string>;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadPath, true);

    for (const [key, val] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(key, val);
    }
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `Copyparty returned HTTP ${xhr.status}: ${xhr.responseText.slice(0, 200)}`
          )
        );
      }
    };

    xhr.onerror = () =>
      reject(new Error("Network error uploading to copyparty"));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out"));

    xhr.timeout = 60000; // 60s
    xhr.send(file);
  });

  const remoteUrl = buildUploadPath(settings, safeName);
  return remoteUrl + "?raw";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUploadPath(settings: CopypartySettings, filename: string): string {
  const base = settings.serverUrl.replace(/\/$/, "");
  const dir = settings.uploadPath.replace(/\/$/, "") || "";
  return `${base}${dir}/${filename}`;
}

function sanitizeFilename(name: string): string {
  const now = new Date();
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const dot = name.lastIndexOf(".");
  const base = dot > -1 ? name.slice(0, dot) : name;
  const ext = dot > -1 ? name.slice(dot) : "";
  const clean = base
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, ""); // strip leading/trailing underscores
  return `${ts}_${clean}${ext}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
