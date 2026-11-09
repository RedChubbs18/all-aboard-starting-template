export const CONTENT_TYPE_LABEL: Record<string, string> = {
  POLICY: "Policy",
  BENEFIT: "Benefit",
  DEVICE_INFO: "Device",
  WORKSPACE_INFO: "Workspace",
  CONTRACT_RECAP: "Contract",
  GUIDE: "Guide",
  FLOOR_PLAN: "Floor plan",
  VIDEO: "Video",
};

/** Groups on the /content index, in display order. */
export const CONTENT_GROUPS: { title: string; types: string[] }[] = [
  { title: "Policies and benefits", types: ["POLICY", "BENEFIT"] },
  { title: "Your contract", types: ["CONTRACT_RECAP"] },
  { title: "Devices and workspace", types: ["DEVICE_INFO", "WORKSPACE_INFO", "FLOOR_PLAN"] },
  { title: "Guides", types: ["GUIDE"] },
  { title: "Videos", types: ["VIDEO"] },
];
