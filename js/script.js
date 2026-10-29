import {
  HISTORY_STORAGE_KEY,
  MAX_HISTORY_ITEMS,
  WEATHER_ICON_BASE_URL,
} from "./config.js";
import { getWeatherBundle, WeatherApiError } from "./weather.js";

const elements = {
  searchForm: document.querySelector("#search-form"),
  cityInput: document.querySelector("#city-input"),
  searchButton: document.querySelector("#search-button"),
  locationButton: document.querySelector("#location-button"),
  loading: document.querySelector("#loading-message"),
  error: document.querySelector("#error-message"),
  dashboard: document.querySelector("#weather-dashboard"),
  welcome: document.querySelector("#welcome-state"),
  cityName: document.querySelector("#city-name"),
  currentDate: document.querySelector("#current-date"),
  currentIcon: document.querySelector("#current-icon"),
  currentIconFallback: document.querySelector("#current-icon-fallback"),
  temperature: document.querySelector("#current-temperature"),
  condition: document.querySelector("#current-condition"),
  feelsLike: document.querySelector("#feels-like"),
  highTemperature: document.querySelector("#high-temperature"),
  lowTemperature: document.querySelector("#low-temperature"),
  humidity: document.querySelector("#humidity"),
  windSpeed: document.querySelector("#wind-speed"),
  pressure: document.querySelector("#pressure"),
  visibility: document.querySelector("#visibility"),
  sunrise: document.querySelector("#sunrise"),
  sunset: document.querySelector("#sunset"),
  forecastGrid: document.querySelector("#forecast-grid"),
  forecastNote: document.querySelector("#forecast-note"),
  unitC: document.querySelector("#unit-c"),
  unitF: document.querySelector("#unit-f"),
  historySection: document.querySelector("#history-section"),
  historyList: document.querySelector("#history-list"),
  clearHistory: document.querySelector("#clear-history"),
};

let activeWeather = null;
let unit = "C";

function readHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.filter((city) => typeof city === "string" && city.trim()).slice(0, MAX_HISTORY_ITEMS)
      : [];
  } catch (error) {
    console.warn("Unable to read search history from localStorage.", error);
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    showError("Weather was loaded, but search history could not be saved in this browser.");
    console.warn("Unable to save search history to localStorage.", error);
  }
}

function renderHistory() {
  const history = readHistory();
  elements.historyList.replaceChildren();
  elements.historySection.hidden = history.length === 0;

  for (const city of history) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-button";
    button.textContent = city;
    button.addEventListener("click", () => loadWeather({ city }));
    item.append(button);
    elements.historyList.append(item);
  }
}

function addToHistory(city) {
  const history = readHistory().filter((savedCity) => savedCity.toLocaleLowerCase() !== city.toLocaleLowerCase());
  history.unshift(city);
  saveHistory(history.slice(0, MAX_HISTORY_ITEMS));
  renderHistory();
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function clearError() {
  elements.error.textContent = "";
  elements.error.hidden = true;
}

function setLoading(isLoading) {
  elements.loading.hidden = !isLoading;
  elements.searchButton.disabled = isLoading;
  elements.locationButton.disabled = isLoading;
  elements.searchButton.textContent = isLoading ? "Searching..." : "Search";
}

function formatTemperature(value) {
  if (!Number.isFinite(value)) return "—";
  const converted = unit === "F" ? (value * 9) / 5 + 32 : value;
  return `${Math.round(converted)}°`;
}

function formatClock(timestamp, timezoneOffset) {
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date((timestamp + timezoneOffset) * 1000));
}

function setWeatherIcon(image, fallback, iconCode, size) {
  image.onerror = () => {
    image.hidden = true;
    fallback.hidden = false;
  };
  if (!iconCode) {
    image.hidden = true;
    fallback.hidden = false;
    return;
  }
  fallback.hidden = true;
  image.hidden = false;
  image.src = `${WEATHER_ICON_BASE_URL}/${iconCode}@${size}.png`;
}

function setBackground(condition, iconCode) {
  const main = condition.toLowerCase();
  const className = main === "clear" && iconCode.endsWith("n")
    ? "weather-clouds"
    : `weather-${main}`;
  document.body.className = ["weather-clear", "weather-clouds", "weather-rain", "weather-drizzle", "weather-thunderstorm", "weather-snow", "weather-mist"].includes(className)
    ? className
    : "";
}

function formatDate(dateString, options) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(dateString));
}

