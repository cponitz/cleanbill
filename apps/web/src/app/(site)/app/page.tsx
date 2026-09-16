import { redirect } from "next/navigation";

// SPEC-07 §10 calls the portal `/app` (authenticated). There are no customer accounts yet (ADR 0017 "revisit when"):
// the claim code is the credential, so /app sends people to the code entry, which opens /claim/[code]/status.
export default function AppPage() {
  redirect("/claim");
}
