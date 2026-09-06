// /pager is gone — the inbox moved onto /status (T-status-rework-03), because
// alerts and health were two routes and neither answered "is anything wrong"
// on its own.
//
// This redirect stays rather than the route simply disappearing: POST
// /api/notify still stamps `/pager` as the default deep link for the alerts,
// nightly, weekly and system streams, and 214 already-stored notifications
// carry that path. Deleting the route would turn every one of those taps into
// a 404, and changing the default would mean editing the notify route test the
// spec explicitly says to leave untouched.
import { redirect } from "next/navigation";

export default function PagerRedirect() {
  redirect("/status");
}
