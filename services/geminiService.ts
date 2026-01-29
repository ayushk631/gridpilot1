import { GoogleGenAI, Type } from "@google/genai";
import { SimulationResult, SimulationParams } from "../types";

// --- TYPES ---
export interface WeatherResponse {
  hourlyTemp: number[];
  hourlyHumidity: number[];
  hourlyCloud: number[];
  sunriseHour: number;
  sunsetHour: number;
  meta: {
    date: string;
    source: string;
    lastUpdated: string;
    isFallback: boolean;
  };
  error?: string;
}

// --- LLM HELPERS ---

/**
 * Formats the simulation results into a compact JSON string for the LLM.
 */
const formatDataForPrompt = (result: SimulationResult, params: SimulationParams): string => {
  const avgCloud = params.hourlyCloud.reduce((sum, val) => sum + val, 0) / params.hourlyCloud.length;
  const avgTemp = params.hourlyTemp.reduce((sum, val) => sum + val, 0) / params.hourlyTemp.length;

  const summary = {
    meta: {
      project: "GridPilot X",
      node: "AGRA-DEI",
      scenario: params.scenario,
      weather: params.weather,
      cloudCoverAvg: avgCloud.toFixed(1),
      tempCAvg: avgTemp.toFixed(1),
    },
    audit: result.audit,
    telemetry: result.hourlyData.map(h => ({
      t: h.hour,
      load: parseFloat(h.adjustedLoadMW.toFixed(3)),
      gen: parseFloat(h.solarMW.toFixed(3)),
      grid_in: parseFloat(h.gridImportMW.toFixed(3)),
      grid_out: parseFloat(h.gridExportMW.toFixed(3)),
      batt: parseFloat(h.batteryFlowMW.toFixed(3)),
      soc: Math.round(h.socStatePercent),
      price: h.priceINR
    }))
  };
  return JSON.stringify(summary);
};

// --- MAIN AI ANALYSIS FUNCTION ---

export const analyzeSimulation = async (result: SimulationResult, params: SimulationParams): Promise<string> => {
  const apiKey = process.env.API_KEY; // Only needed for Gemini Analysis, not weather
  if (!apiKey) {
    return "<div class='p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 font-mono text-xs'>[SYSTEM ERROR] CRITICAL: Node connectivity failure. API Key not detected.</div>";
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    **Role:** Lead Microgrid Systems Engineer.
    **Objective:** Perform a Gap Analysis & Power Quality Audit for Agra Node.
    
    **REQUIRED OUTPUT (HTML Only):**
    1. **Daily Scheduling Algorithm Output:** Concisely list the 24h plan.
    2. **Cost-Optimal Timeline:** Horizontal flexbox timeline.
    3. **Scope of Improvement:** 2 concrete suggestions.

    **Context Data:** ${formatDataForPrompt(result, params)}

    **Styling Rules:** Industrial Light theme. No Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Use 'gemini-1.5-flash' if 2.0 is not yet available in your region
      contents: prompt,
      config: { temperature: 0.2 }
    });

    if (!response || !response.text) throw new Error("Empty response from AI");
    return response.text.replace(/```html/g, '').replace(/```/g, '').trim();
  } catch (error) {
    return `<div class="p-6 bg-slate-50 border border-brand-border rounded-lg text-brand-text">Analysis Unavailable. Error: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
};

// --- OFFLINE FALLBACK DATA (AGRA SPECIFIC) ---

const generateAgraForecast = () => {
  const today = new Date();
  
  // Agra Physics Constants (Feb/March)
  const AGRA_BASE = [
    { dayOffset: 0, condition: "Clear", maxT: 28.5, minT: 12.4, humidBase: 45, cloudProfile: "CLEAR", sunR: 6.72, sunS: 18.25 },
    { dayOffset: 1, condition: "Hazy Sun", maxT: 29.1, minT: 13.1, humidBase: 50, cloudProfile: "HAZY", sunR: 6.70, sunS: 18.27 },
    { dayOffset: 2, condition: "Sunny", maxT: 30.2, minT: 13.5, humidBase: 40, cloudProfile: "CLEAR", sunR: 6.68, sunS: 18.28 },
    { dayOffset: 3, condition: "Partly Cloudy", maxT: 27.8, minT: 14.2, humidBase: 55, cloudProfile: "AFTERNOON_BUILDUP", sunR: 6.67, sunS: 18.30 },
    { dayOffset: 4, condition: "Cloudy", maxT: 26.5, minT: 15.1, humidBase: 65, cloudProfile: "OVERCAST", sunR: 6.65, sunS: 18.32 },
    { dayOffset: 5, condition: "Clear", maxT: 28.0, minT: 13.0, humidBase: 42, cloudProfile: "CLEAR", sunR: 6.63, sunS: 18.33 },
    { dayOffset: 6, condition: "Sunny", maxT: 29.5, minT: 13.8, humidBase: 38, cloudProfile: "CLEAR", sunR: 6.62, sunS: 18.35 },
    { dayOffset: 7, condition: "Hazy", maxT: 31.0, minT: 14.5, humidBase: 48, cloudProfile: "HAZY", sunR: 6.60, sunS: 18.37 },
    { dayOffset: 8, condition: "Warm", maxT: 32.2, minT: 15.0, humidBase: 35, cloudProfile: "CLEAR", sunR: 6.58, sunS: 18.38 },
    { dayOffset: 9, condition: "Hot/Dry", maxT: 33.5, minT: 16.2, humidBase: 30, cloudProfile: "CLEAR", sunR: 6.57, sunS: 18.40 },
  ];

  return AGRA_BASE.map(day => {
    const date = new Date(today);
    date.setDate(today.getDate() + day.dayOffset);
    return { ...day, date: date.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) };
  });
};

const getAgraOfflineData = (index: number = 0): WeatherResponse => {
  const forecast = generateAgraForecast();
  const profile = forecast[index] || forecast[0];

  const hourlyTemp = Array.from({ length: 24 }, (_, h) => {
    const t = h;
    const weight = (1 - Math.cos((t - 5) * 2 * Math.PI / 24)) / 2;
    const temp = profile.minT + (profile.maxT - profile.minT) * weight;
    return parseFloat(temp.toFixed(1));
  });

  const hourlyHumidity = hourlyTemp.map(t => {
    const factor = (t - profile.minT) / (profile.maxT - profile.minT);
    const h = profile.humidBase + 30 * (1 - factor); 
    return Math.max(10, Math.min(95, parseFloat(h.toFixed(1))));
  });

  const hourlyCloud = Array.from({ length: 24 }, (_, h) => {
    let cloud = 0;
    if (profile.cloudProfile === "CLEAR") cloud = Math.random() * 5;
    else if (profile.cloudProfile === "HAZY") cloud = 10 + (Math.random() * 10);
    else if (profile.cloudProfile === "OVERCAST") cloud = 70 + (Math.random() * 20);
    else if (profile.cloudProfile === "AFTERNOON_BUILDUP") {
       if (h >= 12 && h <= 18) {
          const peak = 15;
          const dist = Math.abs(h - peak);
          cloud = 40 * (1 - dist/4) + (Math.random() * 15);
       } else cloud = Math.random() * 10;
    }
    return Math.max(0, Math.min(100, parseFloat(cloud.toFixed(1))));
  });

  return {
    hourlyTemp,
    hourlyHumidity,
    hourlyCloud,
    sunriseHour: profile.sunR,
    sunsetHour: profile.sunS,
    meta: {
      date: profile.date,
      source: "Agra Offline Database (Baseline)",
      lastUpdated: new Date().toLocaleTimeString(),
      isFallback: true
    }
  };
};

// --- NEW WEATHER FETCHING LOGIC ---

/**
 * 1. Open-Meteo (KEYLESS/FREE)
 * Fetches accurate hourly data for Agra coordinates.
 */
const fetchFromOpenMeteo = async (): Promise<WeatherResponse> => {
  // Agra Coordinates: 27.1767° N, 78.0081° E
  const url = "https://api.open-meteo.com/v1/forecast?latitude=27.1767&longitude=78.0081&hourly=temperature_2m,relative_humidity_2m,cloud_cover&daily=sunrise,sunset&timezone=Asia%2FKolkata&forecast_days=1";
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenMeteo Error: ${res.statusText}`);
  
  const data = await res.json();
  const daily = data.daily;
  
  // Helper to convert ISO time to decimal hour
  const getHour = (iso: string) => {
    const d = new Date(iso);
    return parseFloat((d.getHours() + d.getMinutes() / 60).toFixed(2));
  };

  return {
    hourlyTemp: data.hourly.temperature_2m.slice(0, 24),
    hourlyHumidity: data.hourly.relative_humidity_2m.slice(0, 24),
    hourlyCloud: data.hourly.cloud_cover.slice(0, 24),
    sunriseHour: getHour(daily.sunrise[0]),
    sunsetHour: getHour(daily.sunset[0]),
    meta: {
      date: new Date().toLocaleDateString('en-IN'),
      source: "Open-Meteo (Free/Live)",
      lastUpdated: new Date().toLocaleTimeString(),
      isFallback: false
    }
  };
};

