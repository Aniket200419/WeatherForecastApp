import { API_KEY, WEATHER_API_BASE_URL } from "./config.js";

export class WeatherApiError extends Error {
  constructor(message, code = "api_error", status = 0) {
    super(message);
    this.name = "WeatherApiError";
    this.code = code;
    this.status = status;
  }
}

function validateLocation(location) {
  if (typeof location.city === "string" && location.city.trim()) {
    return { q: location.city.trim() };
  }

  if (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.latitude) <= 90 &&
    Math.abs(location.longitude) <= 180
  ) {
    return { lat: location.latitude, lon: location.longitude };
  }

  throw new WeatherApiError("Enter a city name or provide valid coordinates.", "invalid_location");
}

async function fetchJson(endpoint, query) {
  if (!API_KEY || API_KEY === "YOUR_OPENWEATHER_API_KEY") {
    throw new WeatherApiError(
      "Add your OpenWeather API key in js/config.js before searching.",
      "missing_api_key"
    );
  }

  const params = new URLSearchParams({ ...query, appid: API_KEY, units: "metric" });
  let response;
  try {
    response = await fetch(`${WEATHER_API_BASE_URL}/${endpoint}?${params.toString()}`);
  } catch {
    throw new WeatherApiError(
      "Could not reach the weather service. Check your internet connection and try again.",
      "network_error"
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new WeatherApiError("The weather service returned an unreadable response.", "invalid_response", response.status);
  }

  if (!response.ok) {
    const apiCode = typeof data?.cod === "string" ? data.cod : String(response.status);
    if (response.status === 404 || apiCode === "404") {
      throw new WeatherApiError("We couldn't find that city. Check the spelling and try again.", "city_not_found", response.status);
    }
    if (response.status === 401 || apiCode === "401") {
      throw new WeatherApiError(
        "The API key was rejected. Check js/config.js and make sure your key is active.",
        "invalid_api_key",
        response.status
      );
    }
    const message = typeof data?.message === "string" ? data.message : "The weather service is temporarily unavailable.";
    throw new WeatherApiError(`Weather service error: ${message}`, "api_error", response.status);
  }

  return data;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateCurrentWeather(data) {
  if (
    !data ||
    typeof data.name !== "string" ||
    !data.main ||
    !isFiniteNumber(data.main.temp) ||
    !Array.isArray(data.weather) ||
    !data.weather[0] ||
    typeof data.weather[0].description !== "string"
  ) {
    throw new WeatherApiError("The weather service returned incomplete current conditions.", "invalid_response");
  }
}

function validateForecast(data) {
  if (!data || !Array.isArray(data.list) || !data.city || !isFiniteNumber(data.city.timezone)) {
    throw new WeatherApiError("The weather service returned incomplete forecast data.", "invalid_response");
  }
  if (
    data.list.some(
      (entry) =>
        !isFiniteNumber(entry?.dt) ||
        !isFiniteNumber(entry?.main?.temp) ||
        !Array.isArray(entry?.weather) ||
        !entry.weather[0]
    )
  ) {
    throw new WeatherApiError("The forecast contains incomplete entries. Please try again.", "invalid_response");
  }
}

function localDateKey(timestamp, timezoneOffset) {
  return new Date((timestamp + timezoneOffset) * 1000).toISOString().slice(0, 10);
}

function summarizeForecast(entries, timezoneOffset) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = localDateKey(entry.dt, timezoneOffset);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const todayKey = localDateKey(Date.now() / 1000, timezoneOffset);
  return [...grouped.entries()]
    .filter(([date]) => date !== todayKey)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .slice(0, 5)
    .map(([date, dayEntries]) => {
      const representative = dayEntries.reduce((best, entry) => {
        const bestHour = new Date((best.dt + timezoneOffset) * 1000).getUTCHours();
        const hour = new Date((entry.dt + timezoneOffset) * 1000).getUTCHours();
        return Math.abs(hour - 12) < Math.abs(bestHour - 12) ? entry : best;
      }, dayEntries[0]);
      const lows = dayEntries.map((entry) => isFiniteNumber(entry.main.temp_min) ? entry.main.temp_min : entry.main.temp);
      const highs = dayEntries.map((entry) => isFiniteNumber(entry.main.temp_max) ? entry.main.temp_max : entry.main.temp);
      return {
        date,
        min: Math.min(...lows),
        max: Math.max(...highs),
        condition: representative.weather[0]?.description || "Conditions unavailable",
        icon: representative.weather[0]?.icon || "",
      };
    });
}

export async function getWeatherBundle(location) {
  const locationQuery = validateLocation(location);
  const [current, forecast] = await Promise.all([
    fetchJson("weather", locationQuery),
    fetchJson("forecast", locationQuery),
  ]);
  validateCurrentWeather(current);
  validateForecast(forecast);

  return {
    current,
    forecast: summarizeForecast(forecast.list, forecast.city.timezone),
    timezone: forecast.city.timezone,
  };
}
