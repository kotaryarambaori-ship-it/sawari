const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const db = new Database("sawari.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS rides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver TEXT NOT NULL,
    vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('auto', 'rickshaw')),
    vehicle_number TEXT NOT NULL,
    from_location TEXT NOT NULL,
    to_location TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    fare INTEGER NOT NULL CHECK(fare > 0),
    seats INTEGER NOT NULL CHECK(seats > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    ride_id INTEGER NOT NULL REFERENCES rides(id),
    passenger TEXT NOT NULL,
    seats INTEGER NOT NULL CHECK(seats > 0),
    total INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

function cleanText(value, fieldName, minLength = 2, maxLength = 80) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} required hai`);
  }

  const cleaned = value.trim();

  if (cleaned.length < minLength || cleaned.length > maxLength) {
    throw new Error(
      `${fieldName} ${minLength}-${maxLength} characters ka hona chahiye`
    );
  }

  return cleaned;
}

function cleanNumber(value, fieldName, minimum, maximum) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(
      `${fieldName} ${minimum} se ${maximum} ke beech hona chahiye`
    );
  }

  return number;
}

app.get("/api/rides", (request, response) => {
  const from = String(request.query.from || "").trim();
  const to = String(request.query.to || "").trim();

  const rides = db.prepare(`
    SELECT *
    FROM rides
    WHERE seats > 0
      AND from_location LIKE ?
      AND to_location LIKE ?
    ORDER BY departure_time ASC
    LIMIT 100
  `).all(`%${from}%`, `%${to}%`);

  response.json({
    success: true,
    count: rides.length,
    rides
  });
});

app.post("/api/rides", (request, response) => {
  const body = request.body || {};

  const driver = cleanText(body.driver, "Driver name");
  const vehicleType = cleanText(body.vehicle_type, "Vehicle type", 3, 10)
    .toLowerCase();
  const vehicleNumber = cleanText(
    body.vehicle_number,
    "Vehicle number",
    4,
    20
  ).toUpperCase();
  const fromLocation = cleanText(body.from_location, "From location");
  const toLocation = cleanText(body.to_location, "To location");
  const departureTime = cleanText(body.departure_time, "Departure time", 3, 30);
  const fare = cleanNumber(body.fare, "Fare", 1, 10000);
  const seats = cleanNumber(body.seats, "Seats", 1, 6);

  if (!["auto", "rickshaw"].includes(vehicleType)) {
    return response.status(400).json({
      success: false,
      error: "Vehicle type auto ya rickshaw hona chahiye"
    });
  }

  if (fromLocation.toLowerCase() === toLocation.toLowerCase()) {
    return response.status(400).json({
      success: false,
      error: "From aur To location alag hone chahiye"
    });
  }

  const result = db.prepare(`
    INSERT INTO rides
    (driver, vehicle_type, vehicle_number, from_location, to_location, departure_time, fare, seats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    driver,
    vehicleType,
    vehicleNumber,
    fromLocation,
    toLocation,
    departureTime,
    fare,
    seats
  );

  response.status(201).json({
    success: true,
    message: "Ride publish ho gayi",
    ride_id: result.lastInsertRowid
  });
});

app.post("/api/bookings", (request, response) => {
  const body = request.body || {};

  const passenger = cleanText(body.passenger, "Passenger name");
  const rideId = cleanNumber(body.ride_id, "Ride ID", 1, 2147483647);
  const seats = cleanNumber(body.seats, "Seats", 1, 6);

  const booking = db.transaction(() => {
    const ride = db.prepare(
      "SELECT * FROM rides WHERE id = ?"
    ).get(rideId);

    if (!ride) {
      return { status: 404, error: "Ride nahi mili" };
    }

    const duplicate = db.prepare(`
      SELECT 1
      FROM bookings
      WHERE ride_id = ?
        AND lower(passenger) = lower(?)
    `).get(rideId, passenger);

    if (duplicate) {
      return {
        status: 409,
        error: "Aapne is ride mein already seat book ki hai"
      };
    }

    const update = db.prepare(`
      UPDATE rides
      SET seats = seats - ?
      WHERE id = ? AND seats >= ?
    `).run(seats, rideId, seats);

    if (update.changes !== 1) {
      return {
        status: 409,
        error: "Itni seats available nahi hain"
      };
    }

    const bookingId = crypto.randomUUID();
    const total = ride.fare * seats;

    db.prepare(`
      INSERT INTO bookings
      (id, ride_id, passenger, seats, total)
      VALUES (?, ?, ?, ?, ?)
    `).run(bookingId, rideId, passenger, seats, total);

    const seatsLeft = db.prepare(
      "SELECT seats FROM rides WHERE id = ?"
    ).get(rideId).seats;

    return {
      status: 201,
      data: {
        success: true,
        message: "Booking confirmed",
        booking_id: bookingId,
        ride_id: rideId,
        passenger,
        seats,
        total,
        seats_left: seatsLeft
      }
    };
  })();

  response.status(booking.status).json(
    booking.error
      ? { success: false, error: booking.error }
      : booking.data
  );
});

app.use((request, response) => {
  response.status(404).json({
    success: false,
    error: "Page nahi mila"
  });
});

app.use((error, request, response, next) => {
  console.error(error);

  response.status(400).json({
    success: false,
    error: error.message || "Kuch galat ho gaya"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Sawari app chal rahi hai: http://localhost:${PORT}`);
});
