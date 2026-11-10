const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const RIDES_DB = path.join(__dirname, "data.json");
const AUTOS_DB = path.join(__dirname, "autos.json");

// ---------- Storage ----------
function read(file, fallback) {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(d) ? d : fallback;
  } catch { return fallback; }
}
function write(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const RATES = {
  auto: { base: 30, perKm: 14, label: "Auto" },
  bike: { base: 20, perKm: 8, label: "Bike" },
  cab:  { base: 50, perKm: 18, label: "Cab" }
};

// Demo autos (jab tak koi apna auto add na kare)
const DEMO = [
  { id: "d1", name: "Ramesh", vehicle: "auto", available: true },
  { id: "d2", name: "Mohan",  vehicle: "auto", available: true }
];
function loadAutos() {
  const a = read(AUTOS_DB, null);
  return a === null ? DEMO : a;
}

// ---------- Helpers ----------
function pick(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
const FROM = ["pickup", "from", "origin", "source", "start", "pickupLocation", "fromLocation", "from_location"];
const TO   = ["drop", "to", "destination", "dest", "end", "dropLocation", "toLocation", "to_location"];
const NAME = ["name", "driverName", "driver_name", "driver"];
const TYPE = ["vehicle", "vehicleType", "vehicle_type", "type"];

function vehicleOf(body) {
  const v = pick(body, TYPE).toLowerCase();
  if (v.includes("bike")) return "bike";
  if (v.includes("cab") || v.includes("car")) return "cab";
  return "auto";
}
function same(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  return a.includes(b) || b.includes(a);
}

function findAutos(pickup, drop, vehicle) {
  return loadAutos()
    .filter(a => a.available !== false && a.vehicle === vehicle)
    .filter(a => (!a.from || !pickup || same(a.from, pickup)) && (!a.to || !drop || same(a.to, drop)));
}

function findResponse(pickup, drop, vehicle, extra) {
  const list = findAutos(pickup, drop, vehicle);
  const found = list.length > 0;
  return {
    ...extra,
    success: true,
    found,
    count: list.length,
    autos: list,
    drivers: list,
    results: list,
    rides: list,
    message: found
      ? list.length + " " + vehicle + " mili. " + list[0].name + " paas hai."
      : "Abhi " + pickup + " se " + drop + " ke liye koi " + vehicle + " nahi mili."
  };
}

app.use(express.json());

// Render logs mein dikhega kaun sa address call hua
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) console.log("REQ", req.method, req.path, JSON.stringify(req.body || {}));
  next();
});

// ---------- Pages ----------
const publicDir = path.join(__dirname, "public");
const indexFile = fs.existsSync(path.join(publicDir, "index.html"))
  ? path.join(publicDir, "index.html")
  : path.join(__dirname, "index.html");
app.use(express.static(publicDir));
app.get("/", (_req, res) => res.sendFile(indexFile));

// ---------- Rates ----------
app.get("/api/rates", (_req, res) => res.json(RATES));

// ---------- Find (GET/POST, kai naam) ----------
function findHandler(req, res) {
  const b = { ...req.query, ...(req.body || {}) };
  const pickup = pick(b, FROM), drop = pick(b, TO);
  if (!pickup || !drop) return res.status(400).json({ success: false, error: "Pickup aur drop dono likho." });
  res.json(findResponse(pickup, drop, vehicleOf(b)));
}
["/api/find", "/api/search", "/api/find-ride", "/api/rides/find", "/api/rides/search", "/find"].forEach(p => {
  app.get(p, findHandler);
  app.post(p, findHandler);
});

// ---------- Add my auto ----------
function addAutoHandler(req, res) {
  const b = req.body || {};
  const name = pick(b, NAME);
  if (!name) return res.status(400).json({ success: false, error: "Driver ka naam likho." });

  const auto = {
    id: Date.now().toString(36),
    name: name.slice(0, 60),
    vehicle: vehicleOf(b),
    from: pick(b, FROM).slice(0, 100),
    to: pick(b, TO).slice(0, 100),
    phone: pick(b, ["phone", "mobile", "contact"]).slice(0, 20),
    seats: pick(b, ["seats", "seat"]).slice(0, 3),
    price: pick(b, ["price", "fare", "rate"]).slice(0, 10),
    available: true,
    createdAt: new Date().toISOString()
  };
  const autos = read(AUTOS_DB, null) === null ? [] : loadAutos();
  autos.push(auto);
  write(AUTOS_DB, autos);
  res.status(201).json({ success: true, ok: true, auto, driver: auto, message: name + " ka auto add ho gaya." });
}
["/api/autos", "/api/auto", "/api/drivers", "/api/driver", "/api/add-auto", "/api/autos/add", "/api/drivers/add"].forEach(p => {
  app.post(p, addAutoHandler);
  app.get(p, (_req, res) => {
    const list = loadAutos();
    res.json({ success: true, count: list.length, autos: list, drivers: list, results: list });
  });
});

// ---------- Rides ----------
app.get("/api/rides", (_req, res) => res.json(read(RIDES_DB, []).reverse()));

app.post("/api/rides", (req, res) => {
  const b = req.body || {};
  const pickup = pick(b, FROM), drop = pick(b, TO);
  if (!pickup || !drop) return res.status(400).json({ success: false, error: "Pickup aur drop dono likho." });

  const vehicle = vehicleOf(b);
  const km = Number(b.km) > 0 ? Number(b.km) : 5;
  const r = RATES[vehicle];
  const ride = {
    id: Date.now().toString(36),
    pickup: pickup.slice(0, 100),
    drop: drop.slice(0, 100),
    from: pickup.slice(0, 100),
    to: drop.slice(0, 100),
    vehicle,
    km,
    fare: Math.round(r.base + r.perKm * km),
    status: "booked",
    createdAt: new Date().toISOString()
  };
  const rides = read(RIDES_DB, []);
  rides.push(ride);
  write(RIDES_DB, rides);

  // Find jaisa jawab bhi saath mein, taaki index jo bhi dhundhe mil jaye
  res.status(201).json(findResponse(pickup, drop, vehicle, ride));
});

app.patch("/api/rides/:id/cancel", (req, res) => {
  const rides = read(RIDES_DB, []);
  const ride = rides.find(x => x.id === req.params.id);
  if (!ride) return res.status(404).json({ error: "Ride nahi mili." });
  ride.status = "cancelled";
  write(RIDES_DB, rides);
  res.json(ride);
});

// Anjaan address ke liye saaf jawab
app.use("/api", (req, res) => res.status(404).json({ success: false, error: "Ye address nahi mila: " + req.path }));

app.listen(PORT, () => console.log("Sawari running on port " + PORT));
