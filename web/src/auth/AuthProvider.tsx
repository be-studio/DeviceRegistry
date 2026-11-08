import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import { graphql } from "../api/graphql";

export interface Viewer {
  email: string;
  role: "ADMIN" | "MANUFACTURER";
  manufacturerName: string | null;
}

interface AuthState {
  viewer: Viewer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Viewer>;
  logout: () => Promise<void>;
}

const VIEWER_FIELDS = "email role manufacturerName";
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    graphql<{ me: Viewer | null }>(`{ me { ${VIEWER_FIELDS} } }`)
      .then((data) => setViewer(data.me))
      .catch(() => setViewer(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await graphql<{ login: Viewer }>(
      `mutation ($email: String!, $password: String!) {
        login(email: $email, password: $password) { ${VIEWER_FIELDS} }
      }`,
      { email, password }
    );
    setViewer(data.login);
    return data.login;
  }

  async function logout() {
    await graphql("mutation { logout }");
    setViewer(null);
  }

  return (
    <AuthContext value={{ viewer, loading, login, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}
