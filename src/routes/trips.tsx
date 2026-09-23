import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/roadsense/shared";
import { LiveTripStatus } from "@/components/roadsense/live-trip-status";
import { TripHistory } from "@/components/roadsense/trip-history";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "Trips & Tracking — Beacon" },
      {
        name: "description",
        content: "Automatic bus trip detection, live journey tracking, and history.",
      },
      { property: "og:title", content: "Trips & Tracking — Beacon" },
      {
        property: "og:description",
        content: "Zero-touch trip detection and corridor sensing history.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TripsPage,
});

function TripsPage() {
  return (
    <>
      <PageTitle
        title="Trips & Journey Detection"
        subtitle="Automatic zero-touch trip detection, continuous corridor tracking, and historical journeys."
      />
      <LiveTripStatus />
      <TripHistory />
    </>
  );
}
