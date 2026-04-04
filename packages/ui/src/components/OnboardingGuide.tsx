import { Button, Card, CardContent, ProgressBar } from "@heroui/react";

interface OnboardingGuideProps {
  hasClients: boolean;
  hasProjects: boolean;
  onCreateClient: () => void;
  onCreateProject: () => void;
}

function StepCircle({
  step,
  done,
}: {
  step: number;
  done: boolean;
}) {
  return (
    <div
      aria-label={`Step ${step} of 2`}
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 600,
        background: done ? "var(--accent-green)" : "var(--accent-blue)",
        color: done ? "var(--text-inverse)" : "#fff",
        flexShrink: 0,
      }}
    >
      {done ? "\u2713" : step}
    </div>
  );
}

export function OnboardingGuide({
  hasClients,
  hasProjects,
  onCreateClient,
  onCreateProject,
}: OnboardingGuideProps) {
  const completedSteps = (hasClients ? 1 : 0) + (hasProjects ? 1 : 0);

  return (
    <div className="fade-in flex h-[60%] flex-col items-center justify-center gap-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Welcome to Prismatic
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Set up your workspace in two steps
        </p>
      </div>

      <div className="w-full max-w-[480px]">
        <ProgressBar
          aria-label="Setup progress"
          value={(completedSteps / 2) * 100}
          color="primary"
          size="sm"
          className="mb-6"
        />
      </div>

      <div className="flex w-full max-w-[560px] flex-col gap-4 sm:flex-row">
        {/* Step 1: Add a Client */}
        <Card
          className="flex-1"
          style={{
            opacity: hasClients ? 0.5 : 1,
            border: !hasClients ? "1px solid var(--accent-blue)" : "1px solid var(--border-default)",
          }}
        >
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <StepCircle step={1} done={hasClients} />
              <span className="text-sm font-semibold text-[var(--foreground)]">
                Add a Client
              </span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Who are you building for? Adding a client helps organize your
              projects and context.
            </p>
            {!hasClients && (
              <Button
                size="sm"
                variant="primary"
                onPress={onCreateClient}
                className="mt-1 self-start"
              >
                Add Client
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Create a Project */}
        <Card
          className="flex-1"
          style={{
            opacity: hasProjects ? 0.5 : 1,
            border: !hasProjects ? "1px solid var(--accent-blue)" : "1px solid var(--border-default)",
          }}
        >
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <StepCircle step={2} done={hasProjects} />
              <span className="text-sm font-semibold text-[var(--foreground)]">
                Create a Project
              </span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Link or start a new project. This is where Prismatic tracks your
              pipeline and progress.
            </p>
            {!hasProjects && (
              <Button
                size="sm"
                variant="primary"
                onPress={onCreateProject}
                className="mt-1 self-start"
              >
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
