interface CostPillProps {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function CostPill({ inputTokens, outputTokens, costUsd }: CostPillProps) {
  const totalTokens = inputTokens + outputTokens;
  const formattedCost = `$${costUsd.toFixed(2)}`;

  return (
    <span
      className="cost-pill relative inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 cursor-default select-none"
      aria-label={`Pipeline cost: ${formattedCost}, ${formatTokens(totalTokens)} tokens`}
      role="status"
    >
      <span className="text-stone-700" style={{ fontSize: 13 }}>
        {formattedCost}
      </span>

      <span
        className="cost-pill-tooltip pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-stone-200 bg-white px-3 py-2 opacity-0 shadow-sm transition-opacity"
        style={{ fontSize: 13 }}
        role="tooltip"
      >
        <span className="flex flex-col gap-1">
          <span className="flex justify-between gap-4">
            <span className="text-stone-500">Input</span>
            <span className="text-stone-800 font-medium">{formatTokens(inputTokens)}</span>
          </span>
          <span className="flex justify-between gap-4">
            <span className="text-stone-500">Output</span>
            <span className="text-stone-800 font-medium">{formatTokens(outputTokens)}</span>
          </span>
          <span className="mt-1 border-t border-stone-200 pt-1 flex justify-between gap-4">
            <span className="text-stone-500">Cost</span>
            <span className="text-stone-800 font-medium">{formattedCost}</span>
          </span>
        </span>
      </span>

      <style>{`
        .cost-pill:hover .cost-pill-tooltip,
        .cost-pill:focus-within .cost-pill-tooltip {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
    </span>
  );
}
