import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalComponentProps {
  cwd: string;
  env: Record<string, string>;
  shell?: string;
  onClose: () => void;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({ cwd, env, shell, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

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
    fitAddon.fit();
    xtermRef.current = term;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'init', cwd, env, shell }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'output') {
        term.write(data.data);
      }
    };

    ws.onclose = (event) => {
      if (event.wasClean) {
        term.write('\r\n[Terminal session closed]\r\n');
      } else {
        term.write('\r\n[Connection lost]\r\n');
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

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      term.dispose();
    };
  }, [cwd, JSON.stringify(env), shell]);

  return <div ref={terminalRef} className="w-full h-full bg-[#0a0a0a]" />;
};

export default TerminalComponent;
