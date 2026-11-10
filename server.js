const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "data.json");

function load() {
  try { return JSON.parse(fs.readFileSync(DB, "utf8")); } catch { return []; }
}
function save(rides) { fs.writeFileSync(DB, JSON.stringify(rides, null, 2)); }

const RATES = {
  auto: { base: 30, perKm: 14, label: "Auto" },
  bike: { base: 20, perKm: 8, label: "Bike" },
  cab:  { base: 50, perKm: 18, label: "Cab" }
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/rates", (_req, res) => res.json(RATES));

app.get("/api/rides", (_req, res) => res.json(load().reverse()));

app.post("/api/rides", (req, res) => {
  const { pickup, drop, vehicle, km } = req.body || {};
  const distance = Number(km);
  if (!pickup?.trim() || !drop?.trim()) return res.status(400).json({ error: "Pickup aur drop dono likho." });
  if (!RATES[vehicle]) return res.status(400).json({ error: "Vehicle choose karo." });
  if (!(distance > 0 && distance <= 500)) return res.status(400).json({ error: "Distance 1 se 500 km ke beech ho." });

  const r = RATES[vehicle];
  const rides = load();
  const ride = {
    id: Date.now().toString(36),
    pickup: pickup.trim().slice(0, 100),
    drop: drop.trim().slice(0, 100),
    vehicle,
    km: distance,
    fare: Math.round(r.base + r.perKm * distance),
    status: "booked",
    createdAt: new Date().toISOString()
  };
  rides.push(ride);
  save(rides);
  res.status(201).json(ride);
});

app.patch("/api/rides/:id/cancel", (req, res) => {
  const rides = load();
  const ride = rides.find(x => x.id === req.params.id);
  if (!ride) return res.status(404).json({ error: "Ride nahi mili." });
  ride.status = "cancelled";
  save(rides);
  res.json(ride);
});

app.listen(PORT, () => console.log("Sawari running on port " + PORT));
