/**
 * Offline-first Reverse Geocoding for Kerala Transit Corridors.
 * Falls back to precise coordinate strings when outside known transit hubs.
 * Never invents place names.
 */

interface KnownLandmark {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

// Major transit junctions and bus stations along the Ernakulam - Kochi corridor
const KNOWN_LANDMARKS: KnownLandmark[] = [
  { name: "Kakkanad", lat: 10.0158, lng: 76.3418, radiusKm: 1.8 },
  { name: "Infopark, Kakkanad", lat: 10.0104, lng: 76.3637, radiusKm: 1.5 },
  { name: "Edappally Toll", lat: 10.0236, lng: 76.3116, radiusKm: 1.4 },
  { name: "Edappally Bypass", lat: 10.0261, lng: 76.3088, radiusKm: 1.5 },
  { name: "Palarivattom", lat: 10.0039, lng: 76.3075, radiusKm: 1.3 },
  { name: "Kaloor Bus Stand", lat: 9.9926, lng: 76.2942, radiusKm: 1.4 },
  { name: "Aluva Private Bus Stand", lat: 10.1076, lng: 76.3516, radiusKm: 1.8 },
  { name: "Aluva", lat: 10.1085, lng: 76.3562, radiusKm: 2.0 },
  { name: "Kalamassery Premier", lat: 10.0526, lng: 76.3218, radiusKm: 1.6 },
  { name: "CUSAT Junction", lat: 10.0432, lng: 76.3248, radiusKm: 1.4 },
  { name: "Vytilla Mobility Hub", lat: 9.9678, lng: 76.3195, radiusKm: 1.6 },
  { name: "Ernakulam South (KSRTC)", lat: 9.9698, lng: 76.2885, radiusKm: 1.5 },
  { name: "MG Road, Ernakulam", lat: 9.9745, lng: 76.2825, radiusKm: 1.5 },
  { name: "Thevara Junction", lat: 9.9482, lng: 76.2978, radiusKm: 1.5 },
  { name: "Fort Kochi", lat: 9.9658, lng: 76.2421, radiusKm: 1.8 },
  { name: "Menaka / Marine Drive", lat: 9.9806, lng: 76.2754, radiusKm: 1.4 },
  { name: "Thrikkakara", lat: 10.0354, lng: 76.3326, radiusKm: 1.4 },
  { name: "Angamaly", lat: 10.1962, lng: 76.3861, radiusKm: 2.2 },
];

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function reverseGeocodeLocation(lat: number, lng: number): string {
  let closest: KnownLandmark | null = null;
  let minDistance = Infinity;

  for (const lm of KNOWN_LANDMARKS) {
    const dist = calculateDistanceKm(lat, lng, lm.lat, lm.lng);
    if (dist < minDistance && dist <= lm.radiusKm) {
      minDistance = dist;
      closest = lm;
    }
  }

  if (closest) {
    return closest.name;
  }

  // Fallback to coordinates format as specified in requirements
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function formatDestinationLabel(lat: number, lng: number): string {
  const name = reverseGeocodeLocation(lat, lng);
  if (name.includes(",")) {
    return name;
  }
  // Check if it's raw coordinates
  if (/^\d+\.\d+,\s*\d+\.\d+$/.test(name)) {
    return `Destination near ${name}`;
  }
  return name;
}
