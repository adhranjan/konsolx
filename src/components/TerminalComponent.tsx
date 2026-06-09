import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { RefreshCw } from 'lucide-react';
import { terminalsApi } from '../api';
import 'xterm/css/xterm.css';

interface TerminalComponentProps {
  cwd:             string;
  shell?:          string;
  initialCommand?: string;
  isActive?:       boolean;
  sessionId?:      string;   // if provided, attach to existing session instead of creating
  title?:          string;
  groupName?:      string;
  groupColor?:     string;
  envId?:          string;
  vars?:           Record<string, string>;
  sortOrder?:      number;
  onClose:         () => void;
  onSessionReady?: (sessionId: string) => void;
  onSessionEnd?:   () => void;
  onInputReady?:   (sendInput: (cmd: string) => void) => void;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({
  cwd, shell, initialCommand, isActive,
  sessionId: existingSessionId, title, groupName, groupColor, envId, vars, sortOrder,
  onClose, onSessionReady, onSessionEnd, onInputReady,
}) => {
  const terminalRef    = useRef<HTMLDivElement>(null);
  const xtermRef       = useRef<Terminal | null>(null);
  const fitAddonRef    = useRef<FitAddon | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const sessionIdRef   = useRef<string | null>(null);
  const isFirstMount   = useRef(true);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [reconnectKey, setReconnectKey]     = useState(0);

  useEffect(() => {
    if (!terminalRef.current) return;

    setIsDisconnected(false);

    // ── 1. Boot xterm ────────────────────────────────────────────────────────
    const term = new Terminal({
      cursorBlink:  true,
      fontSize:     14,
      fontFamily:   '"JetBrains Mono", monospace',
      convertEol:   true,
      theme: { background: '#0a0a0a', foreground: '#e0e0e0' },
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    if (terminalRef.current.offsetWidth > 0) {
      try { fitAddon.fit(); } catch {}
    }
    xtermRef.current = term;

    let cancelled = false;

    // ── 2. Create or reuse session via HTTP ─────────────────────────────────
    // existingSessionId is only used on the very first mount (browser refresh restore).
    // Any re-run (env change, reconnect) always spawns a fresh session.
    const useExisting = isFirstMount.current && !!existingSessionId;
    isFirstMount.current = false;

    const sessionPromise = useExisting
      ? Promise.resolve({ sessionId: existingSessionId! })
      : terminalsApi.create({ cwd, shell, cols: term.cols, rows: term.rows, initialCommand, title, groupName, groupColor, envId, vars, sortOrder });

    sessionPromise.then(({ sessionId }) => {
      if (cancelled) {
        // Component unmounted before session was created — clean up immediately
        terminalsApi.delete(sessionId);
        return;
      }

      sessionIdRef.current = sessionId;
      onSessionReady?.(sessionId);

      // ── 3. Open WS and attach ──────────────────────────────────────────────
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'attach', sessionId }));

        onInputReady?.((cmd: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data: cmd + '\n' }));
          }
        });
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') term.write(msg.data);
        if (msg.type === 'exit')   term.write(msg.message ?? '\r\n[Session ended]\r\n');
        if (msg.type === 'error')  term.write(`\r\n[Error: ${msg.message}]\r\n`);
      };

      ws.onclose = (event) => {
        if (wsRef.current === ws) {
          setIsDisconnected(true);
          term.write(event.wasClean
            ? '\r\n[Terminal session closed]\r\n'
            : '\r\n[Connection lost]\r\n'
          );
        }
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });
    }).catch((err) => {
      term.write(`\r\n[Failed to start terminal: ${err.message}]\r\n`);
      setIsDisconnected(true);
    });

    // ── Ctrl+Shift+C → copy selection ────────────────────────────────────────
    const handleTerminalCopy = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {
            const el = document.createElement('textarea');
            el.value = selection;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
          });
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    terminalRef.current?.addEventListener('keydown', handleTerminalCopy, true);

    // ── Resize observer ──────────────────────────────────────────────────────
    const handleResize = () => {
      if (terminalRef.current && terminalRef.current.offsetWidth > 0) {
        try {
          fitAddon.fit();
          const ws = wsRef.current;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        } catch {}
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', handleResize);

    // No beforeunload warning — sessions persist on the server after browser close

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      terminalRef.current?.removeEventListener('keydown', handleTerminalCopy, true);
      onSessionEnd?.();

      // Just close the WebSocket — session keeps running on the server
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }

      term.dispose();
    };
  }, [cwd, shell, reconnectKey]); // env changes handled via PUT /api/terminals/:id/env/:envId — no remount needed

  // Fit when tab becomes active
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      if (terminalRef.current?.offsetWidth > 0 && fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
          const ws = wsRef.current;
          if (ws?.readyState === WebSocket.OPEN && xtermRef.current) {
            ws.send(JSON.stringify({ type: 'resize', cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
          }
        } catch {}
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  const handleRestart = () => {
    sessionIdRef.current = null;
    setReconnectKey(prev => prev + 1);
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a0a]">
      <div ref={terminalRef} className="w-full h-full" />
      {isDisconnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] z-10">
          <button
            onClick={handleRestart}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md shadow-lg transition-colors font-medium"
          >
            <RefreshCw size={18} />
            Restart Terminal
          </button>
        </div>
      )}
    </div>
  );
};

export default TerminalComponent;
