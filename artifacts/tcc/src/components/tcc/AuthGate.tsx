import { useState, useEffect, type ReactNode } from "react";
import { setAuthToken, hasAuthToken, post } from "@/lib/api";
import { C, F, FS } from "./constants";

interface Props {
  children: ReactNode;
}

export function AuthGate({ children }: Props) {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasAuthToken()) {
      // Verify existing token is still valid
      post<{ ok: boolean }>("/auth/verify", { token: sessionStorage.getItem("tcc_auth_token") })
        .then(r => { if (r.ok) setAuthed(true); else { setAuthed(false); } })
        .catch(() => setAuthed(false))
        .finally(() => setChecked(true));
    } else {
      setChecked(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      setAuthToken(token.trim());
      const r = await post<{ ok: boolean; unprotected?: boolean }>("/auth/verify", { token: token.trim() });
      if (r.ok) {
        setAuthed(true);
      } else {
        setError("Invalid token");
      }
    } catch {
      setError("Invalid token");
    } finally {
      setLoading(false);
    }
  };

  if (!checked) {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.mut, fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (authed) return <>{children}</>;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, textAlign: "center" }}>
        <img src="/flipiq-logo.png" alt="FlipIQ" style={{ height: 120, width: "auto", marginBottom: 20, display: "block", margin: "0 auto 20px" }} />
        <div style={{ fontFamily: FS, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>COO Dashboard</div>
        <div style={{ color: C.mut, fontSize: 13, marginBottom: 32 }}>FlipIQ Operations</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Access token"
            value={token}
            onChange={e => setToken(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              background: C.card,
              border: `1px solid ${error ? "#e74c3c" : C.brd}`,
              borderRadius: 8,
              padding: "12px 14px",
              fontSize: 15,
              color: C.tx,
              fontFamily: F,
              boxSizing: "border-box",
              marginBottom: 8,
              outline: "none",
            }}
          />
          {error && <div style={{ color: "#e74c3c", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            style={{
              width: "100%",
              background: "#F97316",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "12px",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading || !token.trim() ? 0.6 : 1,
              fontFamily: F,
            }}
          >
            {loading ? "Verifying..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
