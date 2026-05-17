import "dotenv/config";
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { registerLobbyHandlers } from "@/lib/socket/lobbyHandlers";
import { registerDisputeHandlers, setupMatchTimers } from "@/lib/socket/disputeHandlers";
import { registerUserHandlers } from "@/lib/socket/userHandlers";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        "http://localhost:3000",
        ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // make io accessible to API routes via global
  (globalThis as unknown as { io: SocketIOServer }).io = io;

  // Recover timers for any in-progress tournament matches after restart
  setupMatchTimers(io).catch(console.error);

  io.on("connection", (socket) => {
    registerUserHandlers(io, socket);
    registerLobbyHandlers(io, socket);
    registerDisputeHandlers(io, socket);
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
