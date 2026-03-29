import { useRef, useCallback, useEffect } from 'react';
import type { WSMessage, WSMessageType } from '../types';

type MessageHandlers = Partial<Record<WSMessageType, (payload: unknown) => void>>;

const WS_URL =
  typeof window !== 'undefined'
    ? `ws://${window.location.host}/ws`
    : 'ws://localhost:5173/ws';

export function useWebSocket(handlers: MessageHandlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandlers>(handlers);

  // Keep handlers up to date without recreating the socket
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => console.log('[WS] connected');
    ws.onclose = () => console.log('[WS] closed');
    ws.onerror = (e) => console.error('[WS] error', e);

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(ev.data as string);
        handlersRef.current[msg.type]?.(msg.payload);
      } catch (e) {
        console.error('[WS] parse error', e);
      }
    };

    wsRef.current = ws;
  }, []);

  const send = useCallback((msg: WSMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      // Retry after short delay for connection to establish
      setTimeout(() => {
        wsRef.current?.send(JSON.stringify(msg));
      }, 200);
      return;
    }
    wsRef.current.send(JSON.stringify(msg));
  }, [connect]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { send };
}
