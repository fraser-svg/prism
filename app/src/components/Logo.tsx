export function Logo() {
  return (
    <div className="absolute top-5 left-7 z-20 flex items-center gap-2.5 pointer-events-none select-none">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="w-[18px] h-[18px]"
        style={{ color: "rgba(80, 65, 50, 0.4)" }}
      >
        <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
      </svg>
      <span
        className="text-[16px] font-semibold tracking-tight"
        style={{ color: "rgba(60, 48, 36, 0.45)" }}
      >
        Prism
      </span>
    </div>
  );
}
