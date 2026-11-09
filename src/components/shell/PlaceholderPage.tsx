"use client";

import { useApi } from "@/lib/auth/use-api";
import type { Role } from "@/lib/auth/roles";
import { DataList } from "@/components/ui/DataList";
import { RoleGate } from "./RoleGate";

interface Props<T> {
  title: string;
  roles: Role[];
  path: string;
  /** Turns the API payload into list rows. */
  toItems: (data: T) => { id: string; primary: string; secondary?: string }[];
  listTitle: string;
}

function Body<T>({ title, path, toItems, listTitle }: Omit<Props<T>, "roles">) {
  const { data, error, loading } = useApi<T>(path);
  return (
    <div>
      <h1 className="text-[28px] font-bold leading-tight text-ink">{title}</h1>
      {loading && <p role="status" className="mt-2 text-muted">Loading…</p>}
      {error && <p role="alert" className="mt-2 text-blocked">{error}</p>}
      {data && <DataList title={listTitle} items={toItems(data)} />}
    </div>
  );
}

export function PlaceholderPage<T>({ roles, ...rest }: Props<T>) {
  return (
    <RoleGate roles={roles}>
      <Body {...rest} />
    </RoleGate>
  );
}
