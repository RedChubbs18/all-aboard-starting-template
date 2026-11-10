import { AccessibilitySettings } from "@/components/shell/AccessibilitySettings";

export const metadata = { title: "Accessibility and display" };

/** Open to signed-in and signed-out visitors: preferences live on the device, not in the account. */
export default function Page() {
  return <AccessibilitySettings />;
}
