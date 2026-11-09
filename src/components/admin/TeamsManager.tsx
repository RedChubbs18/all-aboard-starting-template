"use client";

import { useState } from "react";
import { useApi } from "@/lib/auth/use-api";
import { useSession } from "@/lib/auth/client";
import { ROLES } from "@/domain/types";
import { Alert, Drawer, Field, btnCls, inputCls, useNotice, useSend, type Fields } from "./common";

interface Team { id: string; name: string; area: string | null; lmId: string | null; lmName: string | null; memberCount: number }
interface Person { id: string; displayName: string; upn: string; roles: string[]; teamId: string | null; teamName: string | null; reportsToId: string | null; buddyEligible: boolean; jobTitle: string | null }

/** FR-AD.3. Only roles, team, reporting line and buddy eligibility are editable (no personal data). */
export function TeamsManager() {
  const teams = useApi<Team[]>("/api/admin/teams");
  const people = useApi<Person[]>("/api/admin/users");
  const { user: me } = useSession();
  const send = useSend();
  const n = useNotice();
  const [p, setP] = useState<Person | null>(null);
  const [t, setT] = useState<Team | null>(null);
  const [errors, setErrors] = useState<Fields>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const lms = (people.data ?? []).filter((x) => x.roles.includes("LM"));

  async function savePerson(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setBusy(true);
    const r = await send("PUT", `/api/admin/users/${p.id}`, { roles: p.roles, teamId: p.teamId, reportsToId: p.reportsToId, buddyEligible: p.buddyEligible });
    setBusy(false);
    if (r.ok) {
      n.success(`${p.displayName} updated.`);
      setP(null);
      people.reload();
      teams.reload();
    } else {
      setErrors(r.fields);
      setMsg(r.message);
    }
  }
  async function saveTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!t) return;
    setBusy(true);
    const r = await send("PUT", `/api/admin/teams/${t.id}`, { area: t.area, lmId: t.lmId });
    setBusy(false);
    if (r.ok) {
      n.success(`${t.name} updated.`);
      setT(null);
      teams.reload();
    } else {
      setErrors(r.fields);
      setMsg(r.message);
    }
  }

  return (
    <div className="space-y-6">
      {n.notice}
      {(teams.error || people.error) && <Alert kind="danger">{teams.error ?? people.error}</Alert>}
      <section aria-labelledby="teams-h" className="rounded-lg bg-card p-4 border border-line">
        <h2 id="teams-h" className="text-lg font-bold">Teams</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Teams with business area and line manager</caption>
            <thead><tr className="border-b border-line"><th scope="col" className="py-2 pr-3">Team</th><th scope="col" className="pr-3">Business area</th><th scope="col" className="pr-3">Line manager</th><th scope="col" className="pr-3">Members</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {(teams.data ?? []).map((x) => (
                <tr key={x.id} className="border-b border-line">
                  <th scope="row" className="py-2 pr-3 font-medium">{x.name}</th>
                  <td className="pr-3">{x.area ?? "Not set"}</td>
                  <td className="pr-3">{x.lmName ?? "Not set"}</td>
                  <td className="pr-3">{x.memberCount}</td>
                  <td><button type="button" className={btnCls.secondary} onClick={() => { setT(x); setErrors({}); setMsg(""); }} aria-label={`Edit team ${x.name}`}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="people-h" className="rounded-lg bg-card p-4 border border-line">
        <h2 id="people-h" className="text-lg font-bold">People</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">People with roles, team and buddy eligibility</caption>
            <thead><tr className="border-b border-line"><th scope="col" className="py-2 pr-3">Name</th><th scope="col" className="pr-3">Roles</th><th scope="col" className="pr-3">Team</th><th scope="col" className="pr-3">Buddy eligible</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {(people.data ?? []).map((x) => (
                <tr key={x.id} className="border-b border-line">
                  <th scope="row" className="py-2 pr-3 font-medium">{x.displayName}<br /><span className="text-sm font-normal text-muted">{x.upn}</span></th>
                  <td className="pr-3">{x.roles.join(", ")}</td>
                  <td className="pr-3">{x.teamName ?? "None"}</td>
                  <td className="pr-3">{x.buddyEligible ? "Yes" : "No"}</td>
                  <td><button type="button" className={btnCls.secondary} onClick={() => { setP(x); setErrors({}); setMsg(""); }} aria-label={`Edit ${x.displayName}`}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Drawer title={p ? `Edit ${p.displayName}` : "Edit person"} open={!!p} onClose={() => setP(null)}>
        {p && (
          <form onSubmit={savePerson} className="space-y-3" noValidate>
            {msg && !Object.keys(errors).length && <Alert kind="danger">{msg}</Alert>}
            <fieldset className="rounded-md border-2 border-line p-3" aria-describedby="roles-err">
              <legend className="px-1 font-medium">Roles</legend>
              {ROLES.map((r) => {
                const lockedSelfAdmin = r === "ADMIN" && p.id === me?.id;
                return (
                  <label key={r} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={p.roles.includes(r)}
                      disabled={lockedSelfAdmin}
                      onChange={(e) => setP({ ...p, roles: e.target.checked ? [...p.roles, r] : p.roles.filter((x) => x !== r) })}
                    />
                    {r}
                    {lockedSelfAdmin && <span className="text-sm text-muted">(you cannot remove your own Admin role)</span>}
                  </label>
                );
              })}
              {errors.roles && <p id="roles-err" className="text-sm font-medium text-blocked">Error: {errors.roles}</p>}
            </fieldset>
            <Field label="Team" error={errors.teamId}>
              {(f) => (
                <select {...f} className={inputCls} value={p.teamId ?? ""} onChange={(e) => setP({ ...p, teamId: e.target.value || null })}>
                  <option value="">No team</option>
                  {(teams.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Reports to (line manager)" error={errors.reportsToId}>
              {(f) => (
                <select {...f} className={inputCls} value={p.reportsToId ?? ""} onChange={(e) => setP({ ...p, reportsToId: e.target.value || null })}>
                  <option value="">Nobody</option>
                  {lms.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}
                </select>
              )}
            </Field>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={p.buddyEligible} onChange={(e) => setP({ ...p, buddyEligible: e.target.checked })} />
              Buddy eligible
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnCls.secondary} onClick={() => setP(null)}>Cancel</button>
              <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Save person</button>
            </div>
          </form>
        )}
      </Drawer>

      <Drawer title={t ? `Edit ${t.name}` : "Edit team"} open={!!t} onClose={() => setT(null)}>
        {t && (
          <form onSubmit={saveTeam} className="space-y-3" noValidate>
            {msg && !Object.keys(errors).length && <Alert kind="danger">{msg}</Alert>}
            <Field label="Business area" error={errors.area}>
              {(f) => <input {...f} className={inputCls} value={t.area ?? ""} onChange={(e) => setT({ ...t, area: e.target.value || null })} />}
            </Field>
            <Field label="Line manager" error={errors.lmId}>
              {(f) => (
                <select {...f} className={inputCls} value={t.lmId ?? ""} onChange={(e) => setT({ ...t, lmId: e.target.value || null })}>
                  <option value="">Not set</option>
                  {lms.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}
                </select>
              )}
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnCls.secondary} onClick={() => setT(null)}>Cancel</button>
              <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Save team</button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
