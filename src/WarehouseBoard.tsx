import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  warehouseStatuses,
  type Identity,
  type JobView,
  type WarehouseStatus,
} from "../shared/contracts";
import slip from "../shared/sample-packing-slip.json";

type Action = (
  path: string,
  payload: unknown,
  message: string,
) => Promise<boolean>;
const time = (value: string) =>
  new Date(value).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
const day = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
};
export function WarehouseBoard({
  jobs,
  identity,
  busy,
  error,
  act,
}: {
  jobs: JobView[];
  identity: Identity;
  busy: boolean;
  error: string;
  act: Action;
}) {
  const [search, setSearch] = useState("");
  const [shipping, setShipping] = useState("");
  const [priority, setPriority] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, setPending] = useState<JobView | null>(null);
  const [tracking, setTracking] = useState("");
  const [info, setInfo] = useState("");
  const [printing, setPrinting] = useState(false);
  const canMove = identity.move && identity.roles.includes("warehouse");
  useEffect(() => {
    setPending(null);
    setPrinting(false);
    setInfo("");
  }, [identity.id]);
  const filtered = jobs.filter(
    (job) =>
      (!shipping || job.shippingType === shipping) &&
      (!priority || job.priority === priority) &&
      (!from || day(job.createdAt) >= from) &&
      (!to || day(job.createdAt) <= to) &&
      `${job.accountName} ${job.invoiceNumber} ${job.assignedRep} ${job.notes} ${job.shipment?.tracking ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function document(job: JobView, print: boolean) {
    setInfo("");
    const popup = print ? null : window.open("about:blank", "_blank");
    try {
      const response = await fetch(`/api/jobs/${job.id}/packing-slip.pdf`, {
        headers: { "X-Demo-Identity": identity.id },
      });
      if (!response.ok)
        throw new Error("Packing slip is unavailable for this identity.");
      if (print) {
        setPrinting(true);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      if (popup) {
        popup.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        URL.revokeObjectURL(url);
        throw new Error("Allow the local PDF popup to view the slip.");
      }
    } catch (error) {
      popup?.close();
      setInfo(error instanceof Error ? error.message : "Document failed.");
    }
  }
  function move(job: JobView, target: WarehouseStatus) {
    if (!canMove || busy) return;
    setInfo("");
    if (target === "Partially Shipped") {
      setInfo(
        "Partial shipment quantity/package rules are pending. This column is read-only.",
      );
      return;
    }
    if (target === "Shipped") {
      setTracking("");
      setPending(job);
      return;
    }
    void act(
      `/jobs/${job.id}/move`,
      {
        target,
        expectedRevision: job.revision,
        requestKey: crypto.randomUUID(),
      },
      "Card moved",
    );
  }
  return (
    <section className="warehouse">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FULFILLMENT</span>
          <h2>Warehouse board</h2>
        </div>
        <span className="badge">
          {jobs.length} released {jobs.length === 1 ? "job" : "jobs"}
        </span>
      </div>
      <p>
        Labels are purchased through the existing warehouse process. Tracking is
        recorded here after purchase.
      </p>
      <div className="board-filters">
        <label>
          Search
          <input
            aria-label="Search warehouse"
            placeholder="Customer, invoice, rep or tracking"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Shipping type
          <select
            aria-label="Shipping type"
            value={shipping}
            onChange={(e) => setShipping(e.target.value)}
          >
            <option value="">All types</option>
            <option>Shipping</option>
            <option>Pickup</option>
          </select>
        </label>
        <label>
          Priority
          <select
            aria-label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">All priorities</option>
            <option>Normal</option>
            <option>Urgent</option>
          </select>
        </label>
        <label>
          From date (Pacific)
          <input
            aria-label="From date (Pacific)"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To date (Pacific)
          <input
            aria-label="To date (Pacific)"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {!jobs.length && (
        <div className="empty">
          <h3>No released work yet</h3>
          <p>Unpaid and partially paid invoices stay outside this queue.</p>
        </div>
      )}
      {!!jobs.length && !filtered.length && (
        <p role="status">No cards match these filters.</p>
      )}
      {info && (
        <div className="hold-note" role="status">
          {info}
        </div>
      )}
      <div className="kanban">
        {warehouseStatuses.map((status) => (
          <section
            key={status}
            className="kanban-column"
            aria-label={`${status} column`}
            onDragOver={(e) => {
              if (canMove) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const job = jobs.find(
                (j) => j.id === e.dataTransfer.getData("text/plain"),
              );
              if (job) move(job, status);
            }}
          >
            <div className="column-title">
              <h3>{status}</h3>
              <span>{filtered.filter((j) => j.status === status).length}</span>
            </div>
            {status === "Partially Shipped" && (
              <p className="column-hint">
                Quantity workflow pending · read-only
              </p>
            )}
            {status === "Dropoff/Pickup" && (
              <p className="column-hint">
                Awaiting pickup · completion deferred
              </p>
            )}
            {filtered
              .filter((j) => j.status === status)
              .map((job) => (
                <article
                  className="panel job-card"
                  key={job.id}
                  data-testid="warehouse-job"
                  draggable={canMove && job.status === "Orders" && !busy}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", job.id)
                  }
                >
                  <div className="panel-title">
                    <h3>{job.invoiceNumber}</h3>
                    <span
                      className={`badge ${job.priority === "Urgent" ? "" : "green"}`}
                    >
                      {job.priority}
                    </span>
                  </div>
                  <p>{job.accountName}</p>
                  <div className="card-meta">
                    <span>{job.assignedRep}</span>
                    <span>{job.shippingType}</span>
                  </div>
                  <p className="job-id">{job.id}</p>
                  <p className="card-notes">{job.notes}</p>
                  {job.items.map((item) => (
                    <div className="job-item" key={item.sku}>
                      <span>{item.sku}</span>
                      <strong>
                        {item.quantity} {item.unit}
                      </strong>
                    </div>
                  ))}
                  <small>
                    Created {time(job.createdAt)} PT
                    <br />
                    Updated {time(job.updatedAt)} PT
                    <br />
                    Linked source: {job.invoiceId}
                  </small>
                  {job.review && (
                    <div className="hold-note">
                      Review required · {job.review}
                    </div>
                  )}
                  {job.shipment && (
                    <div className="tracking">
                      <strong>Tracking</strong>
                      <p>{job.shipment.tracking}</p>
                      <small>Saved {time(job.shipment.savedAt)} PT</small>
                    </div>
                  )}
                  <details>
                    <summary>Documents & actions</summary>
                    <p className="column-hint">
                      Generic sample packing slip; separate from any invoice
                      PDF.
                    </p>
                    <button onClick={() => document(job, false)}>
                      View Packing Slip PDF
                    </button>{" "}
                    <button onClick={() => document(job, true)}>Print</button>
                  </details>
                  {canMove && job.status === "Orders" && (
                    <button
                      className="move-button"
                      disabled={busy}
                      onClick={() =>
                        move(
                          job,
                          job.shippingType === "Pickup"
                            ? "Dropoff/Pickup"
                            : "Shipped",
                        )
                      }
                    >
                      Move to{" "}
                      {job.shippingType === "Pickup"
                        ? "Dropoff/Pickup"
                        : "Shipped"}
                    </button>
                  )}
                  {!canMove && <small>Read-only sales view</small>}
                  {job.alert && (
                    <div className={`slack-preview ${job.alert.status}`}>
                      <h4>
                        Local Slack{" "}
                        {job.alert.status === "sent" ? "capture" : "alert"} ·{" "}
                        {job.alert.status}
                      </h4>
                      <p>{job.alert.message}</p>
                      <small>Attempts: {job.alert.attempts}</small>
                      {job.alert.error && <p role="alert">{job.alert.error}</p>}
                      {canMove && job.alert.status === "failed" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/jobs/${job.id}/alert/retry`,
                              {},
                              "Alert retry processed; shipment remains saved",
                            )
                          }
                        >
                          Retry Slack alert
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
          </section>
        ))}
      </div>
      {pending &&
        createPortal(
          <div className="modal-overlay">
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Record shipment tracking"
            >
              <h2>Move {pending.invoiceNumber} to Shipped</h2>
              <p>
                Buy the label through your existing process, then enter its
                tracking number. Cancel makes no changes.
              </p>
              {error && <p role="alert">{error}</p>}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await act(
                    `/jobs/${pending.id}/move`,
                    {
                      target: "Shipped",
                      tracking,
                      expectedRevision: pending.revision,
                      requestKey: crypto.randomUUID(),
                    },
                    "Shipment saved; local Slack outcome recorded",
                  );
                  if (ok) setPending(null);
                }}
              >
                <label>
                  Tracking number
                  <input
                    aria-label="Tracking number"
                    autoFocus
                    required
                    minLength={5}
                    maxLength={80}
                    pattern="[A-Za-z0-9][A-Za-z0-9-]{4,79}"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                  />
                </label>
                <p>
                  5–80 letters, digits or hyphens. Carrier validation remains
                  outside this demo.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary" disabled={busy}>
                    Save shipment
                  </button>
                </div>
              </form>
            </section>
          </div>,
          window.document.body,
        )}
      {printing &&
        createPortal(
          <div
            className="print-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Sample packing slip print preview"
          >
            <div className="no-print">
              <button onClick={() => setPrinting(false)}>
                Close print preview
              </button>{" "}
              <button onClick={() => window.print()}>Print sample slip</button>
            </div>
            <article className="packing-paper">
              <h1>DIZZLE / PACKING</h1>
              <h2>{slip.title}</h2>
              <p>{slip.reference}</p>
              <h3>Ship to</h3>
              <p>
                {slip.customer}
                <br />
                {slip.address}
              </p>
              <p>Invoice reference: {slip.invoiceReference}</p>
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Description</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{slip.sku}</td>
                    <td>{slip.description}</td>
                    <td>{slip.quantity}</td>
                  </tr>
                </tbody>
              </table>
              <p>Packed by: ____________________</p>
              <p>Checked by: ____________________</p>
              <h3>LOCAL REFERENCE SAMPLE ONLY</h3>
              <p>{slip.note}</p>
            </article>
          </div>,
          window.document.body,
        )}
    </section>
  );
}
