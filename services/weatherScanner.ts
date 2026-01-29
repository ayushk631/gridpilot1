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
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("Vision Scanner: API Key missing.");
    return createFallbackProfile();
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const imagePart = await fileToGenerativePart(file);
    const prompt = `
      Analyze this weather graph/chart. 
      I need 24 hourly data points (00:00 to 23:00) for:
      1. Temperature (Celsius)
      2. Humidity (%)
      3. Cloud Cover (%) (If not shown, assume 0)

      Return a raw JSON object with keys: "hourlyTemp", "hourlyHumidity", "hourlyCloud".
      Each must be an array of exactly 24 numbers.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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

    if (!response.text) throw new Error("Vision parser returned no content.");
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
  // Fill if short
  while (result.length < 24) {
    result.push(result[result.length - 1] ?? fillValue);
  }
  // Trim if long
  return result.slice(0, 24).map(n => Number(n) || fillValue);
};

const createFallbackProfile = (): ScannedWeatherData => ({
  hourlyTemp: Array(24).fill(25),
  hourlyHumidity: Array(24).fill(50),
  hourlyCloud: Array(24).fill(0)
});