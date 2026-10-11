import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { AccessToken } from "livekit-server-sdk";
import agoraAccessToken from "agora-access-token";
const { RtcTokenBuilder } = agoraAccessToken;
const RTC_ROLE_PUBLISHER = agoraAccessToken.RtcRole?.PUBLISHER ?? 1;
import Razorpay from "razorpay";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";

const { Pool } = pg;
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
if (!JWT_SECRET || !DATABASE_URL) {
  console.error("Missing required JWT_SECRET or DATABASE_URL environment variables.");
  process.exit(1);
}
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean), credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, username VARCHAR(40) UNIQUE NOT NULL,
      email VARCHAR(254) UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      bio VARCHAR(160) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(16) NOT NULL DEFAULT 'unspecified';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS rooms (
      id BIGSERIAL PRIMARY KEY, owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(100) NOT NULL, kind VARCHAR(16) NOT NULL CHECK(kind IN ('voice','live')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY, room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, body VARCHAR(500) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS messages_room_created_idx ON messages(room_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS direct_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body VARCHAR(1000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS direct_messages_pair_created_idx ON direct_messages(sender_id, recipient_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS call_requests (
      id BIGSERIAL PRIMARY KEY,
      caller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      callee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      status VARCHAR(16) NOT NULL DEFAULT 'ringing' CHECK(status IN ('ringing','accepted','rejected','ended','missed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS call_requests_callee_status_idx ON call_requests(callee_id,status,created_at DESC);
    CREATE TABLE IF NOT EXISTS diamond_accounts (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance BIGINT NOT NULL DEFAULT 0 CHECK(balance >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      diamonds BIGINT NOT NULL CHECK(diamonds >= 10000),
      usd_amount NUMERIC(12,4) NOT NULL,
      usd_inr_rate NUMERIC(10,4) NOT NULL,
      inr_amount NUMERIC(12,2) NOT NULL,
      payout_details TEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wallet_accounts (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance BIGINT NOT NULL DEFAULT 100 CHECK(balance >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount BIGINT NOT NULL,
      kind VARCHAR(24) NOT NULL,
      reference TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS live_gifts (
      id BIGSERIAL PRIMARY KEY,
      room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gift_key VARCHAR(24) NOT NULL,
      coins BIGINT NOT NULL CHECK(coins > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS live_gifts_room_created_idx ON live_gifts(room_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS follows (
      follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(follower_id,following_id),
      CHECK(follower_id<>following_id)
    );
    CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS live_reports (
      id BIGSERIAL PRIMARY KEY,
      room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason VARCHAR(80) NOT NULL,
      details VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payment_orders (
      order_id VARCHAR(80) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_paise INTEGER NOT NULL,
      coins BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK(status IN ('created','paid','failed')),
      payment_id VARCHAR(100) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS app_task_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      female_only BOOLEAN NOT NULL DEFAULT TRUE,
      live_hours NUMERIC(5,2) NOT NULL DEFAULT 17 CHECK (live_hours > 0 AND live_hours <= 168),
      reward_usd NUMERIC(10,2) NOT NULL DEFAULT 15 CHECK (reward_usd >= 0 AND reward_usd <= 100000),
      duration_days INTEGER NOT NULL DEFAULT 7 CHECK (duration_days > 0 AND duration_days <= 365),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    );
    ALTER TABLE app_task_settings ADD COLUMN IF NOT EXISTS daily_reward_min INTEGER NOT NULL DEFAULT 50;
    ALTER TABLE app_task_settings ADD COLUMN IF NOT EXISTS daily_reward_max INTEGER NOT NULL DEFAULT 500;
    CREATE TABLE IF NOT EXISTS agency_applications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name VARCHAR(100) NOT NULL,
      fun_live_id VARCHAR(60) NOT NULL,
      monthly_earning NUMERIC(14,2) NOT NULL CHECK(monthly_earning >= 0),
      earning_currency VARCHAR(8) NOT NULL,
      coin_requirement BIGINT NOT NULL CHECK(coin_requirement > 0),
      coin_unit VARCHAR(8) NOT NULL,
      additional_info VARCHAR(1000) NOT NULL DEFAULT '',
      status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS agency_applications_status_created_idx ON agency_applications(status,created_at DESC);
    CREATE TABLE IF NOT EXISTS daily_reward_claims (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_date DATE NOT NULL,
      coins INTEGER NOT NULL CHECK(coins >= 50 AND coins <= 5000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id,reward_date)
    );
    INSERT INTO app_task_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}
function tokenFor(user) { return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: "7d", issuer: "go-live-stream" }); }
async function auth(req, res, next) {
  const raw = req.headers.authorization || "";
  if (!raw.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in required." });
  try {
    const payload = jwt.verify(raw.slice(7), JWT_SECRET, { issuer: "go-live-stream" });
    const result = await pool.query("SELECT id, username, email, bio, gender, is_blocked, created_at FROM users WHERE id=$1", [payload.sub]);
    if (!result.rowCount) return res.status(401).json({ error: "Account not found." });
    if (result.rows[0].is_blocked) return res.status(403).json({ error: "This account has been blocked. Contact FUN LIVE support." });
    req.user = result.rows[0]; next();
  } catch { return res.status(401).json({ error: "Invalid or expired session." }); }
}
const io = new Server(httpServer, { cors: { origin: (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean) } });
io.use((socket, next) => {
  try {
    const t = socket.handshake.auth?.token;
    if (!t) return next(new Error("Authentication required"));
    socket.user = jwt.verify(t, JWT_SECRET, { issuer: "go-live-stream" });
    next();
  } catch { next(new Error("Invalid session")); }
});
io.on("connection", socket => {
  async function broadcastLiveViewers(roomId) {
    const liveRoom = "live:" + String(roomId);
    const roomResult = await pool.query("SELECT owner_id FROM rooms WHERE id=$1 AND kind='live'", [roomId]);
    if (!roomResult.rowCount) return;
    const ownerId = String(roomResult.rows[0].owner_id || "");
    const members = await io.in(liveRoom).fetchSockets();
    const viewers = members.filter(member => String(member.user?.sub || "") !== ownerId).map(member => {
      const raw = String(member.user?.username || "Viewer");
      return { id: String(member.user?.sub || member.id), username: /^guest_[a-f0-9]+$/i.test(raw) ? "Guest " + raw.slice(-4).toUpperCase() : raw };
    });
    io.to(liveRoom).emit("live:viewers", { roomId: String(roomId), viewers, count: members.length });
    io.to(liveRoom).emit("live:count", { roomId: String(roomId), count: members.length });
  }
  socket.on("live:join", async ({ roomId } = {}, done = () => {}) => {
    try {
      if (!/^\d+$/.test(String(roomId || ""))) return done({ error: "Invalid live room." });
      const r = await pool.query("SELECT id,kind,owner_id FROM rooms WHERE id=$1", [roomId]);
      if (!r.rowCount || r.rows[0].kind !== "live") return done({ error: "Live room not found." });
      const liveRoom = "live:" + roomId;
      const wasAlreadyInRoom = socket.rooms.has(liveRoom);
      await socket.join(liveRoom);
      await broadcastLiveViewers(roomId);
      if (!wasAlreadyInRoom && String(r.rows[0].owner_id || "") !== String(socket.user?.sub || "")) {
        const raw = String(socket.user?.username || "Viewer");
        const username = /^guest_[a-f0-9]+$/i.test(raw) ? "Guest " + raw.slice(-4).toUpperCase() : raw;
        io.to(liveRoom).emit("live:viewer-enter", { roomId: String(roomId), username, userId: String(socket.user?.sub || "") });
      }
      const count = (await io.in(liveRoom).fetchSockets()).length;
      done({ ok: true, count });
    } catch (e) { console.error("Live viewer presence update failed:", e?.message || "unknown error"); done({ error: "Could not join live room." }); }
  });
  socket.on("live:leave", async ({ roomId } = {}, done = () => {}) => {
    try {
      const liveRoom = "live:" + String(roomId || "");
      await socket.leave(liveRoom);
      await broadcastLiveViewers(roomId);
      const count = (await io.in(liveRoom).fetchSockets()).length;
      done({ ok: true, count });
    } catch { done({ error: "Could not leave live room cleanly." }); }
  });
  socket.on("disconnecting", async () => {
    for (const roomName of socket.rooms) {
      if (roomName.startsWith("live:")) {
        const roomId = roomName.slice(5);
        setTimeout(async () => {
          try { await broadcastLiveViewers(roomId); } catch (e) { console.error("Live viewer disconnect update failed:", e?.message || "unknown error"); }
        }, 0);
      }
    }
  });
  socket.on("room:join", async ({ roomId } = {}, done = () => {}) => {
    try {
      if (!/^\d+$/.test(String(roomId || ""))) return done({ error: "Invalid room." });
      const r = await pool.query("SELECT id FROM rooms WHERE id=$1", [roomId]);
      if (!r.rowCount) return done({ error: "Room not found." });
      await socket.join("room:" + roomId);
      done({ ok: true });
    } catch (e) {
      console.error("Socket room:join failed:", e?.message || "unknown error");
      done({ error: "Could not join chat room." });
    }
  });
  socket.on("room:message", async ({ roomId, body } = {}, done = () => {}) => {
    try {
      const message = String(body || "").trim();
      if (!/^\d+$/.test(String(roomId || "")) || !message || message.length > 500) return done({ error: "Message or room is invalid." });
      const room = await pool.query("SELECT id FROM rooms WHERE id=$1", [roomId]);
      if (!room.rowCount) return done({ error: "Room not found." });
      const result = await pool.query("INSERT INTO messages(room_id,user_id,body) VALUES($1,$2,$3) RETURNING id,room_id,body,created_at", [roomId, socket.user.sub, message]);
      const payload = { ...result.rows[0], username: socket.user.username };
      io.to("room:" + roomId).emit("room:message", payload);
      io.to("live:" + roomId).emit("room:message", payload);
      done({ ok: true, message: payload });
    } catch { done({ error: "Could not send message." }); }
  });
});
const GIFT_CATALOG = Object.freeze({
  rose: { label: "Rose", emoji: "🌹", coins: 1000, sound: "chime" },
  heart: { label: "Heart", emoji: "💖", coins: 2000, sound: "sparkle" },
  icecream: { label: "Ice Cream", emoji: "🍦", coins: 5000, sound: "pop" },
  teddy: { label: "Teddy Bear", emoji: "🧸", coins: 10000, sound: "pop" },
  ring: { label: "Diamond Ring", emoji: "💍", coins: 20000, sound: "chime" },
  chocolate: { label: "Chocolate", emoji: "🍫", coins: 30000, sound: "pop" },
  lovecar: { label: "Love Car", emoji: "🚗", coins: 50000, sound: "fanfare" },
  airplane: { label: "Airplane", emoji: "✈️", coins: 100000, sound: "fanfare" },
  yacht: { label: "Yacht", emoji: "🛥️", coins: 200000, sound: "fanfare" },
  castle: { label: "Castle", emoji: "🏰", coins: 500000, sound: "fanfare" },
  firework: { label: "Fireworks", emoji: "🎆", coins: 5000, sound: "fanfare" },
  lovetrain: { label: "Love Train", emoji: "🚂", coins: 10000, sound: "fanfare" },
  phoenix: { label: "Phoenix", emoji: "🦅", coins: 20000, sound: "fanfare" },
  galaxy: { label: "Galaxy", emoji: "🌌", coins: 50000, sound: "fanfare" },
  universe: { label: "Universe", emoji: "🌠", coins: 100000, sound: "fanfare" }
});
app.get("/api/wallet", auth, async (req,res) => {
  try {
    await pool.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,100) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const r=await pool.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id]);
    res.json({balance:Number(r.rows[0].balance),currency:"FUN coins",notice:"Promotional test coins only; they have no cash value."});
  } catch { res.status(500).json({error:"Could not load wallet."}); }
});
app.get("/api/gifts/catalog", (_req,res) => res.json({gifts:Object.entries(GIFT_CATALOG).map(([key,g])=>({key,...g}))}));
app.post("/api/gifts/send", auth, async (req,res) => {
  const roomId=String(req.body?.roomId||"");
  const giftKey=String(req.body?.giftKey||"");
  const gift=GIFT_CATALOG[giftKey];
  if(!/^\d+$/.test(roomId)||!gift) return res.status(400).json({error:"Choose a valid live room and gift."});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const room=await client.query("SELECT id,owner_id,kind FROM rooms WHERE id=$1 FOR UPDATE",[roomId]);
    if(!room.rowCount||room.rows[0].kind!=="live"){await client.query("ROLLBACK");return res.status(404).json({error:"Live room not found."});}
    const receiverId=String(room.rows[0].owner_id);
    if(receiverId===String(req.user.id)){await client.query("ROLLBACK");return res.status(400).json({error:"You cannot send a gift to yourself."});}
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,100) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,100) ON CONFLICT(user_id) DO NOTHING",[receiverId]);
    const sender=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1 FOR UPDATE",[req.user.id]);
    if(Number(sender.rows[0].balance)<gift.coins){await client.query("ROLLBACK");return res.status(402).json({error:"Not enough FUN coins. Use the free test coins or top up after payment setup."});}
    // Gift split: viewer pays 100%; host receives 60%; platform retains 40%.
    const hostCoins=Math.floor(gift.coins*0.60);
    const platformCoins=gift.coins-hostCoins;
    await client.query("UPDATE wallet_accounts SET balance=balance-$1,updated_at=NOW() WHERE user_id=$2",[gift.coins,req.user.id]);
    await client.query("INSERT INTO diamond_accounts(user_id,balance) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET balance=diamond_accounts.balance+EXCLUDED.balance,updated_at=NOW()",[receiverId,hostCoins]);
    const tx=await client.query("INSERT INTO live_gifts(room_id,sender_id,receiver_id,gift_key,coins) VALUES($1,$2,$3,$4,$5) RETURNING id,room_id,gift_key,coins,created_at",[roomId,req.user.id,receiverId,giftKey,gift.coins]);
    await client.query("INSERT INTO wallet_transactions(user_id,amount,kind,reference) VALUES($1,$2,'gift_sent',$3),($4,$5,'gift_received',$3)",[req.user.id,-gift.coins,String(tx.rows[0].id),receiverId,hostCoins]);
    const balances=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id]);
    await client.query("COMMIT");
    const payload={...tx.rows[0],sender:req.user.username,...gift,coins:gift.coins,hostCoins,platformCoins,hostSharePercent:60,platformSharePercent:40};
    io.to("live:"+roomId).emit("live:gift",payload);
    res.status(201).json({gift:payload,balance:Number(balances.rows[0].balance)});
  } catch(e) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error("Gift send failed:",e?.message||"unknown error");
    res.status(500).json({error:"Could not send gift."});
  } finally {client.release();}
});
app.get("/api/gifts/received", auth, async (req,res) => {
  try {
    const r=await pool.query("SELECT g.id,g.room_id,g.gift_key,g.coins,g.created_at,u.username AS sender FROM live_gifts g JOIN users u ON u.id=g.sender_id WHERE g.receiver_id=$1 ORDER BY g.created_at DESC LIMIT 50",[req.user.id]);
    res.json({gifts:r.rows});
  } catch {res.status(500).json({error:"Could not load received gifts."});}
});
app.get("/health", async (_req, res) => {
  const mediaConfigured = Boolean(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);
  try { await pool.query("SELECT 1"); res.json({ ok: true, service: "go-live-stream-api", database: "connected", mediaConfigured }); }
  catch { res.status(503).json({ ok: false, database: "unavailable", mediaConfigured }); }
});
app.post("/api/auth/guest", rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (_req, res) => {
  try {
    const suffix = crypto.randomBytes(8).toString("hex");
    const username = "guest_" + suffix;
    const email = "guest_" + suffix + "@guest.golive.invalid";
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    const result = await pool.query(
      "INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email,bio,created_at",
      [username,email,passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({ user, token: tokenFor(user), guest: true });
  } catch {
    res.status(500).json({ error: "Could not start guest session. Please try again." });
  }
});
app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const requestedUsername = String(req.body?.username || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Password must be at least 10 characters." });
    // Usernames are optional. If the supplied value is not valid, safely generate one from the email.
    let username = requestedUsername && /^[a-zA-Z0-9_]{3,40}$/.test(requestedUsername) ? requestedUsername : "";
    if (!username) {
      const base = (email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 28) || "golive").padEnd(3, "1");
      username = base;
      for (let suffix = 1; ; suffix++) {
        const found = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
        if (!found.rowCount) break;
        username = (base.slice(0, 34) + "_" + suffix).slice(0, 40);
      }
    }
    const gender = ["male","female","other"].includes(String(req.body?.gender||"").toLowerCase()) ? String(req.body.gender).toLowerCase() : "unspecified";
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query("INSERT INTO users(username,email,password_hash,gender) VALUES($1,$2,$3,$4) RETURNING id,username,email,bio,gender,created_at", [username,email,hash,gender]);
    res.status(201).json({ user: result.rows[0], token: tokenFor(result.rows[0]) });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "This email or username is already registered. Please log in instead." });
    res.status(500).json({ error: "Could not create account." });
  }
});
app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  try {
    const result = await pool.query("SELECT id,username,email,bio,is_blocked,created_at,password_hash FROM users WHERE email=$1", [email]);
    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
    if (result.rows[0].is_blocked) return res.status(403).json({ error: "This account has been blocked. Contact FUN LIVE support." });
    const { password_hash, is_blocked, ...user } = result.rows[0];
    res.json({ user, token: tokenFor(user) });
  } catch { res.status(500).json({ error: "Could not sign in." }); }
});
app.get("/api/me", auth, (req,res) => res.json({ user: req.user }));
app.patch("/api/me", auth, async (req,res) => {
  const bio = String(req.body?.bio ?? req.user.bio).trim();
  if (bio.length > 160) return res.status(400).json({ error: "Bio must be 160 characters or fewer." });
  try {
    const r = await pool.query("UPDATE users SET bio=$1 WHERE id=$2 RETURNING id,username,email,bio,created_at", [bio,req.user.id]);
    res.json({ user:r.rows[0] });
  } catch { res.status(500).json({ error: "Could not update profile." }); }
});


