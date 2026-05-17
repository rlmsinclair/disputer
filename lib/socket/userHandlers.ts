import { Server, Socket } from "socket.io";

export function registerUserHandlers(_io: Server, socket: Socket) {
  socket.on("user:join", ({ userId }: { userId: string }) => {
    socket.join(`user:${userId}`);
  });

  socket.on("tournament:join", ({ tournamentId }: { tournamentId: string }) => {
    socket.join(`tournament:${tournamentId}`);
  });
}
