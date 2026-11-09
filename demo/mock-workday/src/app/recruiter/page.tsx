"use client";

import { AuthProvider, useAuth } from "@/lib/msal";
import Console from "./console";

export default function RecruiterPage() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const auth = useAuth();
  if (auth.status === "loading") return <p role="status">Loading…</p>;
  if (auth.status === "error") {
    return (
      <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-900">
        Sign-in is not available: {auth.error}
      </div>
    );
  }
  if (auth.status === "unauthenticated") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Recruiter console</h1>
        <p className="mt-2 text-slate-600">Sign in with your Microsoft work account to create offers.</p>
        <button onClick={() => void auth.signIn()} className="mt-6 rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">
          Sign in with Microsoft
        </button>
      </div>
    );
  }
  return <Console />;
}
