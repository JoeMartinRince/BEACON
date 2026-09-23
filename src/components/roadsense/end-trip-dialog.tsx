import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTrip } from "@/lib/trip-context";

interface EndTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EndTripDialog({ open, onOpenChange }: EndTripDialogProps) {
  const { currentTrip, endManualTrip } = useTrip();

  if (!currentTrip) return null;

  const origin = currentTrip.start_location_name || "Starting Point";
  const destination =
    currentTrip.destination_location_name ||
    currentTrip.current_location_name ||
    "Current Location";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[420px] bg-card text-card-foreground border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-bold">End this trip?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            This will immediately finalize sensing observations and record the summary for this
            trip.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-2 p-3 rounded-lg bg-muted text-xs space-y-1.5 border border-border/60">
          <p className="text-muted-foreground text-[11px] font-medium">Current Trip</p>
          <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
            <span>{origin}</span>
            <span className="text-primary font-normal">→</span>
            <span>{destination}</span>
          </p>
          <div className="flex gap-4 pt-1 text-[11px] text-muted-foreground">
            <span>
              Distance: <b className="text-foreground">{currentTrip.distance_km} km</b>
            </span>
            <span>
              Duration:{" "}
              <b className="text-foreground">{Math.floor(currentTrip.duration_seconds / 60)} min</b>
            </span>
            <span>
              Events: <b className="text-foreground">{currentTrip.event_count}</b>
            </span>
          </div>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel className="text-xs h-9">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              endManualTrip();
              onOpenChange(false);
            }}
            className="text-xs h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            End Trip
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
