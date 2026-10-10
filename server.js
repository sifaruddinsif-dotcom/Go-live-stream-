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
  socket.on("live:join", async ({ roomId } = {}, done = () => {}) => {
    try {
      if (!/^\d+$/.test(String(roomId || ""))) return done({ error: "Invalid live room." });
      const r = await pool.query("SELECT id,kind FROM rooms WHERE id=$1", [roomId]);
      if (!r.rowCount || r.rows[0].kind !== "live") return done({ error: "Live room not found." });
      const liveRoom = "live:" + roomId;
      await socket.join(liveRoom);
      const count = (await io.in(liveRoom).fetchSockets()).length;
      io.to(liveRoom).emit("live:count", { roomId: String(roomId), count });
      done({ ok: true, count });
    } catch { done({ error: "Could not join live room." }); }
  });
  socket.on("live:leave", async ({ roomId } = {}, done = () => {}) => {
    const liveRoom = "live:" + String(roomId || "");
    await socket.leave(liveRoom);
    const count = (await io.in(liveRoom).fetchSockets()).length;
    io.to(liveRoom).emit("live:count", { roomId: String(roomId), count });
    done({ ok: true, count });
  });
  socket.on("disconnecting", async () => {
    for (const roomName of socket.rooms) {
      if (roomName.startsWith("live:")) {
        const roomId = roomName.slice(5);
        setTimeout(async () => {
          const count = (await io.in(roomName).fetchSockets()).length;
          io.to(roomName).emit("live:count", { roomId, count });
        }, 0);
      }
    }
  });
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
const GIFT_CATALOG = Object.freeze({
  rose: { label: "Rose", emoji: "🌹", coins: 10 },
  heart: { label: "Heart", emoji: "💖", coins: 20 },
  crown: { label: "Crown", emoji: "👑", coins: 100 }
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
  if(!/^\\d+$/.test(roomId)||!gift) return res.status(400).json({error:"Choose a valid live room and gift."});
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
    await client.query("UPDATE wallet_accounts SET balance=balance-$1,updated_at=NOW() WHERE user_id=$2",[gift.coins,req.user.id]);
    await client.query("UPDATE wallet_accounts SET balance=balance+$1,updated_at=NOW() WHERE user_id=$2",[gift.coins,receiverId]);
    const tx=await client.query("INSERT INTO live_gifts(room_id,sender_id,receiver_id,gift_key,coins) VALUES($1,$2,$3,$4,$5) RETURNING id,room_id,gift_key,coins,created_at",[roomId,req.user.id,receiverId,giftKey,gift.coins]);
    await client.query("INSERT INTO wallet_transactions(user_id,amount,kind,reference) VALUES($1,$2,'gift_sent',$3),($4,$5,'gift_received',$3)",[req.user.id,-gift.coins,String(tx.rows[0].id),receiverId,gift.coins]);
    const balances=await client.query("SELECT balance FROM wallet_accounts WHERE user_id=$1",[req.user.id]);
    await client.query("COMMIT");
    const payload={...tx.rows[0],sender:req.user.username,...gift};
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
app.get("/api/gifts/catalog", (_req,res) => res.json({gifts:Object.entries(GIFT_CATALOG).map(([key,g])=>({key,...g}))});
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

app.get("/api/users/search", auth, async (req,res) => {
  const q=String(req.query.q||"").trim().replace(/^GLS/i,"").replace(/^0+/,"");
  if(!q || q.length>40) return res.json({users:[]});
  try {
    const r=await pool.query("SELECT id,username FROM users WHERE username ILIKE $1 OR id::text=$2 ORDER BY username LIMIT 10",["%"+q+"%",q]);
    res.json({users:r.rows.map(u=>({...u,goLiveId:"GLS"+String(u.id).padStart(8,"0")}))});
  } catch { res.status(500).json({error:"Could not search users."}); }
});
app.post("/api/calls", auth, async (req,res) => {
  const calleeId=String(req.body?.calleeId||"");
  if(!/^\d+$/.test(calleeId) || calleeId===String(req.user.id)) return res.status(400).json({error:"Choose another valid GO LIVE user."});
  try {
    const u=await pool.query("SELECT id FROM users WHERE id=$1",[calleeId]);
    if(!u.rowCount) return res.status(404).json({error:"User not found."});
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
    const r=await pool.query("UPDATE call_requests SET status=$1,updated_at=NOW() WHERE id=$2 AND callee_id=$3 AND status='ringing' RETURNING id,room_id,status,caller_id,callee_id",[decision,req.params.id,req.user.id]);
    if(!r.rowCount) return res.status(404).json({error:"Call request is no longer available."});
    res.json({call:r.rows[0]});
  } catch { res.status(500).json({error:"Could not respond to call."}); }
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
    res.json({appId,channelName:roomName,token:rtcToken,uid,role:isHost?"host":"audience",mode:isCall?"rtc":"live"});
  } catch (e) {
    console.error("Agora token generation failed:",e?.message||"unknown error");
    res.status(500).json({error:"Could not create Agora media token. Check Agora App ID and Certificate configuration."});
  }
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
