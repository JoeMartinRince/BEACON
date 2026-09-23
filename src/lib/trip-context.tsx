import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_TRIP_SETTINGS,
  type GpsSpeedDiagnostics,
  type LiveTelemetry,
  type SensorAvailability,
  type Trip,
  type TripAffectedSegment,
  type TripDetectionMode,
  type TripDetectionState,
  type TripGPSPoint,
  type TripSettings,
} from "./trip-types";
import {
  calculateDistanceKm,
  formatDestinationLabel,
  reverseGeocodeLocation,
} from "./trip-geocoder";
import { useRoadData } from "./roadsense-data";
import {
  transitionTripState,
  calculateTripMetrics,
  initialTripMetrics,
  createStateMachineRefs,
  type TripStateMachineRefs,
} from "./trip-state-machine";
import {
  LiveSensorCollector,
  type MotionReading,
  type BatchObservation,
  type SegmentRef,
} from "./live-sensor-collector";
import type { FeatureReadinessReport } from "./live-feature-pipeline";
import { persistLiveObservations } from "./beacon-db";

interface TripContextType {
  state: TripDetectionState;
  currentTrip: Trip | null;
  tripHistory: Trip[];
  settings: TripSettings;
  isSimulating: boolean;
  isPaused: boolean;
  isWeakGps: boolean;
  gpsSpeedKmh: number | null;
  /** Live GPS and speed diagnostics for dev mode inspection */
  gpsDiagnostics: GpsSpeedDiagnostics | null;
  /** Live sensor availability (location, motion, online status) */
  sensorStatus: SensorAvailability;
  /** Number of observations queued in the offline buffer */
  queuedBufferCount: number;
  /** Real-time mobile sensor telemetry stream */
  telemetry: LiveTelemetry;
  /** 34-feature ML readiness report */
  featureReadiness: FeatureReadinessReport | null;
  startManualTrip: (origin?: string, destination?: string) => void;
  endManualTrip: () => void;
  simulateTrip: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  stopSimulation: () => void;
  resetSimulation: () => void;
  updateSettings: (newSettings: Partial<TripSettings>) => void;
  dismissCompletedTrip: () => void;
  clearHistory: () => void;
  /** Request iOS DeviceMotionEvent permission from a user gesture */
  requestMotionPermission: () => Promise<boolean>;
  selectTripForInspection: (trip: Trip | null) => void;
  inspectedTrip: Trip | null;
}

const TripContext = createContext<TripContextType | null>(null);

const INITIAL_TELEMETRY: LiveTelemetry = {
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  speedKmh: null,
  browserSpeedKmh: null,
  calculatedSpeedKmh: null,
  speedSource: "UNAVAILABLE",
  distanceMeters: 0,
  headingDegrees: null,
  altitudeMeters: null,
  gpsStatus: "WAITING",
  gpsPermission: "PROMPT",
  gpsSampleCount: 0,
  lastGpsUpdate: null,
  accelerometerAvailable: false,
  gyroscopeAvailable: false,
  accelerometer: null,
  gyroscope: null,
  motionSampleCount: 0,
  lastMotionUpdate: null,
  matchedSegmentId: null,
  distanceToSegmentMeters: null,
  segmentMatchStatus: "SEARCHING",
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  isSecureContext: typeof window !== "undefined" ? Boolean(window.isSecureContext) : true,
};

