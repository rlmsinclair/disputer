"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      withCredentials: true,
    });
  }
  return socket;
}

export function useSocket(
  eventHandlers: Record<string, (...args: unknown[]) => void>
) {
  const handlersRef = useRef(eventHandlers);
  handlersRef.current = eventHandlers;

  useEffect(() => {
    const s = getSocket();

    const attached: [string, (...args: unknown[]) => void][] = [];
    for (const [event, handler] of Object.entries(handlersRef.current)) {
      const wrapper = (...args: unknown[]) => handler(...args);
      s.on(event, wrapper);
      attached.push([event, wrapper]);
    }

    return () => {
      for (const [event, handler] of attached) {
        s.off(event, handler);
      }
    };
  }, []);

  return getSocket();
}
