// Utility to calculate distance between two lat/lng points in meters (Haversine formula)
export function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// Generate a random point within radius (meters) of a center point
export function getRandomPoint(centerLat, centerLng, radius) {
    const r = radius / 111300; // rough conversion meters to degrees
    const u = Math.random();
    const v = Math.random();
    const w = r * Math.sqrt(u);
    const t = 2 * Math.PI * v;
    const x = w * Math.cos(t);
    const y = w * Math.sin(t);
    
    // Adjust x for longitude shrinking at higher latitudes
    const xp = x / Math.cos(centerLat * Math.PI / 180);

    return {
        lat: centerLat + y,
        lng: centerLng + xp
    };
}