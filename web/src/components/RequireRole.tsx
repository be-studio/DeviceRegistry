import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth, type Viewer } from "../auth/AuthProvider";

// Convenience only: it hides screens the user cannot use. The server enforces access
export function RequireRole({
  role,
  children
}: {
  role: Viewer["role"];
  children: ReactNode;
}) {
  const { viewer, loading } = useAuth();

  if (loading) return <p>Loading…</p>;
  if (!viewer) return <Navigate to="/login" replace />;
  if (viewer.role !== role) {
    return (
      <p className="error">This page is not available for your account.</p>
    );
  }
  return children;
}
