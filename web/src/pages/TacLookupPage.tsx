import { useState, type FormEvent } from "react";
import { graphql } from "../api/graphql";

interface TacModel {
  tac: string;
  brand: string;
  model: string;
  manufacturerName: string;
}

export function TacLookupPage() {
  const [tac, setTac] = useState("");
  const [result, setResult] = useState<TacModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    setMessage(null);

    const value = tac.trim();
    if (!/^\d{8}$/.test(value)) {
      setMessage("Enter a TAC of exactly 8 digits.");
      return;
    }

    setLoading(true);
    try {
      const data = await graphql<{ tac: TacModel | null }>(
        `
          query ($tac: String!) {
            tac(tac: $tac) {
              tac
              brand
              model
              manufacturerName
            }
          }
        `,
        { tac: value }
      );
      if (data.tac) setResult(data.tac);
      else setMessage("No model is registered for this TAC.");
    } catch {
      setMessage("The lookup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>TAC lookup</h1>
      <p>Find the brand, model and manufacturer for a device TAC.</p>
      <form onSubmit={handleSubmit}>
        <label>
          TAC (8 digits)
          <input
            value={tac}
            onChange={(e) => setTac(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {message && <p className="error">{message}</p>}
      {result && (
        <dl>
          <dt>TAC</dt>
          <dd>{result.tac}</dd>
          <dt>Brand</dt>
          <dd>{result.brand}</dd>
          <dt>Model</dt>
          <dd>{result.model}</dd>
          <dt>Manufacturer</dt>
          <dd>{result.manufacturerName}</dd>
        </dl>
      )}
    </>
  );
}
