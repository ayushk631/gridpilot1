# ⚡ GridPilot X-7: Smart Microgrid Optimization Engine

![Project Status](https://img.shields.io/badge/Status-Prototype-green)
![Tech Stack](https://img.shields.io/badge/Stack-React_19_|_Tailwind-blue)
![AI Power](https://img.shields.io/badge/AI-Gemini_Flash-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

> **Target Node:** Agra  
> **Mission:** Stress-testing renewable infrastructure against weather anomalies, grid outages, and dynamic market pricing.

## 📖 Executive Summary
**GridPilot X-7** is a high-precision digital twin designed to simulate the physics and economics of a renewable microgrid. Unlike simple calculators, it combines a **deterministic physics engine** (for battery degradation, solar de-rating, and load flow) with a **probabilistic AI layer** (Neural Strategist) to provide actionable intelligence for energy operators.

It answers the critical question: *"Can this campus survive a 48°C heatwave during a grid blackout without burning diesel?"*

---

## 🚀 Key Features

### 1. 🌍 Physics-First Simulation
* **Solar Modeling:** Real-time generation curves calibrated with Sunrise/Sunset data.
* **Thermal De-rating:** Simulates physical efficiency loss (0.4% per °C) during Agra's high-temperature summers.
* **Multi-Pass Stability:** Runs 3 simulation cycles to ensure the battery "End of Day" State of Charge (SoC) matches the "Start of Day."

### 2. 🧠 Neural Strategist (AI Layer)
* Powered by **Google Gemini 1.5 Flash**.
* Ingests raw simulation telemetry (JSON) to generate strategic HTML reports.
* Identifies "Critical Stress Hours" and suggests specific **Load Shedding %** to prevent blackouts.

### 3. ⚡ Grid Scenarios & Stress Testing
* **Normal Mode:** Grid-tied operation for cost reduction.
* **Islanded Mode:** Simulates 100% off-grid operation (Solar + Battery + Diesel only).
* **Heatwave:** Applies a **1.35x Load Multiplier** to simulate peak HVAC usage.
* **Grid Blockers:** Allows operators to define specific outage windows (e.g., 12:00 PM - 2:00 PM) to test resilience.

### 4. 💰 Economic Engine
* **Arbitrage Logic:** Buys power when cheap (Off-Peak) and discharges battery when expensive (Peak).
* **Dynamic Tariffs:** Hardcoded support for UPPCL Time-of-Day (ToD) billing.
* **ROI Calculator:** Compares Microgrid costs vs. Baseline Grid dependence.

---

## ⚙️ Logic & Architecture

The system operates on a **Priority-Based Dispatch Hierarchy**:

1.  **Solar & Profit:** If solar is abundant, it powers the load, fills the battery, and **sells the excess** to the grid.
2.  **Smart Savings:** During peak tariff hours, the system drains the battery to avoid expensive grid imports.
3.  **Smart Charging:** During off-peak hours (night), it **buys cheap grid power** to recharge the battery.
4.  **Critical Backup:** If Solar, Battery, and Grid all fail (or during a blackout), the **Diesel Generator** activates as a last resort.

---

## 🛠️ Technical Stack

* **Frontend:** React 19 (Vite), TypeScript
* **Styling:** Tailwind CSS, Lucide-React Icons
* **AI Integration:** Google Generative AI SDK (Gemini)
* **Simulation Logic:** Custom Discrete-Time Simulation Engine (24h cycle / 1h steps)
* **Visualization:** Recharts (for Load vs. Generation graphs)

---

## 💻 Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/your-username/gridpilot-x7.git](https://github.com/your-username/gridpilot-x7.git)
    cd gridpilot-x7
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**
    Create a `.env.local` file in the root directory and add your Gemini API key:
    ```env
    VITE_GEMINI_API_KEY=your_actual_api_key_here
    ```

4.  **Run the Simulation**
    ```bash
    npm run dev
    ```

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).

---

**Developed by [Your Name]** *Dept. of Electrical Engineering, Dayalbagh Educational Institute*
