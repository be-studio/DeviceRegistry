export interface ImportError {
  line: number;
  field?: string;
  message: string;
}

export type UploadOutcome =
  | { status: "accepted"; newDevices: number; skippedRows: number }
  | { status: "rejected"; errors: ImportError[] };

// Row-level problems come back as an outcome; anything else (401, 403, 413, a bad file) throws
export async function uploadDevices(file: File): Promise<UploadOutcome> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/imports", { method: "POST", body: form });
  const body = await response.json().catch(() => null);

  if ((response.ok || response.status === 422) && body) {
    return body as UploadOutcome;
  }
  throw new Error(body?.error ?? "The upload failed. Please try again.");
}
