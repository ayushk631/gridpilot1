import { GoogleGenAI, Type } from "@google/genai";
import { SimulationResult, SimulationParams } from "../types";

// --- TYPES ---
interface WeatherResponse {
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

export const analyzeSimulation = async (result: SimulationResult, params: SimulationParams): Promise<string> => {
  const apiKey = process.env.API_KEY;
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
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.2 }
    });

    if (!response || !response.text) throw new Error("Empty response from AI");
    return response.text.replace(/```html/g, '').replace(/```/g, '').trim();
  } catch (error) {
    return `<div class="p-6 bg-slate-50 border border-brand-border rounded-lg text-brand-text">Analysis Unavailable. Error: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
};

/**
 * 10-DAY FORECAST DATA FOR AGRA, INDIA
 * Realistic baseline values for Agra (Feb-March context).
 * Stored in code as requested.
 */
const generateAgraForecast = () => {
  const today = new Date();
  
  // Agra Physics Constants (Feb/March)
  // Sunrise approx 6:40 AM - 6:50 AM
  // Sunset approx 6:10 PM - 6:20 PM
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
  const profile = forecast[index] || forecast[0]; // Default to today

  // Generate Hourly Curves based on Physics limits
  const hourlyTemp = Array.from({ length: 24 }, (_, h) => {
    // Sinusoidal diurnal cycle for Agra
    // Min temp at 5 AM, Max temp at 3 PM (15:00)
    const t = h;
    const weight = (1 - Math.cos((t - 5) * 2 * Math.PI / 24)) / 2;
    const temp = profile.minT + (profile.maxT - profile.minT) * weight;
    return parseFloat(temp.toFixed(1));
  });

  const hourlyHumidity = hourlyTemp.map(t => {
    // Inverse relationship to temp
    const factor = (t - profile.minT) / (profile.maxT - profile.minT);
    const h = profile.humidBase + 30 * (1 - factor); 
    return Math.max(10, Math.min(95, parseFloat(h.toFixed(1))));
  });

  const hourlyCloud = Array.from({ length: 24 }, (_, h) => {
    // Refined Cloud Profiles
    let cloud = 0;
    
    if (profile.cloudProfile === "CLEAR") {
       cloud = Math.random() * 5; // 0-5% noise
    } else if (profile.cloudProfile === "HAZY") {
       cloud = 10 + (Math.random() * 10); // 10-20% flat
    } else if (profile.cloudProfile === "OVERCAST") {
       cloud = 70 + (Math.random() * 20); // 70-90%
    } else if (profile.cloudProfile === "AFTERNOON_BUILDUP") {
       // Clear morning, buildup in afternoon (12PM - 6PM), clear night
       if (h >= 12 && h <= 18) {
          const peak = 15; // 3 PM
          const dist = Math.abs(h - peak);
          cloud = 40 * (1 - dist/4) + (Math.random() * 15);
       } else {
          cloud = Math.random() * 10;
       }
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

/**
 * Fetch Hourly Weather - Priorities:
 * 1. Live API (Google Search Grounded)
 * 2. Fallback to Hardcoded Agra Database
 */
export const fetchHourlyWeather = async (): Promise<WeatherResponse> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return getAgraOfflineData(0);

  const ai = new GoogleGenAI({ apiKey });
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  try {
    // Enhanced Prompt: Uses Google Search to find real data
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Task: Get the precise hourly weather forecast for **Agra, Uttar Pradesh, India** for today (${todayStr}).
        
        Use Google Search to find a reliable hourly forecast (e.g., from Weather.com, AccuWeather, IMD, or Skymet).
        
        Specifically look for:
        1. **Hourly Temperature** (°C)
        2. **Hourly Cloud Cover** (%). 
           *CRITICAL*: If specific % is not listed, map descriptions to these values:
           - Sunny/Clear: 0-5%
           - Mostly Sunny: 10-25%
           - Partly Cloudy: 30-50%
           - Mostly Cloudy: 60-80%
           - Overcast: 90-100%
           *Do not return a flat 0% array unless the forecast explicitly says "Clear" for all 24 hours.*
        3. **Hourly Humidity** (%)

        Return a JSON object with exactly 24 data points for each (00:00 to 23:00).
      `,
      config: {
        tools: [{ googleSearch: {} }], // Enable Search Tool
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hourlyTemp: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            hourlyHumidity: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            hourlyCloud: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            sunriseHour: { type: Type.NUMBER, description: "Decimal hour (e.g. 6.7)" },
            sunsetHour: { type: Type.NUMBER, description: "Decimal hour (e.g. 18.2)" },
            sourceName: { type: Type.STRING, description: "The specific website or source found (e.g. 'Weather.com via Google')" }
          },
          required: ["hourlyTemp", "hourlyHumidity", "hourlyCloud", "sunriseHour", "sunsetHour", "sourceName"]
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      if (data.hourlyTemp && data.hourlyTemp.length === 24) {
         
         // Extract source from grounding metadata if available, else use model's string
         let source = data.sourceName || "Google Weather / Gemini Live";
         if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            const chunks = response.candidates[0].groundingMetadata.groundingChunks;
            const webSource = chunks.find((c: any) => c.web?.title);
            if (webSource) source = webSource.web.title;
         }

         return {
           hourlyTemp: data.hourlyTemp,
           hourlyHumidity: data.hourlyHumidity,
           hourlyCloud: data.hourlyCloud,
           sunriseHour: data.sunriseHour,
           sunsetHour: data.sunsetHour,
           meta: {
             date: todayStr,
             source: source.substring(0, 25), // Truncate for UI
             lastUpdated: new Date().toLocaleTimeString(),
             isFallback: false
           }
         };
      }
    }
    throw new Error("Invalid API Data Structure");

  } catch (error: any) {
    console.warn("Weather API Failed, using Agra Offline DB:", error);
    return { 
      ...getAgraOfflineData(0), 
      error: error.message || "API Error" 
    };
  }
};
