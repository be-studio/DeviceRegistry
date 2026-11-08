import { useState, type FormEvent } from "react";
import { uploadDevices, type UploadOutcome } from "../api/uploadDevices";

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    setOutcome(null);
    setError(null);
    setUploading(true);
    try {
      setOutcome(await uploadDevices(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <h1>Upload devices</h1>
      <p>
        Choose a CSV file. It is accepted only if every row is valid, otherwise
        nothing is saved.
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={!file || uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {outcome?.status === "accepted" && (
        <p className="success">
          Upload accepted: {outcome.newDevices} new devices added,{" "}
          {outcome.skippedRows} already registered rows skipped.
        </p>
      )}

      {outcome?.status === "rejected" && (
        <>
          <p className="error">
            Upload rejected, nothing was saved. Fix these{" "}
            {outcome.errors.length} problems and upload again.
          </p>
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Field</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {outcome.errors.map((e, index) => (
                <tr key={index}>
                  <td>{e.line}</td>
                  <td>{e.field ?? "—"}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
