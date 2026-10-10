import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { AccessToken } from "livekit-server-sdk";
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
  `);
}
function tokenFor(user) { return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: "7d", issuer: "go-live-stream" }); }
async function auth(req, res, next) {
  const raw = req.headers.authorization || "";
  if (!raw.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in required." });
  try {
    const payload = jwt.verify(raw.slice(7), JWT_SECRET, { issuer: "go-live-stream" });
    const result = await pool.query("SELECT id, username, email, bio, created_at FROM users WHERE id=$1", [payload.sub]);
    if (!result.rowCount) return res.status(401).json({ error: "Account not found." });
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
  socket.on("room:join", async ({ roomId } = {}, done = () => {}) => {
    if (!/^\d+$/.test(String(roomId || ""))) return done({ error: "Invalid room." });
    const r = await pool.query("SELECT id FROM rooms WHERE id=$1", [roomId]);
    if (!r.rowCount) return done({ error: "Room not found." });
    socket.join("room:" + roomId); done({ ok: true });
  });
  socket.on("room:message", async ({ roomId, body } = {}, done = () => {}) => {
    try {
      const message = String(body || "").trim();
      if (!/^\d+$/.test(String(roomId || "")) || !message || message.length > 500) return done({ error: "Message or room is invalid." });
      const room = await pool.query("SELECT id FROM rooms WHERE id=$1", [roomId]);
      if (!room.rowCount) return done({ error: "Room not found." });
      const result = await pool.query("INSERT INTO messages(room_id,user_id,body) VALUES($1,$2,$3) RETURNING id,room_id,body,created_at", [roomId, socket.user.sub, message]);
      const payload = { ...result.rows[0], username: socket.user.username };
      io.to("room:" + roomId).emit("room:message", payload); done({ ok: true, message: payload });
    } catch { done({ error: "Could not send message." }); }
  });
});
app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true, service: "go-live-stream-api", database: "connected" }); }
  catch { res.status(503).json({ ok: false, database: "unavailable" }); }
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
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query("INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email,bio,created_at", [username,email,hash]);
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
    const result = await pool.query("SELECT id,username,email,bio,created_at,password_hash FROM users WHERE email=$1", [email]);
    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
    const { password_hash, ...user } = result.rows[0];
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
app.post("/api/live/token", auth, async (req,res) => {
  const roomName=String(req.body?.roomName||"").trim();
  if (!roomName || roomName.length>100 || !/^[a-zA-Z0-9_-]+$/.test(roomName)) return res.status(400).json({error:"Room name is invalid."});
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return res.status(503).json({error:"LiveKit is not configured yet. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET."});
  try {
    const token=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{identity:String(req.user.id),name:req.user.username,ttl:"1h"});
    token.addGrant({roomJoin:true,room:roomName,canPublish:true,canSubscribe:true,canPublishData:true});
    res.json({url:process.env.LIVEKIT_URL,token:await token.toJwt(),roomName});
  } catch { res.status(500).json({error:"Could not create live session."}); }
});
app.post("/api/payments/order", auth, async (req,res) => {
  const amount=Number(req.body?.amountPaise);
  if (!Number.isInteger(amount) || amount<100 || amount>1000000) return res.status(400).json({error:"Invalid order amount. Amount must be 100–1,000,000 paise."});
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({error:"Payment gateway is not configured. Add Razorpay credentials after account verification."});
  try {
    const razorpay=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
    const order=await razorpay.orders.create({amount,currency:"INR",receipt:"gls_"+req.user.id+"_"+Date.now(),notes:{userId:String(req.user.id),purpose:"coin_topup_pending_verification"}});
    res.status(201).json({orderId:order.id,amount:order.amount,currency:order.currency,keyId:process.env.RAZORPAY_KEY_ID,notice:"Do not credit coins until payment signature and webhook are verified."});
  } catch { res.status(502).json({error:"Payment provider could not create an order."}); }
});
app.post("/api/payments/verify", auth, async (req,res) => {
  const {orderId,paymentId,signature}=req.body||{};
  if (!orderId||!paymentId||!signature||!process.env.RAZORPAY_KEY_SECRET) return res.status(400).json({error:"Missing payment verification fields or gateway configuration."});
  const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(String(orderId)+"|"+String(paymentId)).digest("hex");
  const a=Buffer.from(expected); const b=Buffer.from(String(signature));
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(400).json({error:"Payment signature invalid."});
  res.status(200).json({verified:true,notice:"Signature verified. Coin crediting is intentionally disabled until idempotent ledger/webhook processing is enabled."});
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
