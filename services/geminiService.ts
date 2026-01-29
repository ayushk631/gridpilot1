import { GoogleGenAI, Type } from "@google/genai";
import { SimulationResult, SimulationParams } from "../types";

/**
 * Formats the simulation results into a compact JSON string for the LLM.
 */
const formatDataForPrompt = (result: SimulationResult, params: SimulationParams): string => {
  const avgCloud = params.hourlyCloud.reduce((sum, val) => sum + val, 0) / params.hourlyCloud.length;
  const avgTemp = params.hourlyTemp.reduce((sum, val) => sum + val, 0) / params.hourlyTemp.length;

  const summary = {
    meta: {
      project: "GridPilot X",
      node: "AGRA",
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
      aux: parseFloat(h.dieselMW.toFixed(3)),
      batt: parseFloat(h.batteryFlowMW.toFixed(3)),
      soc: Math.round(h.socStatePercent),
      state: h.batteryReason,
      price: h.priceINR
    }))
  };
  return JSON.stringify(summary);
};

/**
 * Analyzes the simulation data using Gemini 3.
 */
export const analyzeSimulation = async (result: SimulationResult, params: SimulationParams): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return "<div class='p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 font-mono text-xs'>[SYSTEM ERROR] CRITICAL: Node connectivity failure. API Key not detected in environment. Check .env file.</div>";
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    **Role:** Lead Microgrid Systems Engineer for GridPilot X.
    **Objective:** Perform a Gap Analysis & Power Quality Audit.
    
    **REQUIRED OUTPUT (HTML Only):**
    1. **Daily Scheduling Algorithm Output:** Concisely list the 24h plan (Charge/Discharge/Grid/Diesel).
    2. **Scheduler Logic Transparency:** Format as "Hour X: [Event] -> [Reasoning]".
    3. **Cost-Optimal Timeline:** Create a horizontal flexbox timeline with colored bars for dominant activities.
    4. **Scope of Improvement:** Provide 2 concrete technical suggestions.

    **Context Data:** ${formatDataForPrompt(result, params)}

    **Styling Rules:** Use Industrial Light theme (white bg, slate-900 text). Use Tailwind-like HTML classes. No Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.2 }
    });

    if (!response || !response.text) throw new Error("Empty response from AI");
    return response.text.replace(/```html/g, '').replace(/```/g, '').trim();
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return `<div class="p-6 bg-slate-50 border border-brand-border rounded-lg text-brand-text">Analysis Unavailable. Error: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
};

/**
 * PRE-SAVED WEATHER DATASETS (10-Day Horizon)
 * Fallback data if API fails.
 */
const WEATHER_PRESETS = [
  { name: "Clear Summer Day", maxT: 38.2, minT: 26.4, cloud: 5, humid: 35, sunrise: 5 + 43/60, sunset: 18 + 52/60 },     // 05:43, 18:52
  { name: "Partly Cloudy", maxT: 35.5, minT: 25.1, cloud: 35, humid: 55, sunrise: 5 + 48/60, sunset: 18 + 41/60 },        // 05:48, 18:41
  { name: "Overcast/Humid", maxT: 31.8, minT: 27.5, cloud: 85, humid: 75, sunrise: 6 + 2/60, sunset: 18 + 29/60 },        // 06:02, 18:29
  { name: "Heatwave Alert", maxT: 44.1, minT: 30.2, cloud: 0, humid: 20, sunrise: 5 + 37/60, sunset: 19 + 4/60 },         // 05:37, 19:04
  { name: "Monsoon Rain", maxT: 28.6, minT: 24.8, cloud: 95, humid: 92, sunrise: 6 + 8/60, sunset: 18 + 22/60 },          // 06:08, 18:22
  { name: "Post-Rain Clear", maxT: 32.4, minT: 23.3, cloud: 15, humid: 60, sunrise: 6 + 3/60, sunset: 18 + 33/60 },       // 06:03, 18:33
  { name: "Dust Storm/Hazy", maxT: 36.9, minT: 28.7, cloud: 40, humid: 45, sunrise: 6 + 11/60, sunset: 18 + 39/60 },      // 06:11, 18:39
  { name: "Mild Spring", maxT: 29.5, minT: 18.2, cloud: 10, humid: 40, sunrise: 6 + 27/60, sunset: 18 + 4/60 },           // 06:27, 18:04
  { name: "Windy Transition", maxT: 33.1, minT: 22.8, cloud: 25, humid: 50, sunrise: 6 + 14/60, sunset: 18 + 27/60 },     // 06:14, 18:27
  { name: "Winter Start", maxT: 25.2, minT: 12.5, cloud: 20, humid: 45, sunrise: 6 + 58/60, sunset: 17 + 34/60 },         // 06:58, 17:34
];

/**
 * Generate fallback data locally
 */
const getFallbackWeather = (): {
  hourlyTemp: number[];
  hourlyHumidity: number[];
  hourlyCloud: number[];
  sunriseHour: number;
  sunsetHour: number;
  isFallback: boolean;
  error?: string;
} => {
  const profile = WEATHER_PRESETS[Math.floor(Math.random() * WEATHER_PRESETS.length)];
  
  const hourlyTemp = Array.from({ length: 24 }, (_, h) => {
    const peakHour = 14; 
    const normalizedDiff = (h - peakHour) / 12;
    return ((profile.maxT + profile.minT) / 2) + ((profile.maxT - profile.minT) / 2) * Math.cos(normalizedDiff * Math.PI);
  });

  const hourlyHumidity = hourlyTemp.map(t => {
      const factor = (t - profile.minT) / (profile.maxT - profile.minT || 1); 
      return Math.max(20, Math.min(95, profile.humid + (0.5 - factor) * 30));
  });

  const hourlyCloud = Array.from({ length: 24 }, (_, h) => {
      const variation = Math.random() * 20 - 10;
      return Math.max(0, Math.min(100, profile.cloud + variation));
  });

  return {
    hourlyTemp,
    hourlyHumidity,
    hourlyCloud,
    sunriseHour: profile.sunrise,
    sunsetHour: profile.sunset,
    isFallback: true,
    error: "Local Fallback Used"
  };
};

/**
 * Single API Request Weather Fetcher
 */
export const fetchHourlyWeather = async (): Promise<{
  hourlyTemp: number[];
  hourlyHumidity: number[];
  hourlyCloud: number[];
  sunriseHour: number;
  sunsetHour: number;
  isFallback: boolean;
  error?: string;
}> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return getFallbackWeather();

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Generate a realistic hourly weather profile for a standard day in Agra, India.
        I need 24 data points for Temperature, Humidity, and Cloud Cover.
        Also need realistic precise sunrise and sunset times (e.g. 6.23 for 6:14am).
        Values should be realistic for the region (e.g. Temp 20-40C, Humid 30-80%).
        Avoid overly perfect curves, add some organic variation.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hourlyTemp: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER },
              description: "24 hourly temperature values in Celsius"
            },
            hourlyHumidity: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER },
              description: "24 hourly humidity values in %"
            },
            hourlyCloud: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER },
              description: "24 hourly cloud cover values in % (0-100)"
            },
            sunriseHour: { 
              type: Type.NUMBER, 
              description: "Sunrise time in decimal hours (e.g. 6.45)" 
            },
            sunsetHour: { 
              type: Type.NUMBER,
              description: "Sunset time in decimal hours (e.g. 18.75)" 
            }
          },
          required: ["hourlyTemp", "hourlyHumidity", "hourlyCloud", "sunriseHour", "sunsetHour"]
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      
      // Basic validation
      if (data.hourlyTemp.length === 24 && data.hourlyHumidity.length === 24) {
         return {
           hourlyTemp: data.hourlyTemp,
           hourlyHumidity: data.hourlyHumidity,
           hourlyCloud: data.hourlyCloud,
           sunriseHour: data.sunriseHour,
           sunsetHour: data.sunsetHour,
           isFallback: false
         };
      }
    }
    
    throw new Error("Invalid API Response Structure");

  } catch (error: any) {
    console.warn("Weather API Request Failed:", error);
    // Silent failover to fallback data as requested
    return { ...getFallbackWeather(), error: error.message || "API Error" };
  }
};