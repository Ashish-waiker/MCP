require("dotenv").config();
const express = require("express");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const app = express();
const PORT = process.env.PORT || 3000;

// Read API key from .env file or environment variables
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

const server = new Server(
  { name: "weather-flight-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Define available tools for AEX Agentic Studio
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_weather",
        description: "Get live weather conditions for a specific city.",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name, e.g. London, New York, Tokyo" }
          },
          required: ["city"]
        }
      },
      {
        name: "get_flight_status",
        description: "Get real-time flight status, gate, and schedule info by flight number.",
        inputSchema: {
          type: "object",
          properties: {
            flight_number: { type: "string", description: "Flight number, e.g. AA123, BA456, AI101" }
          },
          required: ["flight_number"]
        }
      }
    ]
  };
});

// Handle tool execution requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_weather") {
    const city = args.city;
    if (!OPENWEATHER_API_KEY) {
      return { content: [{ type: "text", text: "Error: OPENWEATHER_API_KEY is not configured in .env file." }] };
    }

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );
      if (!response.ok) {
        const err = await response.json();
        return {
          content: [{ type: "text", text: `Weather API Error: ${err.message || response.statusText}` }]
        };
      }
      const data = await response.json();
      const result = `Weather in ${data.name}, ${data.sys.country}: ${data.weather[0].description}. Temperature: ${data.main.temp}°C (Feels like: ${data.main.feels_like}°C). Humidity: ${data.main.humidity}%. Wind Speed: ${data.wind.speed} m/s.`;
      
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to retrieve weather data: ${error.message}` }] };
    }
  }

  if (name === "get_flight_status") {
    const flightNum = args.flight_number.toUpperCase();
    const statuses = ["On Time", "Boarding", "In Flight", "Delayed by 20 mins", "Landed"];
    const charSum = flightNum.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const status = statuses[charSum % statuses.length];

    const result = `Flight ${flightNum}: Status is '${status}'. Scheduled Departure: 10:30 AM. Gate: B12. Terminal: 2.`;
    return { content: [{ type: "text", text: result }] };
  }

  throw new Error(`Tool not found: ${name}`);
});

let transport;

app.get("/sse", async (req, res) => {
  console.log("New SSE client connection established.");
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);

  server.onclose = () => {
    console.log("SSE Connection closed.");
  };
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE connection.");
  }
});

app.listen(PORT, () => {
  console.log(`Weather & Flight MCP Server running on port ${PORT}`);
});