function renderCurrent() {
  const { current, timezone } = activeWeather;
  const weather = current.weather[0];
  const country = current.sys?.country;
  elements.cityName.textContent = country ? `${current.name}, ${country}` : current.name;
  elements.currentDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date((Date.now() / 1000 + timezone) * 1000));

  elements.temperature.textContent = formatTemperature(current.main.temp);
  elements.condition.textContent = weather.description;
  elements.feelsLike.textContent = formatTemperature(current.main.feels_like);
  elements.highTemperature.textContent = formatTemperature(current.main.temp_max);
  elements.lowTemperature.textContent = formatTemperature(current.main.temp_min);
  elements.humidity.textContent = Number.isFinite(current.main.humidity) ? `${current.main.humidity}%` : "—";
  elements.windSpeed.textContent = Number.isFinite(current.wind?.speed) ? `${current.wind.speed} m/s` : "—";
  elements.pressure.textContent = Number.isFinite(current.main.pressure) ? `${current.main.pressure} hPa` : "—";
  elements.visibility.textContent = Number.isFinite(current.visibility)
    ? `${(current.visibility / 1000).toFixed(1)} km`
    : "—";
  elements.sunrise.textContent = formatClock(current.sys?.sunrise, timezone);
  elements.sunset.textContent = formatClock(current.sys?.sunset, timezone);

  setWeatherIcon(elements.currentIcon, elements.currentIconFallback, weather.icon, "4x");
  setBackground(weather.main || "", weather.icon || "");
}

function renderForecast() {
  elements.forecastGrid.replaceChildren();
  const { forecast } = activeWeather;

  for (const day of forecast) {
    const card = document.createElement("article");
    card.className = "forecast-card glass-panel";

    const date = document.createElement("p");
    date.className = "forecast-day";
    date.textContent = formatDate(`${day.date}T12:00:00`, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

    const iconWrap = document.createElement("div");
    iconWrap.className = "forecast-icon-wrap";
    const image = document.createElement("img");
    image.className = "forecast-icon";
    image.alt = "";
    const fallback = document.createElement("span");
    fallback.className = "forecast-fallback";
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = "☁";
    setWeatherIcon(image, fallback, day.icon, "2x");
    iconWrap.append(image, fallback);

    const condition = document.createElement("p");
    condition.className = "forecast-condition";
    condition.textContent = day.condition;

    const temperature = document.createElement("p");
    temperature.className = "forecast-temp";
    temperature.textContent = formatTemperature(day.max);
    const low = document.createElement("span");
    low.textContent = formatTemperature(day.min);
    temperature.append(low);

    card.append(date, iconWrap, condition, temperature);
    elements.forecastGrid.append(card);
  }

  elements.forecastNote.hidden = forecast.length >= 5;
  elements.forecastNote.textContent = forecast.length
    ? "Some days are not shown because forecast data was unavailable."
    : "No upcoming forecast entries were returned for this location.";
}

function renderWeather() {
  renderCurrent();
  renderForecast();
  elements.dashboard.hidden = false;
  elements.welcome.hidden = true;
}

async function loadWeather(location) {
  clearError();
  setLoading(true);
  try {
    activeWeather = await getWeatherBundle(location);
    renderWeather();
    addToHistory(activeWeather.current.name);
  } catch (error) {
    const message = error instanceof WeatherApiError
      ? error.message
      : "Something went wrong while loading weather. Please try again.";
    showError(message);
  } finally {
    setLoading(false);
  }
}

function searchCity(city) {
  const normalized = city.trim();
  if (!normalized) {
    showError("Enter a city name to search.");
    return;
  }
  loadWeather({ city: normalized });
}

function useLocation() {
  clearError();
  if (!("geolocation" in navigator)) {
    showError("Location access is not available in this browser. Search for a city instead.");
    return;
  }

  setLoading(true);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => loadWeather({ latitude: coords.latitude, longitude: coords.longitude }),
    (error) => {
      setLoading(false);
      const message = error.code === error.PERMISSION_DENIED
        ? "Location permission was denied. Allow location access in your browser or search for a city."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Your location could not be determined. Try searching for a city."
          : "Location lookup timed out. Please try again or search for a city.";
      showError(message);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

function setUnit(nextUnit) {
  unit = nextUnit;
  elements.unitC.classList.toggle("is-active", unit === "C");
  elements.unitF.classList.toggle("is-active", unit === "F");
  elements.unitC.setAttribute("aria-pressed", String(unit === "C"));
  elements.unitF.setAttribute("aria-pressed", String(unit === "F"));
  if (activeWeather) renderWeather();
}

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchCity(elements.cityInput.value);
});
elements.locationButton.addEventListener("click", useLocation);
elements.unitC.addEventListener("click", () => setUnit("C"));
elements.unitF.addEventListener("click", () => setUnit("F"));
elements.clearHistory.addEventListener("click", () => {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (error) {
    showError("Search history could not be cleared in this browser.");
    console.warn("Unable to clear search history from localStorage.", error);
  }
  renderHistory();
});

renderHistory();
