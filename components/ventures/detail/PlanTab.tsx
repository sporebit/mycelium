"use client";

import { EditableField } from "./EditableField";
import type { Venture } from "@/lib/ventures/types";

export function PlanTab({
  venture,
  onPatch,
}: {
  venture: Venture;
  onPatch: (fields: Partial<Venture>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <EditableField
        label="MVP"
        value={venture.mvp}
        onSave={(v) => onPatch({ mvp: v })}
        multiline
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EditableField
          label="REVENUE MODEL"
          value={venture.revenue_model}
          onSave={(v) => onPatch({ revenue_model: v })}
          multiline
        />
        <EditableField
          label="PRICING NOTES"
          value={venture.pricing_notes}
          onSave={(v) => onPatch({ pricing_notes: v })}
          multiline
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <EditableField
          label="MONTHLY COST ESTIMATE (£)"
          value={venture.cost_estimate_monthly}
          onSave={(v) =>
            onPatch({
              cost_estimate_monthly: v ? Number(v) : null,
            } as Partial<Venture>)
          }
          type="number"
        />
        <EditableField
          label="SETUP COST ESTIMATE (£)"
          value={venture.cost_estimate_setup}
          onSave={(v) =>
            onPatch({
              cost_estimate_setup: v ? Number(v) : null,
            } as Partial<Venture>)
          }
          type="number"
        />
        <EditableField
          label="MONTHLY REVENUE PROJECTION (£)"
          value={venture.revenue_projection_monthly}
          onSave={(v) =>
            onPatch({
              revenue_projection_monthly: v ? Number(v) : null,
            } as Partial<Venture>)
          }
          type="number"
        />
      </div>
      <EditableField
        label="BRAND NOTES"
        value={venture.brand_notes}
        onSave={(v) => onPatch({ brand_notes: v })}
        multiline
      />
      <EditableField
        label="COMPETITORS"
        value={venture.competitors}
        onSave={(v) => onPatch({ competitors: v })}
        multiline
      />
    </div>
  );
}