// Initial realistic sample history for prototype demonstration
const INITIAL_TRIP_HISTORY: Trip[] = [
  {
    trip_id: "TRIP-20260923-002",
    bus_id: "KL-07-BUS-02",
    start_timestamp: "2026-09-23T14:30:00.000Z",
    end_timestamp: "2026-09-23T15:09:00.000Z",
    start_latitude: 10.1085,
    start_longitude: 76.3562,
    end_latitude: 10.0158,
    end_longitude: 76.3418,
    start_location_name: "Aluva",
    destination_location_name: "Kakkanad",
    distance_km: 17.9,
    duration_seconds: 2340,
    detection_mode: "AUTO",
    gps_points: [],
    event_count: 12,
    segment_count: 78,
    observations_count: 940,
    max_speed_kmh: 46.2,
    avg_speed_kmh: 34.1,
    status: "TRIP_COMPLETED",
    affected_segments: [
      {
        segment_id: "SEG_036",
        road_name: "Aluva - Kakkanad Link",
        hazard_type: "POTHOLE",
        severity: 3.6,
        confidence: 0.94,
        status: "HAZARD_DETECTED",
        source: "SYNTHETIC",
      },
      {
        segment_id: "SEG_041",
        road_name: "Kalamassery Bypass",
        hazard_type: "ROUGHNESS",
        severity: 2.2,
        confidence: 0.89,
        status: "HAZARD_DETECTED",
        source: "SYNTHETIC",
      },
      {
        segment_id: "SEG_012",
        road_name: "CUSAT Corridor",
        hazard_type: undefined,
        severity: 0,
        confidence: 0.98,
        status: "OBSERVED",
        source: "SYNTHETIC",
      },
    ],
  },
  {
    trip_id: "TRIP-20260923-001",
    bus_id: "KL-07-BUS-01",
    start_timestamp: "2026-09-23T09:15:00.000Z",
    end_timestamp: "2026-09-23T09:57:00.000Z",
    start_latitude: 10.0158,
    start_longitude: 76.3418,
    end_latitude: 10.1085,
    end_longitude: 76.3562,
    start_location_name: "Kakkanad",
    destination_location_name: "Aluva",
    distance_km: 18.7,
    duration_seconds: 2520,
    detection_mode: "AUTO",
    gps_points: [],
    event_count: 17,
    segment_count: 84,
    observations_count: 1120,
    max_speed_kmh: 52.0,
    avg_speed_kmh: 36.8,
    status: "TRIP_COMPLETED",
    affected_segments: [
      {
        segment_id: "SEG_024",
        road_name: "Palarivattom - Edappally",
        hazard_type: "POTHOLE",
        severity: 3.4,
        confidence: 0.92,
        status: "HAZARD_DETECTED",
        source: "SYNTHETIC",
      },
      {
        segment_id: "SEG_028",
        road_name: "Edappally Tollway",
        hazard_type: "SPEED_BREAKER",
        severity: 2.8,
        confidence: 0.95,
        status: "HAZARD_DETECTED",
        source: "SYNTHETIC",
      },
    ],
  },
  {
    trip_id: "TRIP-20260922-003",
    bus_id: "KL-07-BUS-04",
    start_timestamp: "2026-09-22T16:00:00.000Z",
    end_timestamp: "2026-09-22T16:58:00.000Z",
    start_latitude: 10.0158,
    start_longitude: 76.3418,
    end_latitude: 9.9658,
    end_longitude: 76.2421,
    start_location_name: "Kakkanad",
    destination_location_name: "Fort Kochi",
    distance_km: 24.2,
    duration_seconds: 3480,
    detection_mode: "MANUAL",
    gps_points: [],
    event_count: 21,
    segment_count: 96,
    observations_count: 1450,
    max_speed_kmh: 48.5,
    avg_speed_kmh: 31.4,
    status: "TRIP_COMPLETED",
    affected_segments: [
      {
        segment_id: "SEG_036",
        road_name: "Kochi Marine Link",
        hazard_type: "BROKEN_PATCH",
        severity: 3.1,
        confidence: 0.91,
        status: "HAZARD_DETECTED",
        source: "SYNTHETIC",
      },
    ],
  },
];

