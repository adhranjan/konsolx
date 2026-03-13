import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { RefreshCw } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalComponentProps {
  cwd: string;
  env: Record<string, string>;
  shell?: string;
  initialCommand?: string;
  onClose: () => void;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({ cwd, env, shell, initialCommand, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    if (!terminalRef.current) return;

    setIsDisconnected(false);

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", monospace',
      convertEol: true,
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    if (terminalRef.current.offsetWidth > 0) {
      try {
        fitAddon.fit();
      } catch (e) {
        console.warn('Initial fit failed:', e);
      }
    }
    xtermRef.current = term;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ 
        type: 'init', 
        cwd, 
        env, 
        shell,
        cols: term.cols,
        rows: term.rows
      }));

      if (initialCommand) {
        // Wait a bit for the shell to be ready
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data: initialCommand + '\n' }));
          }
        }, 500);
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'output') {
        term.write(data.data);
      }
    };

    ws.onclose = (event) => {
      // Only show disconnected UI if it wasn't closed by our own cleanup
      if (wsRef.current === ws) {
        setIsDisconnected(true);
        if (event.wasClean) {
          term.write('\r\n[Terminal session closed]\r\n');
        } else {
          term.write('\r\n[Connection lost]\r\n');
        }
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => {
      if (terminalRef.current && terminalRef.current.offsetWidth > 0) {
        try {
          fitAddon.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: term.cols,
              rows: term.rows
            }));
          }
        } catch (e) {
          console.warn('Fit failed:', e);
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    window.addEventListener('resize', handleResize);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      resizeObserver.disconnect();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      term.dispose();
    };
  }, [cwd, JSON.stringify(env), shell, reconnectKey]);

  const handleRestart = () => {
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