app.get("/api/messages/conversations", auth, async (req,res) => {
  try {
    const r=await pool.query(`
      SELECT DISTINCT ON (peer_id) peer_id, username, body, created_at, sender_id
      FROM (
        SELECT CASE WHEN d.sender_id=$1 THEN d.recipient_id ELSE d.sender_id END AS peer_id,
               u.username, d.body, d.created_at, d.sender_id
        FROM direct_messages d
        JOIN users u ON u.id=CASE WHEN d.sender_id=$1 THEN d.recipient_id ELSE d.sender_id END
        WHERE d.sender_id=$1 OR d.recipient_id=$1
      ) x
      ORDER BY peer_id, created_at DESC
    `,[req.user.id]);
    res.json({conversations:r.rows.map(m=>({...m,unread:false}))});
  } catch {res.status(500).json({error:"Could not load inbox."});}
});
app.get("/api/messages/:userId", auth, async (req,res) => {
  const peer=String(req.params.userId||"");
  if(!/^\d+$/.test(peer)||peer===String(req.user.id)) return res.status(400).json({error:"Choose another valid user."});
  try {
    const u=await pool.query("SELECT id,username FROM users WHERE id=$1",[peer]);
    if(!u.rowCount)return res.status(404).json({error:"User not found."});
    const r=await pool.query(`
      SELECT d.id,d.sender_id,d.recipient_id,d.body,d.created_at,u.username AS sender_name
      FROM direct_messages d JOIN users u ON u.id=d.sender_id
      WHERE (d.sender_id=$1 AND d.recipient_id=$2) OR (d.sender_id=$2 AND d.recipient_id=$1)
      ORDER BY d.created_at ASC LIMIT 200
    `,[req.user.id,peer]);
    res.json({peer:u.rows[0],messages:r.rows});
  } catch {res.status(500).json({error:"Could not load conversation."});}
});
app.post("/api/messages/:userId", auth, async (req,res) => {
  const peer=String(req.params.userId||"");
  const body=String(req.body?.body||"").trim();
  if(!/^\d+$/.test(peer)||peer===String(req.user.id))return res.status(400).json({error:"Choose another valid user."});
  if(!body||body.length>1000)return res.status(400).json({error:"Message must be 1–1000 characters."});
  try {
    const u=await pool.query("SELECT id FROM users WHERE id=$1",[peer]);
    if(!u.rowCount)return res.status(404).json({error:"User not found."});
    const r=await pool.query("INSERT INTO direct_messages(sender_id,recipient_id,body) VALUES($1,$2,$3) RETURNING id,sender_id,recipient_id,body,created_at",[req.user.id,peer,body]);
    res.status(201).json({message:r.rows[0]});
  } catch {res.status(500).json({error:"Could not send message."});}
});
app.get("/api/users/search", auth, async (req,res) => {
  const raw=String(req.query.q||"").trim();
  const legacy=raw.replace(/^GLS/i,"").replace(/^0+/,"");
  const publicNumber=Number(raw);
  const lookupId=Number.isSafeInteger(publicNumber)&&publicNumber>=7000001?String(publicNumber-7000000):legacy;
  if(!raw || raw.length>40) return res.json({users:[]});
  try {
    const r=await pool.query("SELECT id,username FROM users WHERE username ILIKE $1 OR id::text=$2 ORDER BY username LIMIT 10",["%"+raw+"%",lookupId]);
    res.json({users:r.rows.map(u=>({...u,publicId:String(7000000+Number(u.id)),goLiveId:String(7000000+Number(u.id))}))});
  } catch { res.status(500).json({error:"Could not search users."}); }
});
app.post("/api/calls", auth, async (req,res) => {
  const calleeId=String(req.body?.calleeId||"");
  if(!/^\d+$/.test(calleeId) || calleeId===String(req.user.id)) return res.status(400).json({error:"Choose another valid GO LIVE user."});
  try {
    const u=await pool.query("SELECT id,gender FROM users WHERE id=$1",[calleeId]);
    if(!u.rowCount) return res.status(404).json({error:"User not found."});
    const caller=await pool.query("SELECT gender FROM users WHERE id=$1",[req.user.id]);
    if(caller.rows[0].gender!=="male") return res.status(403).json({error:"Private paid calls are available to male callers only. Set your profile gender to Male first."});
    if(u.rows[0].gender!=="female") return res.status(403).json({error:"Paid private calls can only be placed to female hosts with a Female profile."});
    const room=await pool.query("INSERT INTO rooms(owner_id,title,kind) VALUES($1,$2,'live') RETURNING id",[req.user.id,"call-"+req.user.id+"-"+calleeId+"-"+Date.now()]);
    const c=await pool.query("INSERT INTO call_requests(caller_id,callee_id,room_id) VALUES($1,$2,$3) RETURNING id,room_id,status,created_at",[req.user.id,calleeId,room.rows[0].id]);
    res.status(201).json({call:{...c.rows[0],callerId:req.user.id,calleeId:Number(calleeId)},notice:"Call request sent. The other user must accept before the call connects."});
  } catch { res.status(500).json({error:"Could not start call."}); }
});
app.get("/api/calls/incoming", auth, async (req,res) => {
  try {
    const r=await pool.query("SELECT c.id,c.room_id,c.status,c.created_at,u.username AS caller, c.caller_id FROM call_requests c JOIN users u ON u.id=c.caller_id WHERE c.callee_id=$1 AND c.status='ringing' ORDER BY c.created_at DESC LIMIT 20",[req.user.id]);
    res.json({calls:r.rows});
  } catch { res.status(500).json({error:"Could not load incoming calls."}); }
});
app.get("/api/calls/:id", auth, async (req,res) => {
  if(!/^\d+$/.test(req.params.id)) return res.status(400).json({error:"Invalid call ID."});
  try {
    const r=await pool.query("SELECT id,room_id,status,caller_id,callee_id FROM call_requests WHERE id=$1 AND (caller_id=$2 OR callee_id=$2)",[req.params.id,req.user.id]);
    if(!r.rowCount) return res.status(404).json({error:"Call not found."});
    res.json({call:r.rows[0]});
  } catch { res.status(500).json({error:"Could not check call status."}); }
});
app.post("/api/calls/:id/respond", auth, async (req,res) => {
  if(!/^\d+$/.test(req.params.id)) return res.status(400).json({error:"Invalid call ID."});
  const decision=String(req.body?.decision||"");
  if(!["accepted","rejected"].includes(decision)) return res.status(400).json({error:"Choose accept or reject."});
  try {
    const r=await pool.query("UPDATE call_requests SET status=$1,updated_at=NOW(),accepted_at=CASE WHEN $1='accepted' THEN NOW() ELSE accepted_at END WHERE id=$2 AND callee_id=$3 AND status='ringing' RETURNING id,room_id,status,caller_id,callee_id",[decision,req.params.id,req.user.id]);
    if(!r.rowCount) return res.status(404).json({error:"Call request is no longer available."});
    res.json({call:r.rows[0]});
  } catch { res.status(500).json({error:"Could not respond to call."}); }
});
// Fixed 1-to-1 call pricing: caller pays 100 FUN coins/minute; host receives 60, platform share is 40.
const CALL_RATE_COINS_PER_MINUTE = 2000;
const CALL_HOST_SHARE_PERCENT = 60;
app.get("/api/calls/rate", auth, (req,res) => res.json({coinsPerMinute:CALL_RATE_COINS_PER_MINUTE,hostSharePercent:CALL_HOST_SHARE_PERCENT,platformSharePercent:100-CALL_HOST_SHARE_PERCENT}));
app.post("/api/calls/:id/bill-minute", auth, async (req,res) => {
  if(!/^\d+$/.test(req.params.id)) return res.status(400).json({error:"Invalid call ID."});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const c=await client.query("SELECT * FROM call_requests WHERE id=$1 AND caller_id=$2 FOR UPDATE",[req.params.id,req.user.id]);
    if(!c.rowCount){await client.query("ROLLBACK");return res.status(403).json({error:"Only the caller can pay for this call."});}
    const row=c.rows[0];
    if(row.status!=="accepted"){await client.query("ROLLBACK");return res.status(409).json({error:"Call is not active."});}
    const nextMinute=Number(row.billed_minutes)+1;
    const elapsed=Date.now()-new Date(row.accepted_at).getTime();
    if(elapsed < nextMinute*60000){await client.query("ROLLBACK");return res.status(425).json({error:"The next minute has not started yet.",retryAfterSeconds:Math.ceil((nextMinute*60000-elapsed)/1000)});}
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,100) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,100) ON CONFLICT(user_id) DO NOTHING",[row.callee_id]);
    const w=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1 FOR UPDATE",[req.user.id]);
    if(Number(w.rows[0].balance)<CALL_RATE_COINS_PER_MINUTE){
      await client.query("UPDATE call_requests SET status='ended',updated_at=NOW() WHERE id=$1",[row.id]);
      await client.query("COMMIT");
      return res.status(402).json({error:"Not enough coins. Call ended.",balance:Number(w.rows[0].balance),callEnded:true});
    }
    const hostCoins=Math.floor(CALL_RATE_COINS_PER_MINUTE*CALL_HOST_SHARE_PERCENT/100);
    await client.query("UPDATE wallet_accounts SET balance=balance-$1,updated_at=NOW() WHERE user_id=$2",[CALL_RATE_COINS_PER_MINUTE,req.user.id]);
    await client.query("INSERT INTO diamond_accounts(user_id,balance) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET balance=diamond_accounts.balance+EXCLUDED.balance,updated_at=NOW()",[row.callee_id,hostCoins]);
    await client.query("UPDATE call_requests SET billed_minutes=$1,updated_at=NOW() WHERE id=$2",[nextMinute,row.id]);
    const ref="call:"+row.id+":minute:"+nextMinute;
    await client.query("INSERT INTO wallet_transactions(user_id,amount,kind,reference) VALUES($1,$2,'call_charge',$3),($4,$5,'call_earning',$3)",[req.user.id,-CALL_RATE_COINS_PER_MINUTE,ref,row.callee_id,hostCoins]);
    const bal=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id]);
    await client.query("COMMIT");
    res.json({billedMinutes:nextMinute,charged:CALL_RATE_COINS_PER_MINUTE,hostCoins,platformCoins:CALL_RATE_COINS_PER_MINUTE-hostCoins,balance:Number(bal.rows[0].balance)});
  } catch(e){await client.query("ROLLBACK").catch(()=>{});res.status(500).json({error:"Could not bill call minute."});}
  finally{client.release();}
});
// Host earnings are diamonds. Minimum withdrawal is 10,000 diamonds.
const MIN_WITHDRAWAL_DIAMONDS = 10000;
const DIAMONDS_PER_USD = Number(process.env.DIAMONDS_PER_USD || 9500);
const USD_INR_RATE = Number(process.env.USD_INR_RATE || 95);
app.get("/api/withdrawal/summary", auth, async (req,res) => {
  try {
    await pool.query("INSERT INTO diamond_accounts(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const [b,p]=await Promise.all([
      pool.query("SELECT balance FROM diamond_accounts WHERE user_id=$1",[req.user.id]),
      pool.query("SELECT id,diamonds,usd_amount,usd_inr_rate,inr_amount,status,created_at FROM withdrawal_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",[req.user.id])
    ]);
    const diamonds=Number(b.rows[0].balance);
    res.json({diamonds,minimumDiamonds:MIN_WITHDRAWAL_DIAMONDS,diamondsPerUSD:DIAMONDS_PER_USD,usdInrRate:USD_INR_RATE,estimatedUSD:Math.floor(diamonds/DIAMONDS_PER_USD*100)/100,estimatedINR:Math.floor(diamonds/DIAMONDS_PER_USD*USD_INR_RATE*100)/100,withdrawals:p.rows});
  } catch {res.status(500).json({error:"Could not load withdrawal summary."});}
});
const withdrawalSubmitLimiter = rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false,message:{error:"Too many withdrawal attempts. Try again later."}});
const paymentOrderLimiter = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,message:{error:"Too many payment attempts. Try again later."}});
const paymentVerifyLimiter = rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false,message:{error:"Too many payment verification attempts. Try again later."}});
app.post("/api/withdrawals", auth, withdrawalSubmitLimiter, async (req,res) => {
  const diamonds=Number(req.body?.diamonds);
  const payoutDetails=String(req.body?.payoutDetails||"").trim();
  if(!Number.isSafeInteger(diamonds)||diamonds<MIN_WITHDRAWAL_DIAMONDS) return res.status(400).json({error:"Minimum withdrawal is 10,000 diamonds."});
  if(diamonds>1000000000||payoutDetails.length<5||payoutDetails.length>500) return res.status(400).json({error:"Enter a valid diamond amount and payout details."});
  if(!Number.isFinite(DIAMONDS_PER_USD)||DIAMONDS_PER_USD<=0||!Number.isFinite(USD_INR_RATE)||USD_INR_RATE<=0) return res.status(503).json({error:"Withdrawal conversion rates are not configured correctly."});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO diamond_accounts(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const b=await client.query("SELECT balance FROM diamond_accounts WHERE user_id=$1 FOR UPDATE",[req.user.id]);
    if(Number(b.rows[0].balance)<diamonds){await client.query("ROLLBACK");return res.status(402).json({error:"Not enough diamonds for this withdrawal.",available:Number(b.rows[0].balance)});}
    const usd=Math.floor((diamonds/DIAMONDS_PER_USD)*10000)/10000;
    const inr=Math.round(usd*USD_INR_RATE*100)/100;
    await client.query("UPDATE diamond_accounts SET balance=balance-$1,updated_at=NOW() WHERE user_id=$2",[diamonds,req.user.id]);
    const w=await client.query("INSERT INTO withdrawal_requests(user_id,diamonds,usd_amount,usd_inr_rate,inr_amount,payout_details) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,diamonds,usd_amount,usd_inr_rate,inr_amount,status,created_at",[req.user.id,diamonds,usd,USD_INR_RATE,inr,payoutDetails]);
    await client.query("COMMIT");
    res.status(201).json({withdrawal:w.rows[0],notice:"Withdrawal request submitted for manual review. Payout is not automatic yet."});
  } catch(e){await client.query("ROLLBACK").catch(()=>{});res.status(500).json({error:"Could not submit withdrawal request."});}
  finally{client.release();}
});
// Admin-only withdrawal management. Configure ADMIN_USER_IDS with comma-separated numeric user IDs.
function requireAdmin(req,res,next){
  const allowed=String(process.env.ADMIN_USER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!allowed.length) return res.status(503).json({error:"Admin panel is not configured. Set ADMIN_USER_IDS in the backend environment."});
  if(!allowed.includes(String(req.user.id))) return res.status(403).json({error:"Admin access required."});
  next();
}
app.get("/api/daily-rewards",auth,async(req,res)=>{
  try {
    const [cfg,claim,wallet]=await Promise.all([
      pool.query("SELECT daily_reward_min,daily_reward_max,enabled FROM app_task_settings WHERE id=1"),
      pool.query("SELECT coins,created_at FROM daily_reward_claims WHERE user_id=$1 AND reward_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date",[req.user.id]),
      pool.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id])
    ]);
    const settings=cfg.rows[0]||{daily_reward_min:50,daily_reward_max:500,enabled:true};
    res.json({minCoins:Number(settings.daily_reward_min),maxCoins:Number(settings.daily_reward_max),enabled:settings.enabled,claimed:!!claim.rowCount,claimedCoins:claim.rowCount?Number(claim.rows[0].coins):0,claimDate:claim.rowCount?claim.rows[0].created_at:null,balance:Number(wallet.rows[0]?.balance||0)});
  } catch(err) { console.error("daily reward status failed",err);res.status(500).json({error:"Could not load daily reward status."}); }
});
app.post("/api/daily-rewards/claim",auth,async(req,res)=>{
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const cfg=await client.query("SELECT daily_reward_min,daily_reward_max,enabled FROM app_task_settings WHERE id=1 FOR SHARE");
    const settings=cfg.rows[0]||{daily_reward_min:50,daily_reward_max:500,enabled:true};
    if(!settings.enabled){await client.query("ROLLBACK");return res.status(403).json({error:"Daily rewards are currently disabled."});}
    const min=Number(settings.daily_reward_min),max=Number(settings.daily_reward_max);
    const coins=Math.floor(Math.random()*(max-min+1))+min;
    const claim=await client.query("INSERT INTO daily_reward_claims(user_id,reward_date,coins) VALUES($1,(NOW() AT TIME ZONE 'Asia/Kolkata')::date,$2) ON CONFLICT(user_id,reward_date) DO NOTHING RETURNING coins",[req.user.id,coins]);
    if(!claim.rowCount){
      await client.query("ROLLBACK");
      const prev=await pool.query("SELECT coins FROM daily_reward_claims WHERE user_id=$1 AND reward_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date",[req.user.id]);
      return res.status(409).json({error:"You have already claimed today's reward.",claimed:true,coins:Number(prev.rows[0]?.coins||0)});
    }
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,100) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    await client.query("UPDATE wallet_accounts SET balance=balance+$1,updated_at=NOW() WHERE user_id=$2",[coins,req.user.id]);
    await client.query("INSERT INTO wallet_transactions(user_id,amount,kind,reference) VALUES($1,$2,'daily_reward',$3)",[req.user.id,coins,"daily-reward:"+(new Date().toISOString().slice(0,10))]);
    const bal=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id]);
    await client.query("COMMIT");
    res.json({notice:"Daily reward claimed successfully!",coins,balance:Number(bal.rows[0].balance),claimed:true});
  } catch(err) { await client.query("ROLLBACK").catch(()=>{});console.error("daily reward claim failed",err);res.status(500).json({error:"Could not claim daily reward. Please try again."}); }
  finally {client.release();}
});
app.get("/api/admin/task-settings",auth,requireAdmin,async(_req,res)=>{
  try { const q=await pool.query("SELECT female_only,live_hours,reward_usd,duration_days,enabled,daily_reward_min,daily_reward_max,updated_at FROM app_task_settings WHERE id=1"); res.json({settings:q.rows[0]}); }
  catch(err) { console.error("admin task settings read failed",err); res.status(500).json({error:"Could not load task settings."}); }
});
app.patch("/api/admin/task-settings",auth,requireAdmin,async(req,res)=>{
  const b=req.body||{}, hours=Number(b.live_hours), reward=Number(b.reward_usd), days=Number(b.duration_days), dailyMin=Number(b.daily_reward_min), dailyMax=Number(b.daily_reward_max);
  if(typeof b.female_only!=="boolean"||typeof b.enabled!=="boolean"||!Number.isFinite(hours)||hours<=0||hours>168||!Number.isFinite(reward)||reward<0||reward>100000||!Number.isInteger(days)||days<1||days>365||!Number.isInteger(dailyMin)||dailyMin<50||dailyMin>5000||!Number.isInteger(dailyMax)||dailyMax<dailyMin||dailyMax>5000) return res.status(400).json({error:"Invalid settings. Daily reward must be 50–5000 coins and max must be at least min."});
  try { const q=await pool.query("UPDATE app_task_settings SET female_only=$1,live_hours=$2,reward_usd=$3,duration_days=$4,enabled=$5,daily_reward_min=$7,daily_reward_max=$8,updated_at=NOW(),updated_by=$6 WHERE id=1 RETURNING female_only,live_hours,reward_usd,duration_days,enabled,daily_reward_min,daily_reward_max,updated_at",[b.female_only,hours,reward,days,b.enabled,req.user.id,dailyMin,dailyMax]); res.json({notice:"Task settings saved to database.",settings:q.rows[0]}); }
  catch(err) { console.error("admin task settings save failed",err); res.status(500).json({error:"Could not save task settings."}); }
});
app.post("/api/agency/applications",auth,rateLimit({windowMs:60*60*1000,limit:3,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
  const fullName=String(req.body?.fullName||"").trim();
  const funLiveId=String(req.body?.funLiveId||"").trim();
  const monthlyEarning=Number(req.body?.monthlyEarning);
  const earningCurrency=String(req.body?.earningCurrency||"");
  const coinRequirement=Number(req.body?.coinRequirement);
  const coinUnit=String(req.body?.coinUnit||"");
  const additionalInfo=String(req.body?.additionalInfo||"").trim();
  if(!fullName||fullName.length>100||!funLiveId||funLiveId.length>60||!Number.isFinite(monthlyEarning)||monthlyEarning<0||!["USD","INR","BDT","PKR","PHP"].includes(earningCurrency)||!Number.isSafeInteger(coinRequirement)||coinRequirement<1||coinRequirement>9000000000000||!["Coins","USD","INR"].includes(coinUnit)||additionalInfo.length>1000)
    return res.status(400).json({error:"Please check all agency application fields."});
  try{
    const r=await pool.query("INSERT INTO agency_applications(user_id,full_name,fun_live_id,monthly_earning,earning_currency,coin_requirement,coin_unit,additional_info) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,created_at",[req.user.id,fullName,funLiveId,monthlyEarning,earningCurrency,coinRequirement,coinUnit,additionalInfo]);
    return res.status(201).json({application:{id:r.rows[0].id,status:r.rows[0].status,createdAt:r.rows[0].created_at},message:"Your agency application has been submitted for review."});
  }catch(err){console.error("Agency application save failed",err);return res.status(500).json({error:"Could not save application. Please try again later."});}
});
app.get("/api/admin/agency-applications",auth,requireAdmin,async(req,res)=>{
  const status=String(req.query.status||"pending");
  if(!["pending","approved","rejected","all"].includes(status))return res.status(400).json({error:"Invalid status filter."});
  try{
    const r=await pool.query("SELECT a.id,a.user_id,u.username,a.full_name,a.fun_live_id,a.monthly_earning,a.earning_currency,a.coin_requirement,a.coin_unit,a.additional_info,a.status,a.created_at,a.reviewed_at FROM agency_applications a JOIN users u ON u.id=a.user_id "+(status==="all"?"":"WHERE a.status=$1 ")+"ORDER BY a.created_at DESC LIMIT 200",status==="all"?[]:[status]);
    res.json({applications:r.rows});
  }catch(err){console.error("Agency application list failed",err);res.status(500).json({error:"Could not load agency applications."});}
});
app.patch("/api/admin/agency-applications/:id",auth,requireAdmin,async(req,res)=>{
  const id=String(req.params.id||"");
  const status=String(req.body?.status||"");
  if(!/^\d+$/.test(id)||!["approved","rejected"].includes(status))return res.status(400).json({error:"Choose approve or reject for a valid application."});
  try{
    const r=await pool.query("UPDATE agency_applications SET status=$1,reviewed_at=NOW(),reviewed_by=$2 WHERE id=$3 AND status='pending' RETURNING id,status,reviewed_at",[status,req.user.id,id]);
    if(!r.rowCount)return res.status(404).json({error:"Pending application not found. It may already have been reviewed."});
    res.json({application:r.rows[0],notice:"Agency application "+status+"."});
  }catch(err){console.error("Agency application review failed",err);res.status(500).json({error:"Could not update agency application."});}
});
app.get("/api/admin/overview",auth,requireAdmin,async(_req,res)=>{
  try{
    const [users,rooms,live,withdrawals,pending,payments,gifts,calls,reports]=await Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM users"),
      pool.query("SELECT COUNT(*)::int AS n FROM rooms"),
      pool.query("SELECT COUNT(*)::int AS n FROM rooms WHERE kind='live'"),
      pool.query("SELECT COUNT(*)::int AS n FROM withdrawal_requests"),
      pool.query("SELECT COUNT(*)::int AS n FROM withdrawal_requests WHERE status='pending'"),
      pool.query("SELECT COUNT(*)::int AS n FROM payment_orders WHERE status='paid'"),
      pool.query("SELECT COUNT(*)::int AS n FROM live_gifts"),
      pool.query("SELECT COUNT(*)::int AS n FROM call_requests"),
      pool.query("SELECT COUNT(*)::int AS n FROM live_reports")
    ]);
    res.json({stats:{total_users:users.rows[0].n,total_rooms:rooms.rows[0].n,live_rooms:live.rows[0].n,total_withdrawals:withdrawals.rows[0].n,pending_withdrawals:pending.rows[0].n,paid_orders:payments.rows[0].n,total_gifts:gifts.rows[0].n,total_calls:calls.rows[0].n,live_reports:reports.rows[0].n}});
  }catch{res.status(500).json({error:"Could not load admin overview."});}
});
app.get("/api/admin/users",auth,requireAdmin,async(_req,res)=>{
  try{const r=await pool.query("SELECT id,username,email,is_blocked,created_at FROM users ORDER BY created_at DESC LIMIT 500");res.json({users:r.rows});}
  catch{res.status(500).json({error:"Could not load users."});}
});
app.patch("/api/admin/users/:id/block",auth,requireAdmin,async(req,res)=>{
  if(!/^\d+$/.test(req.params.id)) return res.status(400).json({error:"Invalid user ID."});
  if(String(req.params.id)===String(req.user.id)) return res.status(400).json({error:"You cannot block your own admin account."});
  const blocked=req.body?.blocked;
  if(typeof blocked!=="boolean") return res.status(400).json({error:"blocked must be true or false."});
  try{
    const r=await pool.query("UPDATE users SET is_blocked=$1 WHERE id=$2 RETURNING id,username,is_blocked",[blocked,req.params.id]);
    if(!r.rowCount) return res.status(404).json({error:"User not found."});
    res.json({user:r.rows[0],notice:blocked?"User blocked. Their current sessions will be denied on the next API request.":"User unblocked."});
  }catch{res.status(500).json({error:"Could not update user status."});}
});
app.get("/api/admin/hosts",auth,requireAdmin,async(_req,res)=>{
  try{const r=await pool.query("SELECT u.id,u.username,COUNT(DISTINCT rm.id)::int AS live_rooms,COALESCE(d.balance,0)::bigint AS diamonds FROM users u LEFT JOIN rooms rm ON rm.owner_id=u.id AND rm.kind='live' LEFT JOIN diamond_accounts d ON d.user_id=u.id GROUP BY u.id,u.username,d.balance ORDER BY live_rooms DESC,u.created_at DESC LIMIT 500");res.json({hosts:r.rows});}
  catch{res.status(500).json({error:"Could not load host candidates."});}
});
app.get("/api/admin/coin-balances",auth,requireAdmin,async(_req,res)=>{
  try{
    const r=await pool.query("SELECT u.id,u.username,COALESCE(w.balance,0)::bigint AS coins FROM users u LEFT JOIN wallet_accounts w ON w.user_id=u.id ORDER BY u.id DESC LIMIT 500");
    res.json({balances:r.rows.map(u=>({...u,internalId:u.id,id:String(7000000+Number(u.id))}))});
  }catch{res.status(500).json({error:"Could not load coin balances."});}
});
app.post("/api/admin/coin-credit",auth,requireAdmin,async(req,res)=>{
  const publicUserId=String(req.body?.userId||"").trim();
  const coins=Number(req.body?.coins);
  if(publicUserId===""||!Number.isSafeInteger(Number(publicUserId))||Number(publicUserId)<7000001) return res.status(400).json({error:"Enter a valid 7-digit FUN LIVE User ID (example: 7008890)."});
  const userId=String(Number(publicUserId)-7000000);
  if(!Number.isSafeInteger(coins)||coins<1||coins>1000000000) return res.status(400).json({error:"Enter a whole coin amount from 1 to 1,000,000,000."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const user=await client.query("SELECT id,username FROM users WHERE id=$1 FOR UPDATE",[userId]);
    if(!user.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"User ID not found."});}
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING",[userId]);
    const wallet=await client.query("UPDATE wallet_accounts SET balance=balance+$1,updated_at=NOW() WHERE user_id=$2 RETURNING balance",[coins,userId]);
    await client.query("INSERT INTO wallet_transactions(user_id,amount,kind,reference) VALUES($1,$2,'admin_coin_credit',$3)",[userId,coins,"admin:"+String(req.user.id)+";direct FUN LIVE coin credit"]);
    await client.query("COMMIT");
    res.json({notice:"FUN LIVE coins added successfully.",user:{id:String(7000000+Number(user.rows[0].id)),username:user.rows[0].username,balance:wallet.rows[0].balance},coinsAdded:coins});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});res.status(500).json({error:"Could not add coins. No coins were credited."});}
  finally{client.release();}
});
app.post("/api/admin/coin-transfer",auth,requireAdmin,async(req,res)=>{
  const fromId=String(req.body?.fromUserId||"").trim();
  const toId=String(req.body?.toUserId||"").trim();
  const coins=Number(req.body?.coins);
  const reason=String(req.body?.reason||"Admin transfer").trim().slice(0,180);
  if(!/^\d+$/.test(fromId)||!/^\d+$/.test(toId)) return res.status(400).json({error:"Enter valid sender and receiver user IDs."});
  if(fromId===toId) return res.status(400).json({error:"Sender and receiver must be different users."});
  if(!Number.isSafeInteger(coins)||coins<1||coins>1000000000) return res.status(400).json({error:"Enter a coin amount from 1 to 1,000,000,000."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const users=await client.query("SELECT id,username FROM users WHERE id=ANY($1::bigint[]) ORDER BY id",[ [fromId,toId] ]);
    if(users.rowCount!==2){await client.query("ROLLBACK");return res.status(404).json({error:"Sender or receiver user was not found."});}
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,0),($2,0) ON CONFLICT(user_id) DO NOTHING",[fromId,toId]);
    const accounts=await client.query("SELECT user_id,balance FROM wallet_accounts WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE",[[fromId,toId]]);
    const sender=accounts.rows.find(x=>String(x.user_id)===fromId);
    const receiver=accounts.rows.find(x=>String(x.user_id)===toId);
    if(!sender||!receiver){await client.query("ROLLBACK");return res.status(500).json({error:"Could not load sender and receiver wallets."});}
    if(Number(sender.balance)<coins){await client.query("ROLLBACK");return res.status(409).json({error:"Sender does not have enough coins.",available:Number(sender.balance)});}
    await client.query("UPDATE wallet_accounts SET balance=balance-$1,updated_at=NOW() WHERE user_id=$2",[coins,fromId]);
    await client.query("UPDATE wallet_accounts SET balance=balance+$1,updated_at=NOW() WHERE user_id=$2",[coins,toId]);
    const ref="admin:"+String(req.user.id)+";reason:"+reason;
    await client.query("INSERT INTO wallet_transactions(user_id,amount,kind,reference) VALUES($1,$2,'admin_transfer_out',$3),($4,$5,'admin_transfer_in',$3)",[fromId,-coins,ref,toId,coins]);
    const updated=await client.query("SELECT u.id,u.username,w.balance FROM users u JOIN wallet_accounts w ON w.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id",[[fromId,toId]]);
    await client.query("COMMIT");
    res.json({notice:"Coin transfer completed.",coins,from:updated.rows.find(x=>String(x.id)===fromId),to:updated.rows.find(x=>String(x.id)===toId)});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});res.status(500).json({error:"Coin transfer failed. No coins were transferred."});}
  finally{client.release();}
});
app.get("/api/admin/payments",auth,requireAdmin,async(_req,res)=>{
  try{const r=await pool.query("SELECT p.order_id,p.user_id,u.username,p.amount_paise,p.coins,p.status,p.created_at,p.paid_at FROM payment_orders p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 300");res.json({payments:r.rows});}
  catch{res.status(500).json({error:"Could not load payments."});}
});
app.get("/api/admin/rooms",auth,requireAdmin,async(_req,res)=>{
  try{const r=await pool.query("SELECT rm.id,rm.title,rm.kind,rm.created_at,u.username AS host FROM rooms rm JOIN users u ON u.id=rm.owner_id ORDER BY rm.created_at DESC LIMIT 300");res.json({rooms:r.rows});}
  catch{res.status(500).json({error:"Could not load rooms."});}
});
app.get("/api/admin/reports",auth,requireAdmin,async(_req,res)=>{
  try{const r=await pool.query("SELECT lr.id,lr.room_id,u.username AS reporter,lr.reason,lr.details,lr.created_at FROM live_reports lr JOIN users u ON u.id=lr.reporter_id ORDER BY lr.created_at DESC LIMIT 300");res.json({reports:r.rows});}
  catch{res.status(500).json({error:"Could not load reports."});}
});
app.get("/api/admin/gifts",auth,requireAdmin,async(_req,res)=>{
  try{const r=await pool.query("SELECT gift_key,COUNT(*)::int AS count,COALESCE(SUM(coins),0)::bigint AS coins,MAX(created_at) AS latest FROM live_gifts GROUP BY gift_key ORDER BY coins DESC LIMIT 100");res.json({gifts:r.rows});}
  catch{res.status(500).json({error:"Could not load gift history."});}
});
app.get("/api/admin/calls",auth,requireAdmin,async(_req,res)=>{
  try{const r=await pool.query("SELECT c.id,c.status,c.created_at,a.username AS caller,b.username AS callee FROM call_requests c JOIN users a ON a.id=c.caller_id JOIN users b ON b.id=c.callee_id ORDER BY c.created_at DESC LIMIT 300");res.json({calls:r.rows});}
  catch{res.status(500).json({error:"Could not load call history."});}
});
app.get("/api/admin/withdrawals",auth,requireAdmin,async(req,res)=>{
  const status=String(req.query.status||"all");
  if(!["all","pending","approved","paid","rejected"].includes(status)) return res.status(400).json({error:"Invalid status filter."});
  try{
    const result=await pool.query(
      "SELECT w.id,w.user_id,u.username,u.email,w.diamonds,w.usd_amount,w.usd_inr_rate,w.inr_amount,w.payout_details,w.status,w.created_at,w.updated_at FROM withdrawal_requests w JOIN users u ON u.id=w.user_id "+(status==="all"?"":"WHERE w.status=$1 ")+"ORDER BY w.created_at DESC LIMIT 200",
      status==="all"?[]:[status]
    );
    res.json({withdrawals:result.rows});
  }catch{res.status(500).json({error:"Could not load withdrawal requests."});}
});
app.patch("/api/admin/withdrawals/:id",auth,requireAdmin,async(req,res)=>{
  if(!/^[0-9]+$/.test(req.params.id)) return res.status(400).json({error:"Invalid withdrawal ID."});
  const nextStatus=String(req.body?.status||"");
  if(!["approved","rejected","paid"].includes(nextStatus)) return res.status(400).json({error:"Status must be approved, rejected, or paid."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT * FROM withdrawal_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Withdrawal request not found."});}
    const w=found.rows[0];
    if(w.status==="paid"||w.status==="rejected"){await client.query("ROLLBACK");return res.status(409).json({error:"Paid or rejected requests cannot be changed."});}
    if(nextStatus==="paid"&&w.status!=="approved"){await client.query("ROLLBACK");return res.status(409).json({error:"Approve the request before marking it paid. Confirm the real transfer first."});}
    if(nextStatus==="rejected"){
      await client.query("INSERT INTO diamond_accounts(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING",[w.user_id]);
      await client.query("UPDATE diamond_accounts SET balance=balance+$1,updated_at=NOW() WHERE user_id=$2",[w.diamonds,w.user_id]);
    }
    const updated=await client.query("UPDATE withdrawal_requests SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,user_id,diamonds,usd_amount,inr_amount,status,updated_at",[nextStatus,w.id]);
    await client.query("COMMIT");
    res.json({withdrawal:updated.rows[0],notice:nextStatus==="paid"?"Marked paid by admin. Ensure the UPI/bank transfer was completed separately.":nextStatus==="rejected"?"Request rejected; diamonds refunded to the user's balance.":"Request approved. This does not transfer money automatically."});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});res.status(500).json({error:"Could not update withdrawal status."});}
  finally{client.release();}
});
app.post("/api/calls/:id/end", auth, async (req,res) => {
  if(!/^\d+$/.test(req.params.id)) return res.status(400).json({error:"Invalid call ID."});
  try {
    const r=await pool.query("UPDATE call_requests SET status='ended',updated_at=NOW() WHERE id=$1 AND (caller_id=$2 OR callee_id=$2) AND status IN ('ringing','accepted') RETURNING id,status",[req.params.id,req.user.id]);
    if(!r.rowCount) return res.status(404).json({error:"Call not found or already ended."});
    res.json({call:r.rows[0]});
  } catch { res.status(500).json({error:"Could not end call."}); }
});
app.post("/api/live/token", auth, async (req,res) => {
  const roomName=String(req.body?.roomName||"").trim();
  if (!roomName || roomName.length>100 || !/^[a-zA-Z0-9_-]+$/.test(roomName)) return res.status(400).json({error:"Room name is invalid."});
  const appId=process.env.AGORA_APP_ID;
  const certificate=process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !certificate) return res.status(503).json({error:"Agora is not configured yet. Add AGORA_APP_ID and AGORA_APP_CERTIFICATE to the backend environment."});
  try {
    const match=roomName.match(/^room-(\d+)$/);
    if (!match) return res.status(400).json({error:"Room name is invalid."});
    const roomId=match[1];
    const roomResult=await pool.query("SELECT id,kind,owner_id FROM rooms WHERE id=$1",[roomId]);
    if (!roomResult.rowCount) return res.status(404).json({error:"Live room not found."});
    const callResult=await pool.query("SELECT caller_id,callee_id,status FROM call_requests WHERE room_id=$1 ORDER BY id DESC LIMIT 1",[roomId]);
    if (callResult.rowCount) {
      const activeCall=callResult.rows[0];
      if (activeCall.status!=="accepted") return res.status(410).json({error:"This call is not active or has ended."});
      if (![String(activeCall.caller_id),String(activeCall.callee_id)].includes(String(req.user.id))) return res.status(403).json({error:"This one-to-one call is private."});
    }
    const uid=Number(req.user.id);
    if (!Number.isSafeInteger(uid) || uid<1 || uid>2147483647) return res.status(400).json({error:"User ID is outside Agora's supported range."});
    const isCall=Boolean(callResult.rowCount);
    const isHost=isCall || String(roomResult.rows[0].owner_id)===String(req.user.id);
    const privilegeExpiredTs=Math.floor(Date.now()/1000)+3600;
    const rtcToken=RtcTokenBuilder.buildTokenWithUid(appId,certificate,roomName,uid,RTC_ROLE_PUBLISHER,privilegeExpiredTs);
    res.json({appId,channelName:roomName,token:rtcToken,uid,role:isHost?"host":"audience",mode:isCall?"rtc":"live",hostUserId:Number(roomResult.rows[0].owner_id)});
  } catch (e) {
    console.error("Agora token generation failed:",e?.message||"unknown error");
    res.status(500).json({error:"Could not create Agora media token. Check Agora App ID and Certificate configuration."});
  }
});
const COIN_PACKAGES = Object.freeze({9900:900,49900:5000,99900:10500,499000:55000});
app.post("/api/payments/order", auth, paymentOrderLimiter, async (req,res) => {
  const amount=Number(req.body?.amountPaise);
  const coins=COIN_PACKAGES[amount];
  if (!Number.isInteger(amount) || !coins) return res.status(400).json({error:"Choose one of the available coin packages."});
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({error:"Coin purchase is not enabled yet. Razorpay credentials must be configured securely on the server."});
  try {
    const razorpay=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
    const order=await razorpay.orders.create({amount,currency:"INR",receipt:"gls_"+req.user.id+"_"+Date.now(),notes:{userId:String(req.user.id),coins:String(coins),purpose:"fun_live_coin_topup"}});
    await pool.query("INSERT INTO payment_orders(order_id,user_id,amount_paise,coins) VALUES($1,$2,$3,$4)",[order.id,req.user.id,amount,coins]);
    res.status(201).json({orderId:order.id,amount:order.amount,currency:order.currency,keyId:process.env.RAZORPAY_KEY_ID,coins});
  } catch(e) {console.error("Payment order creation failed:",e?.message||"unknown error");res.status(502).json({error:"Payment provider could not create an order."});}
});
app.post("/api/payments/verify", auth, paymentVerifyLimiter, async (req,res) => {
  const {orderId,paymentId,signature}=req.body||{};
  if (!orderId||!paymentId||!signature||!process.env.RAZORPAY_KEY_SECRET) return res.status(400).json({error:"Missing payment verification fields or gateway configuration."});
  const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(String(orderId)+"|"+String(paymentId)).digest("hex");
  const a=Buffer.from(expected); const b=Buffer.from(String(signature));
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(400).json({error:"Payment signature invalid."});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const order=await client.query("SELECT order_id,user_id,amount_paise,coins,status,payment_id FROM payment_orders WHERE order_id=$1 AND user_id=$2 FOR UPDATE",[String(orderId),req.user.id]);
    if(!order.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Payment order not found for this account."});}
    const row=order.rows[0];
    if(row.status==="paid"){
      if(row.payment_id!==String(paymentId)){await client.query("ROLLBACK");return res.status(409).json({error:"Order already credited against another payment."});}
      const bal=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id]);
      await client.query("COMMIT");return res.json({verified:true,alreadyCredited:true,balance:Number(bal.rows[0]?.balance||0),coins:Number(row.coins)});
    }
    await client.query("INSERT INTO wallet_accounts(user_id,balance) VALUES($1,100) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    await client.query("UPDATE wallet_accounts SET balance=balance+$1,updated_at=NOW() WHERE user_id=$2",[Number(row.coins),req.user.id]);
    await client.query("INSERT INTO wallet_transactions(user_id,amount,kind,reference) VALUES($1,$2,'coin_purchase',$3)",[req.user.id,Number(row.coins),String(orderId)]);
    await client.query("UPDATE payment_orders SET status='paid',payment_id=$1,paid_at=NOW() WHERE order_id=$2",[String(paymentId),String(orderId)]);
    const bal=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id]);
    await client.query("COMMIT");
    res.json({verified:true,balance:Number(bal.rows[0].balance),coins:Number(row.coins)});
  } catch(e) {await client.query("ROLLBACK").catch(()=>{});console.error("Payment verification failed:",e?.message||"unknown error");res.status(500).json({error:"Could not credit verified payment."});}
  finally {client.release();}
});
app.post("/api/users/:id/follow", auth, async (req,res) => {
  const target=String(req.params.id||"");
  if(!/^\d+$/.test(target)||target===String(req.user.id)) return res.status(400).json({error:"Choose another valid user."});
  try {
    const user=await pool.query("SELECT id FROM users WHERE id=$1",[target]);
    if(!user.rowCount)return res.status(404).json({error:"User not found."});
    const existing=await pool.query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",[req.user.id,target]);
    if(existing.rowCount) await pool.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2",[req.user.id,target]);
    else await pool.query("INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.user.id,target]);
    const count=await pool.query("SELECT COUNT(*)::int AS count FROM follows WHERE following_id=$1",[target]);
    res.json({following:!existing.rowCount,followers:count.rows[0].count});
  } catch {res.status(500).json({error:"Could not update follow."});}
});
app.get("/api/users/:id/follow-status", auth, async (req,res) => {
  if(!/^\d+$/.test(String(req.params.id||"")))return res.status(400).json({error:"Invalid user."});
  try {
    const [f,c]=await Promise.all([
      pool.query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",[req.user.id,req.params.id]),
      pool.query("SELECT COUNT(*)::int AS count FROM follows WHERE following_id=$1",[req.params.id])
    ]);
    res.json({following:Boolean(f.rowCount),followers:c.rows[0].count});
  } catch {res.status(500).json({error:"Could not load follow status."});}
});
app.post("/api/live/report", auth, async (req,res) => {
  const roomId=String(req.body?.roomId||"");
  const reason=String(req.body?.reason||"").trim().slice(0,80);
  const details=String(req.body?.details||"").trim().slice(0,500);
  if(!/^\d+$/.test(roomId)||!["Harassment","Nudity or sexual content","Violence","Spam or scam","Underage safety","Other"].includes(reason))return res.status(400).json({error:"Choose a valid live room and report reason."});
  try {
    const room=await pool.query("SELECT id FROM rooms WHERE id=$1 AND kind='live'",[roomId]);
    if(!room.rowCount)return res.status(404).json({error:"Live room not found."});
    const existing=await pool.query("SELECT 1 FROM live_reports WHERE room_id=$1 AND reporter_id=$2 AND created_at>NOW()-INTERVAL '10 minutes'",[roomId,req.user.id]);
    if(existing.rowCount)return res.status(429).json({error:"You already reported this live recently."});
    await pool.query("INSERT INTO live_reports(room_id,reporter_id,reason,details) VALUES($1,$2,$3,$4)",[roomId,req.user.id,reason,details]);
    res.status(201).json({ok:true,message:"Report submitted for review. Thank you."});
  } catch {res.status(500).json({error:"Could not submit report."});}
});
app.get("/api/rankings/weekly", async (_req,res) => {
  try {
    const r=await pool.query(`SELECT u.id,u.username,COALESCE(SUM(g.coins),0)::bigint AS coins,COUNT(g.id)::int AS gifts
      FROM users u LEFT JOIN live_gifts g ON g.receiver_id=u.id AND g.created_at>=NOW()-INTERVAL '7 days'
      GROUP BY u.id,u.username ORDER BY coins DESC,gifts DESC,u.username ASC LIMIT 20`);
    res.json({period:"last_7_days",rankings:r.rows.map((u,i)=>({...u,rank:i+1,coins:Number(u.coins)}))});
  } catch {res.status(500).json({error:"Could not load weekly rankings."});}
});

app.get("/api/rooms", async (_req,res) => {
  try { const r=await pool.query("SELECT r.id,r.title,r.kind,r.created_at,u.username AS host FROM rooms r JOIN users u ON u.id=r.owner_id ORDER BY r.created_at DESC LIMIT 100"); res.json({ rooms:r.rows }); }
  catch { res.status(500).json({ error:"Could not load rooms." }); }
});
app.post("/api/rooms", auth, async (req,res) => {
  const title=String(req.body?.title||"").trim(); const kind=String(req.body?.kind||"voice");
  if (!title || title.length>100 || !["voice","live"].includes(kind)) return res.status(400).json({error:"Room title or type is invalid."});
  try { const r=await pool.query("INSERT INTO rooms(owner_id,title,kind) VALUES($1,$2,$3) RETURNING id,title,kind,created_at",[req.user.id,title,kind]); res.status(201).json({room:{...r.rows[0],host:req.user.username},notice:"Room metadata created. Live media provider must be configured for audio/video."}); }
  catch { res.status(500).json({error:"Could not create room."}); }
});
app.get("/api/rooms/:id/messages", auth, async (req,res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({error:"Invalid room id."});
  try { const r=await pool.query("SELECT m.id,m.room_id,m.body,m.created_at,u.username FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT 100",[req.params.id]); res.json({messages:r.rows.reverse()}); }
  catch { res.status(500).json({error:"Could not load messages."}); }
});
app.use((_req,res)=>res.status(404).json({error:"Not found."}));
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:"Unexpected server error."}); });
initDb().then(()=>httpServer.listen(PORT,()=>console.log("GO LIVE API listening on "+PORT))).catch(err=>{console.error("Database initialization failed",err);process.exit(1)});
