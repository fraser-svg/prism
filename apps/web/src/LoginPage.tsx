import { useState } from "react";
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

  return (
    <div className="flex h-full items-center justify-center bg-[#f4edd9]">
      <div className="mx-4 w-full max-w-sm">
        {/* Login card */}
        <div className="rounded-xl border border-stone-200 bg-[var(--bg-surface)] p-8 shadow-sm">
          {/* Logo */}
          <div className="mb-8 text-center">
            <h1 className="text-[18px] font-semibold text-black">Prismatic</h1>
            <p className="mt-1 text-[15px] text-stone-900">
              Product engineering for operators
            </p>
          </div>

          {/* Social buttons */}
          <div className="mb-5 flex flex-col gap-2.5">
            <button
              disabled={busy}
              onClick={() => handleSocialLogin("google")}
              className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-stone-200 bg-[var(--bg-surface)] text-[15px] font-medium text-black transition-colors hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </button>

            <button
              disabled={busy}
              onClick={() => handleSocialLogin("github")}
              className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-stone-200 bg-stone-800 text-[15px] font-medium text-white transition-colors hover:bg-stone-700 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
              )}
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-200" />
            <span className="text-[14px] text-stone-700">or</span>
            <div className="h-px flex-1 bg-stone-200" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
            {isSignUp && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 text-[15px] text-black placeholder:text-stone-700 focus:border-stone-800 focus:outline-none"
              />
            )}

            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 text-[15px] text-black placeholder:text-stone-700 focus:border-stone-800 focus:outline-none"
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 pr-10 text-[15px] text-black placeholder:text-stone-700 focus:border-stone-800 focus:outline-none"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-700 hover:text-stone-800"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>

            {error && (
              <p className="text-[15px] text-red-500" role="alert">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-lg bg-stone-800 text-[15px] font-medium text-white transition-colors hover:bg-stone-700 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? (
                <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : isSignUp ? (
                "Sign up"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Toggle */}
          <p className="mt-5 text-center text-[15px] text-stone-900">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              className="bg-transparent text-[15px] font-medium text-black hover:underline"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
