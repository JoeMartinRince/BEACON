import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Navigation, Play, LocateFixed } from "lucide-react";
import { useTrip } from "@/lib/trip-context";

interface ManualTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualTripDialog({ open, onOpenChange }: ManualTripDialogProps) {
  const { startManualTrip } = useTrip();
  const [origin, setOrigin] = useState("Kakkanad (Current GPS Location)");
  const [destination, setDestination] = useState("");
  const [useCurrentGps, setUseCurrentGps] = useState(true);

  const handleStart = (withDest: boolean) => {
    const finalOrigin = useCurrentGps ? "Kakkanad" : origin;
    const finalDest = withDest ? destination : undefined;
    startManualTrip(finalOrigin, finalDest);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-card text-card-foreground border-border">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
            <DialogTitle className="text-base font-bold">Start Trip Manually</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Manual trip creation fallback when automatic sensor detection is unavailable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Starting Location</span>
              <button
                type="button"
                onClick={() => {
                  setUseCurrentGps(true);
                  setOrigin("Kakkanad (Current GPS Location)");
                }}
                className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
              >
                <LocateFixed className="w-3 h-3" /> Use Current GPS
              </button>
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={origin}
                onChange={(e) => {
                  setUseCurrentGps(false);
                  setOrigin(e.target.value);
                }}
                placeholder="e.g. Kakkanad, Ernakulam"
                className="pl-9 text-xs h-9 bg-background"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Destination (Optional)</span>
              <span className="text-[10px] text-muted-foreground">Auto-detected if left blank</span>
            </Label>
            <div className="relative">
              <Navigation className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Aluva, Fort Kochi"
                className="pl-9 text-xs h-9 bg-background"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleStart(false)}
            className="flex-1 text-xs h-9"
          >
            Start Without Destination
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => handleStart(true)}
            className="flex-1 text-xs h-9 gap-1.5 bg-primary text-primary-foreground font-semibold"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Start Trip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
