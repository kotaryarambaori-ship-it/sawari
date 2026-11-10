const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "data.json");

// ---------- Storage (JSON file, koi native package nahi) ----------
function load() {
  try { return JSON.parse(fs.readFileSync(DB, "utf8")); } catch { return []; }
}
function save(rides) { fs.writeFileSync(DB, JSON.stringify(rides, null, 2)); }

// ---------- Rates ----------
const RATES = {
  auto: { base: 30, perKm: 14, label: "Auto" },
  bike: { base: 20, perKm: 8, label: "Bike" },
  cab:  { base: 50, perKm: 18, label: "Cab" }
};

// ---------- Demo drivers (baad mein real data se badal sakte ho) ----------
const DRIVERS = [
  { id: 1, name: "Ramesh", vehicle: "auto", available: true,  distanceKm: 0.8 },
  { id: 2, name: "Suresh", vehicle: "auto", available: false, distanceKm: 1.5 },
  { id: 3, name: "Mohan",  vehicle: "auto", available: true,  distanceKm: 2.3 },
  { id: 4, name: "Vijay",  vehicle: "bike", available: true,  distanceKm: 1.1 },
  { id: 5, name: "Anil",   vehicle: "cab",  available: false, distanceKm: 3.0 }
];

app.use(express.json());

// ---------- index.html root ya public, dono jagah chalega ----------
const publicDir = path.join(__dirname, "public");
const indexFile = fs.existsSync(path.join(publicDir, "index.html"))
  ? path.join(publicDir, "index.html")
  : path.join(__dirname, "index.html");

app.use(express.static(publicDir));
app.get("/", (_req, res) => res.sendFile(indexFile));

// ---------- Find: auto mili ya nahi ----------
function findHandler(req, res) {
  const vehicle = req.query.vehicle || (req.body && req.body.vehicle) || "auto";
  const free = DRIVERS
    .filter(d => d.vehicle === vehicle && d.available)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!free.length) {
    return res.json({
      found: false,
      message: "Abhi koi " + vehicle + " nahi mili. Thodi der baad try karo."
    });
  }
  const d = free[0];
  res.json({
    found: true,
    count: free.length,
    driver: d,
    message: d.name + " " + d.distanceKm + " km door hai."
  });
}

// Kai common naam, taaki index jo bhi call kare chal jaye
["/api/find", "/api/autos", "/api/drivers", "/api/drivers/find", "/find"].forEach(p => {
  app.get(p, findHandler);
  app.post(p, findHandler);
});

// ---------- Rates ----------
app.get("/api/rates", (_req, res) => res.json(RATES));

// ---------- Rides ----------
app.get("/api/rides", (_req, res) => res.json(load().reverse()));

app.post("/api/rides", (req, res) => {
  const { pickup, drop, vehicle, km } = req.body || {};
  const distance = Number(km);
  if (!pickup || !pickup.trim() || !drop || !drop.trim())
    return res.status(400).json({ error: "Pickup aur drop dono likho." });
  if (!RATES[vehicle])
    return res.status(400).json({ error: "Vehicle choose karo." });
  if (!(distance > 0 && distance <= 500))
    return res.status(400).json({ error: "Distance 1 se 500 km ke beech ho." });

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

// ---------- Start ----------
app.listen(PORT, () => console.log("Sawari running on port " + PORT));
