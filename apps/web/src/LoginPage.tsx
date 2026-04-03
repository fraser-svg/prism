import { useState } from "react";
import {
  Card,
  Button,
  TextField,
  Input,
  Label,
  Separator,
  Spinner,
} from "@heroui/react";
import { authClient } from "./auth-client";

export function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const busy = loading;

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          name: name || email.split("@")[0],
          email,
          password,
        });
        if (result.error) {
          setError(result.error.message || "Sign up failed");
        }
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
        });
        if (result.error) {
          setError(result.error.message || "Sign in failed");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: "google" | "github") {
    setError("");
    setLoading(true);
    try {
      await authClient.signIn.social({ provider });
    } catch {
      setError(`Failed to sign in with ${provider}`);
      setLoading(false);
    }
  }

  const EyeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {showPassword ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );

  const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );

  const GitHubIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );

  return (
    <div className="flex h-full items-center justify-center">
      <div className="mx-4 flex w-full max-w-md flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Prism</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Your build brain</p>
        </div>

        <Card className="w-full bg-[var(--surface)] p-6">
          <Card.Content className="flex flex-col gap-4">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              isDisabled={busy}
              onPress={() => handleSocialLogin("google")}
            >
              {busy ? <Spinner size="sm" /> : <GoogleIcon />}
              Sign in with Google
            </Button>

            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              isDisabled={busy}
              onPress={() => handleSocialLogin("github")}
            >
              {busy ? <Spinner size="sm" /> : <GitHubIcon />}
              Sign in with GitHub
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-[var(--muted)]">or</span>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
              {isSignUp && (
                <TextField name="name">
                  <Label>Name</Label>
                  <Input
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </TextField>
              )}

              <TextField name="email" type="email" isRequired>
                <Label>Email</Label>
                <Input
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </TextField>

              <TextField name="password" type={showPassword ? "text" : "password"} isRequired>
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent p-1 text-[var(--muted)]"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    <EyeIcon />
                  </button>
                </div>
              </TextField>

              {error && (
                <p className="text-sm text-[var(--danger)]" role="alert" aria-live="polite">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                isDisabled={busy}
              >
                {busy ? <Spinner size="sm" /> : isSignUp ? "Sign up" : "Sign in"}
              </Button>
            </form>

            <p className="text-center text-sm text-[var(--muted)]">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="cursor-pointer border-none bg-transparent text-sm text-[var(--accent)] underline"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError("");
                }}
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