/**
 * 2. WeatherAPI.com (REQUIRES KEY)
 * Optional: Used if you specifically provide WEATHER_API_KEY in .env
 */
const fetchFromWeatherAPI = async (key: string): Promise<WeatherResponse> => {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=Agra&days=1&aqi=no&alerts=no`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WeatherAPI Error: ${res.statusText}`);
  
  const data = await res.json();
  const forecast = data.forecast.forecastday[0];
  const hours = forecast.hour;

  // Helper to parse "06:34 AM"
  const parseTimeStr = (timeStr: string): number => {
    const [time, period] = timeStr.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return parseFloat((h + m / 60).toFixed(2));
  };

  return {
    hourlyTemp: hours.map((h: any) => h.temp_c),
    hourlyHumidity: hours.map((h: any) => h.humidity),
    hourlyCloud: hours.map((h: any) => h.cloud),
    sunriseHour: parseTimeStr(forecast.astro.sunrise),
    sunsetHour: parseTimeStr(forecast.astro.sunset),
    meta: {
      date: data.location.localtime.split(' ')[0],
      source: "WeatherAPI.com (Live)",
      lastUpdated: new Date().toLocaleTimeString(),
      isFallback: false
    }
  };
};

/**
 * MAIN EXPORTED FUNCTION
 * Priority Order:
 * 1. WeatherAPI (Only if you added the key)
 * 2. Open-Meteo (Default - Best Free Option, No Key)
 * 3. Offline Data (Safety Fallback)
 */
export const fetchHourlyWeather = async (): Promise<WeatherResponse> => {
  const weatherKey = process.env.WEATHER_API_KEY;

  try {
    // Priority 1: WeatherAPI (if configured)
    if (weatherKey) {
      return await fetchFromWeatherAPI(weatherKey);
    }

    // Priority 2: Open-Meteo (No Key Needed)
    // console.log("Fetching from Open-Meteo...");
    return await fetchFromOpenMeteo();

  } catch (error) {
    console.warn("Weather Fetch Warning:", error);
    
    // Priority 3: Offline Database
    return { 
      ...getAgraOfflineData(0), 
      error: error instanceof Error ? error.message : "Fetch Failed" 
    };
  }
};
