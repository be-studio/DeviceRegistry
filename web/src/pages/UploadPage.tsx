import { useRef, useState, type FormEvent } from "react";
import { uploadDevices, type UploadOutcome } from "../api/uploadDevices";

const pluralRules = new Intl.PluralRules("en-GB");

function countOf(count: number, one: string, other: string) {
  return `${count} ${pluralRules.select(count) === "one" ? one : other}`;
}

export function UploadPage() {
  const fileInput = useRef<HTMLInputElement>(null);
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
      const result = await uploadDevices(file);
      setOutcome(result);
      // A rejected file stays selected so it can be fixed and sent again
      if (result.status === "accepted" && fileInput.current) {
        fileInput.current.value = "";
        setFile(null);
      }
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
            ref={fileInput}
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
          Upload accepted:{" "}
          {countOf(outcome.newDevices, "new device", "new devices")} added,{" "}
          {countOf(
            outcome.skippedRows,
            "already registered row",
            "already registered rows"
          )}{" "}
          skipped.
        </p>
      )}

      {outcome?.status === "rejected" && (
        <>
          <p className="error">
            Upload rejected, nothing was saved. Fix the{" "}
            {countOf(outcome.errors.length, "problem", "problems")} below and
            upload again.
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
