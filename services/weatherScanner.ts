import { GoogleGenAI, Type } from "@google/genai";

interface ScannedWeatherData {
  hourlyTemp: number[];
  hourlyHumidity: number[];
  hourlyCloud: number[];
}

const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Handle both data:URL with and without prefix for safety
      const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
      resolve({
        inlineData: { data: base64Data, mimeType: file.type },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const parseWeatherGraph = async (file: File): Promise<ScannedWeatherData> => {
  // Use the main Gemini API Key (for Vision/LLM tasks)
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("Vision Scanner: API Key missing.");
    return createFallbackProfile();
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const imagePart = await fileToGenerativePart(file);
    
    // Improved Prompt: Explicitly asks for interpolation if data points are sparse
    const prompt = `
      **Role:** Expert Meteorological Data Analyst.
      **Task:** Extract hourly weather data from this graph/chart for a 24-hour period (00:00 to 23:00).
      
      **Requirements:**
      1. **Temperature (°C):** Trace the temperature curve carefully.
      2. **Humidity (%):** Trace the humidity curve.
      3. **Cloud Cover (%):** Look for cloud icons, bars, or a specific curve. If NO cloud data is visible, return an array of zeros.
      
      **Critical:** If the graph only shows points every few hours (e.g. 3h, 6h), **INTERPOLATE linearly** to generate exactly 24 hourly data points.

      **Output:**
      Return a raw JSON object with keys: "hourlyTemp", "hourlyHumidity", "hourlyCloud".
      Each must be an array of exactly 24 numbers.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Updated to latest stable vision model
      contents: {
        parts: [imagePart, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hourlyTemp: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            hourlyHumidity: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            hourlyCloud: { type: Type.ARRAY, items: { type: Type.NUMBER } }
          },
          required: ["hourlyTemp", "hourlyHumidity", "hourlyCloud"]
        }
      }
    });

    if (!response || !response.text) throw new Error("Vision parser returned no content.");
    
    const data = JSON.parse(response.text);

    return {
      hourlyTemp: normalizeArray(data.hourlyTemp, 25),
      hourlyHumidity: normalizeArray(data.hourlyHumidity, 50),
      hourlyCloud: normalizeArray(data.hourlyCloud, 0)
    };
  } catch (error) {
    console.error("GridPilot X Vision Error:", error);
    return createFallbackProfile();
  }
};

// --- Helpers ---

const normalizeArray = (arr: any[], fillValue: number): number[] => {
  if (!Array.isArray(arr)) return Array(24).fill(fillValue);
  const result = [...arr];
  
  // Fill if short (pad with last known value)
  while (result.length < 24) {
    result.push(result[result.length - 1] ?? fillValue);
  }
  
  // Trim if long and ensure numbers
  return result.slice(0, 24).map(n => {
    const num = Number(n);
    return isNaN(num) ? fillValue : num;
  });
};

const createFallbackProfile = (): ScannedWeatherData => ({
  hourlyTemp: Array(24).fill(25),
  hourlyHumidity: Array(24).fill(50),
  hourlyCloud: Array(24).fill(0)
});
