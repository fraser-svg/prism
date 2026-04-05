import React from "react";

interface ReviewItem {
  type: string;
  verdict: "pass" | "hold" | "fail" | "not_applicable" | "pending";
  findings?: string;
}

interface VerificationPanelProps {
  checksTotal: number;
  checksPassed: number;
  reviews: ReviewItem[];
  releaseDecision: "pending" | "ready" | "hold" | "shipped";
}

const VERDICT_CONFIG: Record<
  ReviewItem["verdict"],
  { bg: string; text: string; icon: string; label: string }
> = {
  pass: { bg: "bg-emerald-500", text: "text-emerald-600", icon: "check", label: "Pass" },
  hold: { bg: "bg-amber-500", text: "text-amber-600", icon: "pause", label: "Hold" },
  fail: { bg: "bg-red-500", text: "text-red-500", icon: "close", label: "Fail" },
  pending: { bg: "bg-stone-300", text: "text-stone-500", icon: "hourglass_empty", label: "Awaiting" },
  not_applicable: { bg: "bg-stone-200", text: "text-stone-400", icon: "skip_next", label: "N/A" },
};

const RELEASE_CHIP: Record<
  VerificationPanelProps["releaseDecision"],
  { bg: string; text: string; label: string }
> = {
  ready: { bg: "bg-emerald-50", text: "text-emerald-600", label: "Ready to Ship" },
  pending: { bg: "bg-amber-50", text: "text-amber-600", label: "Pending" },
  hold: { bg: "bg-red-50", text: "text-red-500", label: "Hold" },
  shipped: { bg: "bg-blue-50", text: "text-blue-600", label: "Shipped" },
};

export function VerificationPanel({
  checksTotal,
  checksPassed,
  reviews,
  releaseDecision,
}: VerificationPanelProps) {
  const checksFailed = checksTotal - checksPassed;
  const allPassed = checksFailed === 0 && checksTotal > 0;
  const releaseChip = RELEASE_CHIP[releaseDecision];
  const missingReviews = reviews.filter((r) => r.verdict === "pending");

  return (
    <div className="flex flex-col gap-5">
      {/* Checks summary */}
      <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-stone-800">Checks</h4>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium ${
              allPassed
                ? "bg-emerald-50 text-emerald-600"
                : "bg-amber-50 text-amber-600"
            }`}
          >
            {checksPassed}/{checksTotal} passed
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div
              className={`h-full rounded-full transition-all ${
                allPassed ? "bg-emerald-500" : "bg-amber-400"
              }`}
              style={{
                width: checksTotal > 0 ? `${(checksPassed / checksTotal) * 100}%` : "0%",
              }}
            />
          </div>
          {checksFailed > 0 && (
            <span className="flex items-center gap-1 text-[13px] text-red-500">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                error
              </span>
              {checksFailed} failed
            </span>
          )}
        </div>
      </div>

      {/* Review checklist */}
      <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5">
        <h4 className="mb-3 text-[15px] font-semibold text-stone-800">Review Checklist</h4>

        {missingReviews.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-600">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              warning
            </span>
            {missingReviews.length} review{missingReviews.length > 1 ? "s" : ""} pending
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {reviews.map((review) => {
            const config = VERDICT_CONFIG[review.verdict];
            const isMissing = review.verdict === "pending";

            return (
              <li
                key={review.type}
                className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
                  isMissing
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-stone-200 bg-white"
                }`}
              >
                {/* Verdict dot */}
                <span
                  className={`mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${config.bg}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] text-stone-800">{review.type}</span>
                    <span className={`flex items-center gap-1 text-[13px] font-medium ${config.text}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        {config.icon}
                      </span>
                      {config.label}
                    </span>
                  </div>
                  {review.findings && (
                    <p className="mt-1 text-[13px] leading-relaxed text-stone-700">
                      {review.findings}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Release decision */}
      <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5">
        <div className="flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-stone-800">Release Decision</h4>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium ${releaseChip.bg} ${releaseChip.text}`}
          >
            {releaseChip.label}
          </span>
        </div>
      </div>
    </div>
  );
}
