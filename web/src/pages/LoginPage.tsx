import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { GraphQLRequestError } from "../api/graphql";
import { useAuth } from "../auth/AuthProvider";

export function LoginPage() {
  const { viewer, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (viewer) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(email, password);
      navigate(signedIn.role === "ADMIN" ? "/devices" : "/upload");
    } catch (err) {
      setError(
        err instanceof GraphQLRequestError && err.code === "UNAUTHENTICATED"
          ? "Incorrect email or password."
          : "Sign in failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </>
  );
}
