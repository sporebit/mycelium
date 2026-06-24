"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Prescription = {
  id: string;
  prescribed_at: string;
  optician: string | null;
  eye: "left" | "right";
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  add_power: number | null;
  pupillary_distance: number | null;
  is_contact_lens: boolean;
  base_curve: number | null;
  diameter: number | null;
  brand: string | null;
  notes: string | null;
};

type PrescriptionPair = {
  prescribed_at: string;
  optician: string | null;
  is_contact_lens: boolean;
  left: Prescription | null;
  right: Prescription | null;
  notes: string | null;
};

function fmtNum(n: number | null): string {
  if (n === null) return "—";
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function groupPairs(prescriptions: Prescription[]): PrescriptionPair[] {
  const map = new Map<string, PrescriptionPair>();
  for (const p of prescriptions) {
    const key = `${p.prescribed_at}_${p.is_contact_lens}`;
    if (!map.has(key)) {
      map.set(key, {
        prescribed_at: p.prescribed_at,
        optician: p.optician,
        is_contact_lens: p.is_contact_lens,
        left: null,
        right: null,
        notes: p.notes,
      });
    }
    const pair = map.get(key)!;
    if (p.eye === "left") pair.left = p;
    else pair.right = p;
    if (p.optician) pair.optician = p.optician;
    if (p.notes) pair.notes = p.notes;
  }
  return Array.from(map.values()).sort(
    (a, b) => b.prescribed_at.localeCompare(a.prescribed_at),
  );
}

function EyeCard({ label, p }: { label: string; p: Prescription | null }) {
  if (!p) {
    return (
      <div className="flex-1 p-4 rounded-xl border border-ink-2 bg-ink-1 opacity-40">
        <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
          {label}
        </p>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">No data</p>
      </div>
    );
  }
  return (
    <div className="flex-1 p-4 rounded-xl border border-ink-2 bg-ink-1">
      <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-3">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
        <div>
          <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">SPH</span>
          <p className="text-ink-4 font-[family-name:var(--font-mono)]">{fmtNum(p.sphere)}</p>
        </div>
        <div>
          <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">CYL</span>
          <p className="text-ink-4 font-[family-name:var(--font-mono)]">{fmtNum(p.cylinder)}</p>
        </div>
        <div>
          <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">AXIS</span>
          <p className="text-ink-4 font-[family-name:var(--font-mono)]">{p.axis !== null ? `${p.axis}°` : "—"}</p>
        </div>
        <div>
          <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">ADD</span>
          <p className="text-ink-4 font-[family-name:var(--font-mono)]">{p.add_power !== null ? fmtNum(p.add_power) : "—"}</p>
        </div>
        <div>
          <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">PD</span>
          <p className="text-ink-4 font-[family-name:var(--font-mono)]">{p.pupillary_distance !== null ? `${p.pupillary_distance}mm` : "—"}</p>
        </div>
        {p.is_contact_lens && (
          <>
            <div>
              <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">BC</span>
              <p className="text-ink-4 font-[family-name:var(--font-mono)]">{p.base_curve ?? "—"}</p>
            </div>
            <div>
              <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">DIA</span>
              <p className="text-ink-4 font-[family-name:var(--font-mono)]">{p.diameter ? `${p.diameter}mm` : "—"}</p>
            </div>
            {p.brand && (
              <div className="col-span-2">
                <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">BRAND</span>
                <p className="text-ink-4 font-[family-name:var(--font-display)]">{p.brand}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function VisionPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [prescribedAt, setPrescribedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [optician, setOptician] = useState("");
  const [isContactLens, setIsContactLens] = useState(false);
  const [leftSphere, setLeftSphere] = useState("");
  const [leftCylinder, setLeftCylinder] = useState("");
  const [leftAxis, setLeftAxis] = useState("");
  const [leftAdd, setLeftAdd] = useState("");
  const [leftPd, setLeftPd] = useState("");
  const [leftBc, setLeftBc] = useState("");
  const [leftDia, setLeftDia] = useState("");
  const [leftBrand, setLeftBrand] = useState("");
  const [rightSphere, setRightSphere] = useState("");
  const [rightCylinder, setRightCylinder] = useState("");
  const [rightAxis, setRightAxis] = useState("");
  const [rightAdd, setRightAdd] = useState("");
  const [rightPd, setRightPd] = useState("");
  const [rightBc, setRightBc] = useState("");
  const [rightDia, setRightDia] = useState("");
  const [rightBrand, setRightBrand] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/health/eye-prescription");
      const data = await res.json();
      setPrescriptions(data.prescriptions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pairs = useMemo(() => groupPairs(prescriptions), [prescriptions]);
  const glassesPairs = pairs.filter((p) => !p.is_contact_lens);
  const contactPairs = pairs.filter((p) => p.is_contact_lens);
  const latestGlasses = glassesPairs[0] ?? null;
  const latestContacts = contactPairs[0] ?? null;

  function resetForm() {
    setPrescribedAt(new Date().toISOString().slice(0, 10));
    setOptician("");
    setIsContactLens(false);
    setLeftSphere(""); setLeftCylinder(""); setLeftAxis(""); setLeftAdd(""); setLeftPd("");
    setLeftBc(""); setLeftDia(""); setLeftBrand("");
    setRightSphere(""); setRightCylinder(""); setRightAxis(""); setRightAdd(""); setRightPd("");
    setRightBc(""); setRightDia(""); setRightBrand("");
    setFormNotes("");
  }

  async function handleScan(file: File) {
    setScanning(true);
    setScanError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/health/eye-prescription/parse", {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setScanError("Couldn't read prescription — please enter manually");
        resetForm();
        setShowModal(true);
        return;
      }
      const p = j.prescription;
      const s = (v: unknown) => (v !== null && v !== undefined ? String(v) : "");
      if (p.prescribed_at) setPrescribedAt(p.prescribed_at);
      if (p.optician) setOptician(p.optician);
      setIsContactLens(!!p.is_contact_lens);
      if (p.left_eye) {
        setLeftSphere(s(p.left_eye.sphere));
        setLeftCylinder(s(p.left_eye.cylinder));
        setLeftAxis(s(p.left_eye.axis));
        setLeftAdd(s(p.left_eye.add_power));
        setLeftPd(s(p.left_eye.pupillary_distance));
        setLeftBc(s(p.left_eye.base_curve));
        setLeftDia(s(p.left_eye.diameter));
        setLeftBrand(s(p.left_eye.brand));
      }
      if (p.right_eye) {
        setRightSphere(s(p.right_eye.sphere));
        setRightCylinder(s(p.right_eye.cylinder));
        setRightAxis(s(p.right_eye.axis));
        setRightAdd(s(p.right_eye.add_power));
        setRightPd(s(p.right_eye.pupillary_distance));
        setRightBc(s(p.right_eye.base_curve));
        setRightDia(s(p.right_eye.diameter));
        setRightBrand(s(p.right_eye.brand));
      }
      if (p.notes) setFormNotes(p.notes);
      setScanned(true);
      setShowModal(true);
    } catch {
      setScanError("Couldn't read prescription — please enter manually");
      resetForm();
      setShowModal(true);
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!prescribedAt) return;
    setSaving(true);
    try {
      const parseNum = (v: string) => v.trim() ? Number(v) : undefined;
      const parseInt_ = (v: string) => v.trim() ? parseInt(v, 10) : undefined;

      const eyes = [
        {
          prescribed_at: prescribedAt,
          optician: optician || undefined,
          eye: "left" as const,
          sphere: parseNum(leftSphere),
          cylinder: parseNum(leftCylinder),
          axis: parseInt_(leftAxis),
          add_power: parseNum(leftAdd),
          pupillary_distance: parseNum(leftPd),
          is_contact_lens: isContactLens,
          base_curve: isContactLens ? parseNum(leftBc) : undefined,
          diameter: isContactLens ? parseNum(leftDia) : undefined,
          brand: isContactLens ? leftBrand || undefined : undefined,
          notes: formNotes || undefined,
        },
        {
          prescribed_at: prescribedAt,
          optician: optician || undefined,
          eye: "right" as const,
          sphere: parseNum(rightSphere),
          cylinder: parseNum(rightCylinder),
          axis: parseInt_(rightAxis),
          add_power: parseNum(rightAdd),
          pupillary_distance: parseNum(rightPd),
          is_contact_lens: isContactLens,
          base_curve: isContactLens ? parseNum(rightBc) : undefined,
          diameter: isContactLens ? parseNum(rightDia) : undefined,
          brand: isContactLens ? rightBrand || undefined : undefined,
          notes: formNotes || undefined,
        },
      ];

      const res = await fetch("/api/health/eye-prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eyes }),
      });
      if (res.ok) {
        resetForm();
        setScanned(false);
        setScanError(null);
        setShowModal(false);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleHistory(key: string) {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const numInput = "w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3";

  if (loading) {
    return (
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">
        Loading…
      </p>
    );
  }

  function renderPairHistory(list: PrescriptionPair[], label: string) {
    if (list.length <= 1) return null;
    const history = list.slice(1);
    return (
      <div className="mt-6">
        <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-3">
          {label} HISTORY
        </p>
        <div className="flex flex-col gap-2">
          {history.map((pair) => {
            const key = `${pair.prescribed_at}_${pair.is_contact_lens}`;
            const expanded = expandedHistory.has(key);
            return (
              <div key={key} className="border border-ink-2 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleHistory(key)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink-1/50 transition-colors"
                >
                  <span className="text-sm text-ink-4 font-[family-name:var(--font-display)]">
                    {formatDate(pair.prescribed_at)}
                    {pair.optician && <span className="text-ink-3 ml-2">— {pair.optician}</span>}
                  </span>
                  <span className="text-ink-3 text-xs">{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 flex gap-3">
                    <EyeCard label="LEFT EYE (OS)" p={pair.left} />
                    <EyeCard label="RIGHT EYE (OD)" p={pair.right} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic">
          Vision
        </h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleScan(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="px-3 py-1.5 rounded-md bg-ok/15 border border-ok/40 text-ok text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-ok/25 disabled:opacity-40 transition-colors"
          >
            {scanning ? "READING…" : "SCAN PRESCRIPTION"}
          </button>
          <button
            onClick={() => { resetForm(); setScanned(false); setScanError(null); setShowModal(true); }}
            className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors"
          >
            ADD PRESCRIPTION
          </button>
        </div>
      </div>

      {prescriptions.length === 0 ? (
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
          No prescriptions recorded yet.
        </p>
      ) : (
        <>
          {/* Latest glasses */}
          {latestGlasses && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">
                  LATEST GLASSES — {formatDate(latestGlasses.prescribed_at).toUpperCase()}
                </p>
                {latestGlasses.optician && (
                  <p className="text-xs text-ink-3 font-[family-name:var(--font-display)] italic">
                    {latestGlasses.optician}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <EyeCard label="LEFT EYE (OS)" p={latestGlasses.left} />
                <EyeCard label="RIGHT EYE (OD)" p={latestGlasses.right} />
              </div>
              {latestGlasses.notes && (
                <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-2">
                  {latestGlasses.notes}
                </p>
              )}
            </div>
          )}

          {/* Latest contacts */}
          {latestContacts && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">
                  LATEST CONTACT LENSES — {formatDate(latestContacts.prescribed_at).toUpperCase()}
                </p>
                {latestContacts.optician && (
                  <p className="text-xs text-ink-3 font-[family-name:var(--font-display)] italic">
                    {latestContacts.optician}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <EyeCard label="LEFT EYE (OS)" p={latestContacts.left} />
                <EyeCard label="RIGHT EYE (OD)" p={latestContacts.right} />
              </div>
              {latestContacts.notes && (
                <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-2">
                  {latestContacts.notes}
                </p>
              )}
            </div>
          )}

          {/* History */}
          {renderPairHistory(glassesPairs, "GLASSES")}
          {renderPairHistory(contactPairs, "CONTACT LENS")}
        </>
      )}

      {/* Add prescription modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic">
                Add Prescription
              </h2>
              {scanned && (
                <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-ok/15 text-ok border border-ok/30 font-[family-name:var(--font-mono)]">
                  Scanned
                </span>
              )}
            </div>
            {scanError && (
              <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-warn font-[family-name:var(--font-mono)] mb-4">
                {scanError}
              </div>
            )}

            {/* Date + Optician */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-1">DATE</p>
                <input type="date" value={prescribedAt} onChange={(e) => setPrescribedAt(e.target.value)} className={numInput} />
              </div>
              <div>
                <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-1">OPTICIAN</p>
                <input value={optician} onChange={(e) => setOptician(e.target.value)} className={numInput} placeholder="e.g. Specsavers" />
              </div>
            </div>

            {/* Type toggle */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">TYPE</p>
            <div className="flex gap-1 mb-4">
              <button
                onClick={() => setIsContactLens(false)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] border transition-colors ${
                  !isContactLens ? "border-accent bg-accent/10 text-accent" : "border-ink-2 text-ink-3 hover:border-ink-3"
                }`}
              >
                Glasses
              </button>
              <button
                onClick={() => setIsContactLens(true)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] border transition-colors ${
                  isContactLens ? "border-accent bg-accent/10 text-accent" : "border-ink-2 text-ink-3 hover:border-ink-3"
                }`}
              >
                Contact Lenses
              </button>
            </div>

            {/* Left + Right side by side */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Left eye */}
              <div>
                <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">LEFT EYE (OS)</p>
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Sphere</label>
                    <input value={leftSphere} onChange={(e) => setLeftSphere(e.target.value)} className={numInput} placeholder="-2.50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Cylinder</label>
                    <input value={leftCylinder} onChange={(e) => setLeftCylinder(e.target.value)} className={numInput} placeholder="-0.75" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Axis</label>
                    <input value={leftAxis} onChange={(e) => setLeftAxis(e.target.value)} className={numInput} placeholder="180" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Add power</label>
                    <input value={leftAdd} onChange={(e) => setLeftAdd(e.target.value)} className={numInput} placeholder="+1.00" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">PD</label>
                    <input value={leftPd} onChange={(e) => setLeftPd(e.target.value)} className={numInput} placeholder="31.5" />
                  </div>
                  {isContactLens && (
                    <>
                      <div>
                        <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Base curve</label>
                        <input value={leftBc} onChange={(e) => setLeftBc(e.target.value)} className={numInput} placeholder="8.6" />
                      </div>
                      <div>
                        <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Diameter</label>
                        <input value={leftDia} onChange={(e) => setLeftDia(e.target.value)} className={numInput} placeholder="14.2" />
                      </div>
                      <div>
                        <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Brand</label>
                        <input value={leftBrand} onChange={(e) => setLeftBrand(e.target.value)} className={numInput} placeholder="Acuvue Oasys" />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right eye */}
              <div>
                <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">RIGHT EYE (OD)</p>
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Sphere</label>
                    <input value={rightSphere} onChange={(e) => setRightSphere(e.target.value)} className={numInput} placeholder="-2.50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Cylinder</label>
                    <input value={rightCylinder} onChange={(e) => setRightCylinder(e.target.value)} className={numInput} placeholder="-0.75" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Axis</label>
                    <input value={rightAxis} onChange={(e) => setRightAxis(e.target.value)} className={numInput} placeholder="180" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Add power</label>
                    <input value={rightAdd} onChange={(e) => setRightAdd(e.target.value)} className={numInput} placeholder="+1.00" />
                  </div>
                  <div>
                    <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">PD</label>
                    <input value={rightPd} onChange={(e) => setRightPd(e.target.value)} className={numInput} placeholder="31.5" />
                  </div>
                  {isContactLens && (
                    <>
                      <div>
                        <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Base curve</label>
                        <input value={rightBc} onChange={(e) => setRightBc(e.target.value)} className={numInput} placeholder="8.6" />
                      </div>
                      <div>
                        <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Diameter</label>
                        <input value={rightDia} onChange={(e) => setRightDia(e.target.value)} className={numInput} placeholder="14.2" />
                      </div>
                      <div>
                        <label className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">Brand</label>
                        <input value={rightBrand} onChange={(e) => setRightBrand(e.target.value)} className={numInput} placeholder="Acuvue Oasys" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-1">NOTES</p>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3 resize-y mb-4"
              placeholder="Any additional notes…"
            />

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { resetForm(); setScanned(false); setScanError(null); setShowModal(false); }}
                className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !prescribedAt}
                className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
