type PrismaticLogoTheme = "light" | "dark" | "auto";
type PrismaticLogoVariant = "mark" | "lockup";

interface PrismaticLogoProps {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  theme?: PrismaticLogoTheme;
  variant?: PrismaticLogoVariant;
  title?: string;
}

function getTone(theme: PrismaticLogoTheme) {
  if (theme === "light") {
    return {
      markBackground: "#f5f1e6",
      markForeground: "#121212",
      wordmark: "#121212",
    };
  }

  return {
    markBackground: "#f5f1e6",
    markForeground: "#121212",
    wordmark: theme === "dark" ? "#f5f1e6" : "currentColor",
  };
}

function Mark({
  className,
  theme,
}: {
  className?: string;
  theme: PrismaticLogoTheme;
}) {
  const tone = getTone(theme);

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <rect width="64" height="64" rx="14" fill={tone.markBackground} />
      <rect
        x="32"
        y="14"
        width="26"
        height="26"
        rx="4"
        transform="rotate(45 32 14)"
        fill={tone.markForeground}
      />
      <rect
        x="32"
        y="24"
        width="12"
        height="12"
        rx="1.5"
        transform="rotate(45 32 24)"
        fill={tone.markBackground}
      />
    </svg>
  );
}

export function PrismaticLogo({
  className,
  markClassName,
  textClassName,
  theme = "auto",
  variant = "lockup",
  title = "Prismatic",
}: PrismaticLogoProps) {
  const tone = getTone(theme);
  const showWordmark = variant === "lockup";

  return (
    <span
      className={className}
      aria-label={title}
      role="img"
    >
      <Mark className={markClassName} theme={theme} />
      {showWordmark ? (
        <svg
          viewBox="0 0 248 44"
          aria-hidden="true"
          className={textClassName}
          fill="none"
        >
          <text
            x="0"
            y="31"
            fill={tone.wordmark}
            fontFamily="Lexend, -apple-system, BlinkMacSystemFont, sans-serif"
            fontSize="32"
            fontWeight="500"
            letterSpacing="-1.6"
          >
            Prismatic
          </text>
        </svg>
      ) : null}
    </span>
  );
}