export function TripProvider({ children }: { children: ReactNode }) {
  const { events: rawEvents, summaries, segments: geoSegments } = useRoadData();

  const [settings, setSettings] = useState<TripSettings>(DEFAULT_TRIP_SETTINGS);
  const [tripHistory, setTripHistory] = useState<Trip[]>(INITIAL_TRIP_HISTORY);
  const [state, setState] = useState<TripDetectionState>("IDLE");
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);

  const [inspectedTrip, setInspectedTrip] = useState<Trip | null>(null);
  const [gpsSpeedKmh, setGpsSpeedKmh] = useState<number | null>(null);
  const [gpsDiagnostics, setGpsDiagnostics] = useState<GpsSpeedDiagnostics | null>(null);
  const [isWeakGps, setIsWeakGps] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // ── Prompt 4 & 5: live sensor state ────────────────────────────────────────
  const [sensorStatus, setSensorStatus] = useState<SensorAvailability>({
    location: "CONNECTING",
    motion: "UNSUPPORTED",
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  });
  const [queuedBufferCount, setQueuedBufferCount] = useState(0);

  // ── Full real-time telemetry and 34-feature readiness diagnostics ──────────
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(INITIAL_TELEMETRY);
  const [featureReadiness, setFeatureReadiness] = useState<FeatureReadinessReport | null>(null);

  // ── State machine refs (pure, extracted) ───────────────────────────────────
  const smRefsRef = useRef<TripStateMachineRefs>(createStateMachineRefs());

  // ── Sensor collector ref ───────────────────────────────────────────────────
  const collectorRef = useRef<LiveSensorCollector | null>(null);

  // ── Refs for simulation control ───────────────────────────────────────────
  const simulationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const simulationStepRef = useRef<number>(0);

  // ── Current state accessible inside sensor callbacks ───────────────────────
  const stateRef = useRef<TripDetectionState>("IDLE");
  stateRef.current = state;
  const currentTripRef = useRef<Trip | null>(null);
  currentTripRef.current = currentTrip;
  const tripHistoryRef = useRef<Trip[]>(INITIAL_TRIP_HISTORY);
  tripHistoryRef.current = tripHistory;

  // Hydrate from localStorage once mounted on client
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem("roadsense:trip_settings");
      if (savedSettings) setSettings((prev) => ({ ...prev, ...JSON.parse(savedSettings) }));

      const savedTrips = localStorage.getItem("roadsense:trips");
      if (savedTrips) setTripHistory(JSON.parse(savedTrips));

      const savedActive = localStorage.getItem("roadsense:active_trip");
      if (savedActive) {
        const trip: Trip = JSON.parse(savedActive);
        setCurrentTrip(trip);
        setState(trip.status);
      }
    } catch (err) {
      void err;
    }
  }, []);

  // Save trip history to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("roadsense:trips", JSON.stringify(tripHistory));
      } catch (err) {
        void err;
      }
    }
  }, [tripHistory]);

  // Save active trip to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        if (currentTrip && currentTrip.status !== "TRIP_COMPLETED") {
          localStorage.setItem("roadsense:active_trip", JSON.stringify(currentTrip));
        } else {
          localStorage.removeItem("roadsense:active_trip");
        }
      } catch (err) {
        void err;
      }
    }
  }, [currentTrip]);

  // Save settings to localStorage
  const updateSettings = (newSettings: Partial<TripSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem("roadsense:trip_settings", JSON.stringify(updated));
      } catch (err) {
        void err;
      }
      return updated;
    });
  };

  // Timer interval for updating duration of active trip
  useEffect(() => {
    if (state !== "TRIP_ACTIVE" && state !== "TEMPORARY_STOP") return;
    if (isPaused) return;

    const interval = setInterval(() => {
      setCurrentTrip((prev) => {
        if (!prev) return null;
        const now = Date.now();
        const start = new Date(prev.start_timestamp).getTime();
        const durationSec = Math.max(0, Math.floor((now - start) / 1000));
        return {
          ...prev,
          duration_seconds: durationSec,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state, isPaused]);

  /**
   * Process a GPS point via the pure state machine and apply the resulting
   * transition to React state.
   */
  const processGpsUpdate = (point: TripGPSPoint) => {
    setGpsSpeedKmh(point.speed_kmh);
    setIsWeakGps(point.accuracy_m > settings.minGpsAccuracyMeters);

    const nowMs = Date.now();
    const currentState = stateRef.current;
    const refs = smRefsRef.current;

    const transition = transitionTripState(currentState, point, refs, nowMs);

    if (transition.nextState === "NO_CHANGE") return;

    if (transition.nextState === "IDLE") {
      setState("IDLE");
      return;
    }

    if (transition.nextState === "MOVEMENT_DETECTED") {
      setState("MOVEMENT_DETECTED");
      return;
    }

    if (transition.nextState === "TRIP_ACTIVE" && currentState === "MOVEMENT_DETECTED") {
      const startPoint = transition.confirmedStartPoint ?? point;
      const startLocName = reverseGeocodeLocation(startPoint.lat, startPoint.lng);
      const hist = tripHistoryRef.current;
      const newTrip: Trip = {
        trip_id: `TRIP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(hist.length + 1).padStart(3, "0")}`,
        bus_id: "KL-07-BUS-01",
        start_timestamp: new Date(startPoint.timestamp).toISOString(),
        start_latitude: startPoint.lat,
        start_longitude: startPoint.lng,
        start_location_name: startLocName,
        current_location_name: startLocName,
        distance_km: 0,
        duration_seconds: 0,
        detection_mode: "AUTO",
        gps_points: [startPoint, point],
        event_count: 0,
        segment_count: 1,
        observations_count: 2,
        max_speed_kmh: point.speed_kmh ?? 0,
        avg_speed_kmh: point.speed_kmh ?? 0,
        status: "TRIP_ACTIVE",
      };
      setCurrentTrip(newTrip);
      setState("TRIP_ACTIVE");
      return;
    }

    if (transition.nextState === "TRIP_ACTIVE" && currentState === "TEMPORARY_STOP") {
      setState("TRIP_ACTIVE");
      return;
    }

    if (transition.nextState === "TEMPORARY_STOP") {
      setState("TEMPORARY_STOP");
      setCurrentTrip((prev) => {
        if (!prev) return null;
        const prevMetrics = initialTripMetrics();
        const lastPt = prev.gps_points[prev.gps_points.length - 1] ?? null;
        const metrics = calculateTripMetrics(prevMetrics, lastPt, point, new Date(prev.start_timestamp).getTime(), nowMs);
        const matchedEvents = Math.min(rawEvents.length, Math.floor(metrics.distance_km * 0.9));
        const matchedSegments = Math.min(summaries.length, Math.floor(metrics.distance_km * 4.5));
        return {
          ...prev,
          distance_km: prev.distance_km,
          current_location_name: reverseGeocodeLocation(point.lat, point.lng),
          gps_points: [...prev.gps_points, point],
          status: "TEMPORARY_STOP",
          event_count: matchedEvents,
          segment_count: Math.max(1, matchedSegments),
          observations_count: (prev.observations_count ?? prev.gps_points.length) + 1,
        };
      });
      return;
    }

    if (transition.nextState === "TRIP_COMPLETED") {
      finalizeTrip(point, "AUTO");
      return;
    }
  };

  /**
   * Finalizes the active trip to TRIP_COMPLETED state.
   * Assembles the "ROAD INTELLIGENCE CONTRIBUTED" summary for the contributor.
   */
  const finalizeTrip = (finalPoint?: TripGPSPoint, modeOverride?: TripDetectionMode) => {
    const trip = currentTripRef.current;
    if (!trip) return;

    const endPt = finalPoint ??
      trip.gps_points[trip.gps_points.length - 1] ?? {
        lat: trip.start_latitude,
        lng: trip.start_longitude,
      };

    const destName = formatDestinationLabel(endPt.lat, endPt.lng);
    const isDemo = trip.trip_id.includes("DEMO") || isSimulating;

    // Build the contributor's intelligence contribution summary (UI display only)
    let affectedSegments: TripAffectedSegment[] = [];

    if (isDemo) {
      affectedSegments = [
        {
          segment_id: "SEG_036",
          road_name: "Kakkanad Bypass",
          hazard_type: "POTHOLE",
          severity: 3.8,
          confidence: 0.958,
          status: "HAZARD_DETECTED",
          source: "DEMO",
        },
        {
          segment_id: "SEG_041",
          road_name: "Palarivattom Corridor",
          hazard_type: "ROUGHNESS",
          severity: 2.4,
          confidence: 0.882,
          status: "HAZARD_DETECTED",
          source: "DEMO",
        },
        {
          segment_id: "SEG_052",
          road_name: "Kalamassery Premier",
          hazard_type: undefined,
          severity: 0,
          confidence: 0.99,
          status: "OBSERVED",
          source: "DEMO",
        },
      ];
    } else {
      // Derive observed corridors from actual GPS points
      const matchedIds = Array.from(
        new Set(trip.gps_points.map((p) => p.segment_id).filter(Boolean) as string[])
      );
      affectedSegments = matchedIds.slice(0, 5).map((id) => ({
        segment_id: id,
        road_name: "Monitored Transit Corridor",
        hazard_type: undefined,
        severity: 0,
        confidence: 0.85,
        status: "OBSERVED",
        source: trip.detection_mode === "MANUAL" ? "MANUAL" : "LIVE",
      }));
    }

    const obsCount = isDemo
      ? Math.max(1284, trip.gps_points.length * 128)
      : Math.max(trip.gps_points.length, (trip.observations_count ?? 0) || 12);

    const finalTrip: Trip = {
      ...trip,
      end_timestamp: new Date().toISOString(),
      end_latitude: endPt.lat,
      end_longitude: endPt.lng,
      destination_location_name: destName,
      status: "TRIP_COMPLETED",
      detection_mode: modeOverride ?? trip.detection_mode,
      distance_km: Math.max(0.4, trip.distance_km),
      duration_seconds: Math.max(15, trip.duration_seconds),
      avg_speed_kmh: Number(
        (trip.distance_km / Math.max(0.01, trip.duration_seconds / 3600)).toFixed(1),
      ),
      observations_count: obsCount,
      affected_segments: affectedSegments,
    };

    setCurrentTrip(finalTrip);
    setTripHistory((prev) => [finalTrip, ...prev]);
    setState("TRIP_COMPLETED");
    setIsSimulating(false);
    setIsPaused(false);

    smRefsRef.current = createStateMachineRefs();
  };

  /**
   * Manual Controls
   */
  const startManualTrip = (origin?: string, destination?: string) => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
    setIsSimulating(false);
    setIsPaused(false);

    // Reset distance calculator on the collector for clean trip distance
    collectorRef.current?.resetDistance();

    const liveTelemetry = collectorRef.current?.getTelemetry();
    const startLat = liveTelemetry?.latitude ?? 10.0158;
    const startLng = liveTelemetry?.longitude ?? 76.3418;
    const startName =
      origin && origin.trim() !== "" ? origin : reverseGeocodeLocation(startLat, startLng);

    const manualTrip: Trip = {
      trip_id: `TRIP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(tripHistory.length + 1).padStart(3, "0")}`,
      bus_id: "KL-07-BUS-01",
      start_timestamp: new Date().toISOString(),
      start_latitude: startLat,
      start_longitude: startLng,
      start_location_name: startName,
      destination_location_name: destination?.trim() ? destination.trim() : undefined,
      current_location_name: startName,
      distance_km: 0,
      duration_seconds: 0,
      detection_mode: "MANUAL",
      gps_points: [
        {
          lat: startLat,
          lng: startLng,
          speed_kmh: liveTelemetry?.speedKmh ?? 0,
          accuracy_m: liveTelemetry?.accuracyMeters ?? 5,
          timestamp: Date.now(),
          source: "MANUAL",
        },
      ],
      event_count: 0,
      segment_count: liveTelemetry?.matchedSegmentId ? 1 : 0,
      observations_count: 1,
      status: "TRIP_ACTIVE",
      max_speed_kmh: liveTelemetry?.speedKmh ?? 0,
      avg_speed_kmh: liveTelemetry?.speedKmh ?? 0,
    };

    setCurrentTrip(manualTrip);
    setState("TRIP_ACTIVE");
  };

  const endManualTrip = () => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
    setIsSimulating(false);
    setIsPaused(false);
    finalizeTrip(undefined, "MANUAL");
  };

  const dismissCompletedTrip = () => {
    setCurrentTrip(null);
    setState("IDLE");
  };

  const clearHistory = () => {
    setTripHistory([]);
    try {
      localStorage.removeItem("roadsense:trips");
    } catch (err) {
      void err;
    }
  };

  const requestMotionPermission = async (): Promise<boolean> => {
    if (!collectorRef.current) return false;
    return await collectorRef.current.requestMotionPermission();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // DEMO MODE: Reliable 2-3 minute Hackathon Demonstration Pipeline
  // Sequence coordinates: Kakkanad → Palarivattom → Edappally → Kalamassery → Aluva
  // ───────────────────────────────────────────────────────────────────────────

  const simulationWaypoints = useMemo(
    () => [
      { lat: 10.0158, lng: 76.3418, speed: 0, label: "Kakkanad (Parked)", segmentId: "SEG_035" },
      { lat: 10.0165, lng: 76.3402, speed: 12, label: "Kakkanad Bypass", segmentId: "SEG_036" },
      { lat: 10.0175, lng: 76.3385, speed: 28, label: "Kakkanad Outskirts", segmentId: "SEG_036" },
      { lat: 10.0082, lng: 76.3214, speed: 38, label: "Palarivattom Road", segmentId: "SEG_041" },
      { lat: 10.0039, lng: 76.3075, speed: 32, label: "Palarivattom", segmentId: "SEG_041" },
      { lat: 10.0236, lng: 76.3116, speed: 0, label: "Edappally Signal (Traffic Light)", segmentId: "SEG_052" },
      { lat: 10.0261, lng: 76.3088, speed: 35, label: "Edappally Toll", segmentId: "SEG_052" },
      { lat: 10.0526, lng: 76.3218, speed: 44, label: "Kalamassery Premier", segmentId: "SEG_060" },
      { lat: 10.0842, lng: 76.3382, speed: 41, label: "Muttom Metro", segmentId: "SEG_075" },
      { lat: 10.1076, lng: 76.3516, speed: 0, label: "Aluva Private Bus Stand (Destination)", segmentId: "SEG_088" },
    ],
    []
  );

  const runSimulationStep = () => {
    const step = simulationStepRef.current;
    if (step >= simulationWaypoints.length) {
      setIsSimulating(false);
      setIsPaused(false);
      return;
    }

    const wp = simulationWaypoints[step];
    if (!wp) {
      setIsSimulating(false);
      setIsPaused(false);
      return;
    }

    const pt: TripGPSPoint = {
      lat: wp.lat,
      lng: wp.lng,
      speed_kmh: wp.speed,
      accuracy_m: 4.2,
      timestamp: Date.now(),
      location_name: wp.label,
      segment_id: wp.segmentId,
      source: "DEMO",
      sensor_type: "GPS_AND_MOTION",
      accel_z: step === 2 ? 3.8 : 0.2, // Simulated bump spike at step 2
    };

    // Step-specific state simulation
    if (step === 0) {
      setState("IDLE");
      setGpsSpeedKmh(0);
    } else if (step === 1) {
      setState("MOVEMENT_DETECTED");
      setGpsSpeedKmh(wp.speed);
    } else if (step === 5) {
      // Traffic signal stop (TEMPORARY_STOP demonstration)
      setState("TEMPORARY_STOP");
      setGpsSpeedKmh(0);
    } else if (step === simulationWaypoints.length - 1) {
      // Destination arrived
      finalizeTrip(pt, "AUTO");
      setIsSimulating(false);
      setIsPaused(false);
      return;
    } else {
      setState("TRIP_ACTIVE");
      setGpsSpeedKmh(wp.speed);
    }

    if (step > 1) {
      const firstWp = simulationWaypoints[0]!;
      setCurrentTrip((prev) => {
        const now = Date.now();
        const dist = Number((step * 2.1).toFixed(1));
        const dur = step * 250;
        // Observations increment realistically during travel
        const obs = step * 142;
        return {
          trip_id:
            prev?.trip_id ??
            `TRIP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-DEMO`,
          bus_id: "KL-07-BUS-01",
          start_timestamp: prev?.start_timestamp ?? new Date(now - dur * 1000).toISOString(),
          start_latitude: firstWp.lat,
          start_longitude: firstWp.lng,
          start_location_name: "Kakkanad",
          current_location_name: reverseGeocodeLocation(wp.lat, wp.lng),
          distance_km: dist,
          duration_seconds: dur,
          detection_mode: "AUTO",
          gps_points: [...(prev?.gps_points ?? []), pt],
          event_count: Math.min(17, step * 2),
          segment_count: Math.min(84, step * 9),
          observations_count: obs,
          max_speed_kmh: 44.0,
          avg_speed_kmh: 36.5,
          status: step === 5 ? "TEMPORARY_STOP" : "TRIP_ACTIVE",
        };
      });
    }

    simulationStepRef.current = step + 1;
    simulationTimerRef.current = setTimeout(runSimulationStep, 2200);
  };

  const simulateTrip = () => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
    setIsSimulating(true);
    setIsPaused(false);
    simulationStepRef.current = 0;
    runSimulationStep();
  };

  const pauseSimulation = () => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
    setIsPaused(true);
  };

  const resumeSimulation = () => {
    setIsPaused(false);
    runSimulationStep();
  };

  const stopSimulation = () => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
    setIsSimulating(false);
    setIsPaused(false);
    simulationStepRef.current = 0;
    setGpsSpeedKmh(null);
  };

  const resetSimulation = () => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
    setIsSimulating(false);
    setIsPaused(false);
    simulationStepRef.current = 0;
    setCurrentTrip(null);
    setState("IDLE");
    setGpsSpeedKmh(null);
    setGpsDiagnostics(null);
  };

  // ── Live Sensor Collector: initialise once on browser mount ───────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSimulating) return; // don't start live sensors during demo simulation

    const collector = new LiveSensorCollector(
      {
        onGpsPoint: (point) => {
          setCurrentTrip((prev) => {
            if (!prev || stateRef.current !== "TRIP_ACTIVE") return prev;
            // Cumulative travelled distance from GPS tracker
            const telemetryDistM = collectorRef.current?.getTelemetry().distanceMeters ?? 0;
            const updatedDistKm = Number((telemetryDistM / 1000).toFixed(3));
            const updatedPoints = [...prev.gps_points, point];
            const updatedMaxSpeed =
              point.speed_kmh !== null
                ? Math.max(prev.max_speed_kmh ?? 0, point.speed_kmh)
                : (prev.max_speed_kmh ?? 0);
            // In Live mode, do NOT fabricate ML events. Only count real ML detections or keep at 0.
            const isDemo = prev.trip_id.includes("DEMO") || isSimulating;
            const matchedEvents = isDemo ? Math.min(rawEvents.length, Math.floor(updatedDistKm * 0.9)) : 0;
            const uniqueSegments = Array.from(new Set(updatedPoints.map((p) => p.segment_id).filter(Boolean)));
            const matchedSegments = isDemo
              ? Math.min(summaries.length, Math.floor(updatedDistKm * 4.5))
              : Math.max(1, uniqueSegments.length);

            return {
              ...prev,
              distance_km: updatedDistKm,
              current_location_name: reverseGeocodeLocation(point.lat, point.lng),
              gps_points: updatedPoints,
              max_speed_kmh: updatedMaxSpeed,
              event_count: matchedEvents,
              segment_count: matchedSegments,
              observations_count: (prev.observations_count ?? prev.gps_points.length) + 1,
            };
          });

          processGpsUpdate(point);
        },
        onMotionReading: (_reading: MotionReading) => {
          // Handled inside collector
        },
        onStatusChange: (status) => {
          setSensorStatus(status);
          if (
            status.location === "PERMISSION_DENIED" ||
            status.location === "UNAVAILABLE"
          ) {
            setIsWeakGps(true);
          }
        },
        onBatchFlush: (observations: BatchObservation[]) => {
          setQueuedBufferCount(0);
          if (observations.length > 0) {
            const activeTrip = currentTripRef.current;
            const tripId = activeTrip?.trip_id ?? "LIVE-SENSOR-STREAM";
            const busId = activeTrip?.bus_id ?? "KL-07-BUS-01";
            persistLiveObservations(observations, tripId, busId).catch((err) => {
              console.warn("[trip-context] live observation persistence failed:", err);
            });
          }
        },
        onDiagnostics: (diag) => {
          setGpsDiagnostics(diag);
        },
        onTelemetry: (tel) => {
          setTelemetry(tel);
        },
        onFeatureReadiness: (rep) => {
          setFeatureReadiness(rep);
        },
      },
      [],
    );

    collectorRef.current = collector;
    collector.start();

    return () => {
      collector.stop();
      collectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating]);

  // Update buffer count periodically
  useEffect(() => {
    if (!collectorRef.current) return;
    const id = setInterval(() => {
      setQueuedBufferCount(collectorRef.current?.getBufferSize() ?? 0);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Update collector's segment list when road data loads
  useEffect(() => {
    if (!collectorRef.current) return;
    if (geoSegments && geoSegments.length > 0) {
      const refs: SegmentRef[] = geoSegments.map((s) => {
        const coords = s.geometry?.coordinates ?? [];
        if (coords.length > 0) {
          const midIdx = Math.floor(coords.length / 2);
          const pair = coords[midIdx];
          const lat = pair && typeof pair[1] === "number" ? pair[1] : 10.0158;
          const lng = pair && typeof pair[0] === "number" ? pair[0] : 76.3418;
          return {
            segment_id: s.properties.segment_id,
            lat,
            lng,
          };
        }
        return {
          segment_id: s.properties.segment_id,
          lat: 10.0158,
          lng: 76.3418,
        };
      });
      collectorRef.current.updateSegments(refs);
    } else if (summaries.length > 0) {
      const refs: SegmentRef[] = summaries.map((s) => ({
        segment_id: s.segment_id,
        lat: 10.0158,
        lng: 76.3418,
      }));
      collectorRef.current.updateSegments(refs);
    }
  }, [geoSegments, summaries]);

  const value = useMemo<TripContextType>(
    () => ({
      state,
      currentTrip,
      tripHistory,
      settings,
      isSimulating,
      isPaused,
      isWeakGps,
      gpsSpeedKmh,
      gpsDiagnostics,
      sensorStatus,
      queuedBufferCount,
      telemetry,
      featureReadiness,
      startManualTrip,
      endManualTrip,
      simulateTrip,
      pauseSimulation,
      resumeSimulation,
      stopSimulation,
      resetSimulation,
      updateSettings,
      dismissCompletedTrip,
      clearHistory,
      requestMotionPermission,
      selectTripForInspection: setInspectedTrip,
      inspectedTrip,
    }),
    [
      state,
      currentTrip,
      tripHistory,
      settings,
      isSimulating,
      isPaused,
      isWeakGps,
      gpsSpeedKmh,
      gpsDiagnostics,
      sensorStatus,
      queuedBufferCount,
      telemetry,
      featureReadiness,
      inspectedTrip,
      requestMotionPermission,
    ],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error("useTrip must be used within a TripProvider");
  }
  return context;
}
