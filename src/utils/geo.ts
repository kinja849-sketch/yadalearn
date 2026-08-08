interface GeoLocation {
  countryCode: string;
  countryName: string;
  ip: string;
  timestamp: number;
}

const STORAGE_KEY = 'user_geo_loc';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchGeoLocation(): Promise<{ countryCode: string; countryName: string; ip: string }> {
  try {
    const savedGeoStr = localStorage.getItem(STORAGE_KEY);
    if (savedGeoStr) {
      try {
        const savedGeo: GeoLocation = JSON.parse(savedGeoStr);
        const age = Date.now() - (savedGeo.timestamp || 0);
        if (savedGeo.countryCode && age < CACHE_TTL_MS) {
          return {
            countryCode: savedGeo.countryCode,
            countryName: savedGeo.countryName,
            ip: savedGeo.ip || '127.0.0.1',
          };
        }
      } catch (e) {
        // Invalid cached JSON, ignore
      }
    }

    // Attempt to fetch from ipapi.co
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const data = await res.json();
      const geo: GeoLocation = {
        countryCode: data.country_code || 'US',
        countryName: data.country_name || 'United States',
        ip: data.ip || '127.0.0.1',
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(geo));
      return { countryCode: geo.countryCode, countryName: geo.countryName, ip: geo.ip };
    }
  } catch (err) {
    console.warn('Geo IP lookup notice (using fallback):', err);
  }

  // Fallback if network fails, 429 Too Many Requests, or rate limited
  const fallbackGeo: GeoLocation = {
    countryCode: 'US',
    countryName: 'United States',
    ip: '127.0.0.1',
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackGeo));
  } catch (e) {
    // Ignore storage write errors
  }
  return { countryCode: fallbackGeo.countryCode, countryName: fallbackGeo.countryName, ip: fallbackGeo.ip };
}
