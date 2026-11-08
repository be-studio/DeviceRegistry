import { useState, type FormEvent } from "react";
import { GraphQLRequestError, graphql } from "../api/graphql";

interface Device {
  imei: string;
  serialNumber: string;
  sku: string;
  colour: string;
  cartonSerial: string;
  palletSerial: string;
  productionDate: string | null;
  purchaseOrder: string | null;
  destinationCountry: string | null;
  model: {
    tac: string;
    brand: string;
    model: string;
    manufacturerName: string;
  };
}

function Section({
  title,
  rows
}: {
  title: string;
  rows: [string, string | null][];
}) {
  return (
    <section>
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DeviceLookupPage() {
  const [imei, setImei] = useState("");
  const [device, setDevice] = useState<Device | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setDevice(null);
    setMessage(null);

    const value = imei.trim();
    if (!/^\d{15}$/.test(value)) {
      setMessage("Enter an IMEI of exactly 15 digits.");
      return;
    }

    setLoading(true);
    try {
      const data = await graphql<{ device: Device | null }>(
        `
          query ($imei: String!) {
            device(imei: $imei) {
              imei
              serialNumber
              sku
              colour
              cartonSerial
              palletSerial
              productionDate
              purchaseOrder
              destinationCountry
              model {
                tac
                brand
                model
                manufacturerName
              }
            }
          }
        `,
        { imei: value }
      );
      if (data.device) setDevice(data.device);
      else setMessage("No device is registered with this IMEI.");
    } catch (err) {
      setMessage(
        err instanceof GraphQLRequestError && err.code === "FORBIDDEN"
          ? "Only administrators can look up devices."
          : "The lookup failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Device lookup</h1>
      <form onSubmit={handleSubmit}>
        <label>
          IMEI (15 digits)
          <input
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {message && <p className="error">{message}</p>}
      {device && (
        <>
          <Section
            title="Device"
            rows={[
              ["IMEI", device.imei],
              ["Serial number", device.serialNumber],
              ["SKU", device.sku],
              ["Colour", device.colour]
            ]}
          />
          <Section
            title="Model"
            rows={[
              ["TAC", device.model.tac],
              ["Brand", device.model.brand],
              ["Model", device.model.model],
              ["Manufacturer", device.model.manufacturerName]
            ]}
          />
          <Section
            title="Logistics"
            rows={[
              ["Carton serial", device.cartonSerial],
              ["Pallet serial", device.palletSerial],
              ["Production date", device.productionDate],
              ["Purchase order", device.purchaseOrder],
              ["Destination country", device.destinationCountry]
            ]}
          />
        </>
      )}
    </>
  );
}
