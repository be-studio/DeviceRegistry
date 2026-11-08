import { BrowserRouter, Link, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { RequireRole } from "./components/RequireRole";
import { DeviceLookupPage } from "./pages/DeviceLookupPage";
import { LoginPage } from "./pages/LoginPage";
import { TacLookupPage } from "./pages/TacLookupPage";
import { UploadPage } from "./pages/UploadPage";

function Nav() {
  const { viewer, logout } = useAuth();

  return (
    <nav>
      <Link to="/">TAC lookup</Link>
      {viewer?.role === "MANUFACTURER" && <Link to="/upload">Upload</Link>}
      {viewer?.role === "ADMIN" && <Link to="/devices">Device lookup</Link>}
      <span className="spacer" />
      {viewer ? (
        <>
          <span>{viewer.email}</span>
          <button onClick={logout}>Sign out</button>
        </>
      ) : (
        <Link to="/login">Sign in</Link>
      )}
    </nav>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<TacLookupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/upload"
              element={
                <RequireRole role="MANUFACTURER">
                  <UploadPage />
                </RequireRole>
              }
            />
            <Route
              path="/devices"
              element={
                <RequireRole role="ADMIN">
                  <DeviceLookupPage />
                </RequireRole>
              }
            />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
