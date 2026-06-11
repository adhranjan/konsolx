import React, { useEffect, useRef, useState } from 'react';
import { Terminal, IMarker } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { RefreshCw, Pin, X, ChevronUp, ChevronDown, PinOff } from 'lucide-react';
import { terminalsApi } from '../api';
import 'xterm/css/xterm.css';

interface Pin {
  id: string;
  text: string;
  addedAt: number;
}

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
  initialPins?:    Pin[];
  quickCommands?:  string[];   // command strings for autosuggest boosting
  sortOrder?:      number;
  onClose:         () => void;
  onSessionReady?: (sessionId: string) => void;
  onSessionEnd?:   () => void;
  onInputReady?:   (sendInput: (cmd: string) => void) => void;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({
  cwd, shell, initialCommand, isActive,
  sessionId: existingSessionId, title, groupName, groupColor, envId, vars, initialPins, quickCommands, sortOrder,
  onClose, onSessionReady, onSessionEnd, onInputReady,
}) => {
  const terminalRef    = useRef<HTMLDivElement>(null);
  const xtermRef       = useRef<Terminal | null>(null);
  const fitAddonRef    = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const sessionIdRef   = useRef<string | null>(null);
  const isFirstMount   = useRef(true);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [reconnectKey, setReconnectKey]     = useState(0);

  // ── Pins ──────────────────────────────────────────────────────────────────
  const [pins, setPins]           = useState<Pin[]>(initialPins ?? []);
  const [showPins, setShowPins]   = useState(false);
  const [pinIdx, setPinIdx]       = useState(0);
  const [ctxMenu, setCtxMenu]     = useState<{ x: number; y: number; text: string } | null>(null);
  const pinsRef    = useRef(pins);
  pinsRef.current  = pins;
  // Live markers per pin id — track the exact buffer line, move as the terminal scrolls.
  // Transient (live buffer only); not persisted. Falls back to text search if absent/disposed.
  const markersRef = useRef<Map<string, IMarker>>(new Map());
  const flashDecoRef = useRef<{ dispose(): void } | null>(null);

  // ── Autosuggest (fish-style ghost text from Quick Commands + learned history) ──
  const lineBufRef    = useRef('');                       // what the user has typed on the current line
  const suggestRef    = useRef('');                       // full suggested command
  const dataRef       = useRef<{ commands: { command: string; count: number; lastUsed: number }[]; sequences: { prev: string; next: string; count: number }[]; lastCommand: string | null }>({ commands: [], sequences: [], lastCommand: null });
  const quickRef      = useRef<string[]>(quickCommands ?? []);
  quickRef.current    = quickCommands ?? [];
  const [ghost, setGhost] = useState<{ suffix: string; left: number; top: number } | null>(null);

  const refetchSuggestions = () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    terminalsApi.suggestions(sid).then(d => {
      dataRef.current = { commands: d.commands, sequences: d.sequences, lastCommand: d.lastCommand };
    }).catch(() => {});
  };

  // Rank candidates for the current line buffer. Returns the best full command or ''.
  const computeSuggestion = (prefix: string): string => {
    if (prefix.trim().length < 1) return '';
    const last = dataRef.current.lastCommand;

    // Score map: candidate -> score
    const scores = new Map<string, number>();
    const consider = (cmd: string, base: number) => {
      if (!cmd.startsWith(prefix) || cmd.length <= prefix.length) return;
      scores.set(cmd, Math.max(scores.get(cmd) ?? 0, base));
    };

    // 1. Follow-up: "after `git status` I do `git add`" — strongest signal
    if (last) {
      for (const s of dataRef.current.sequences) {
        if (s.prev === last) consider(s.next, 100000 + s.count * 100);
      }
    }
    // 2. Quick commands — curated, high boost
    for (const qc of quickRef.current) consider(qc, 50000);
    // 3. History — recency (newer wins) + frequency
    const now = Date.now();
    for (const h of dataRef.current.commands) {
      const ageHours = (now - h.lastUsed) / 3_600_000;
      const recency  = Math.max(0, 1000 - ageHours);   // decays over ~41 days
      consider(h.command, recency + h.count * 10);
    }

    let best = '', bestScore = -1;
    for (const [cmd, sc] of scores) if (sc > bestScore) { bestScore = sc; best = cmd; }
    return best;
  };

  // Position the ghost overlay at the terminal's cursor.
  const updateGhost = () => {
    const term = xtermRef.current;
    const prefix = lineBufRef.current;
    const full = computeSuggestion(prefix);
    suggestRef.current = full;
    if (!term || !full) { setGhost(null); return; }

    const screen = terminalRef.current?.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screen) { setGhost(null); return; }
    const cellW = screen.clientWidth  / term.cols;
    const cellH = screen.clientHeight / term.rows;
    const buf   = term.buffer.active;
    setGhost({
      suffix: full.slice(prefix.length),
      left: screen.offsetLeft + buf.cursorX * cellW,
      top:  screen.offsetTop  + buf.cursorY * cellH,
    });
  };

  const acceptSuggestion = () => {
    const full = suggestRef.current;
    const prefix = lineBufRef.current;
    if (!full || full.length <= prefix.length) return false;
    const suffix = full.slice(prefix.length);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: suffix }));
    lineBufRef.current = full;
    suggestRef.current = '';
    setGhost(null);
    return true;
  };

  const syncPins = (next: Pin[]) => {
    setPins(next);
    const sid = sessionIdRef.current;
    if (sid) terminalsApi.patchPins(sid, next).catch(() => {});
  };

  const addPin = (text: string) => {
    const id = crypto.randomUUID();

    // Register a marker at the selection's line so we can jump back to the exact original.
    const term = xtermRef.current;
    if (term) {
      const range = term.getSelectionPosition();
      if (range) {
        const buf       = term.buffer.active;
        const cursorAbs = buf.baseY + buf.cursorY;     // cursor's absolute buffer line
        const offset    = range.start.y - cursorAbs;    // selection line relative to cursor
        try {
          const marker = term.registerMarker(offset);
          if (marker) markersRef.current.set(id, marker);
        } catch {}
      }
    }

    const next = [...pinsRef.current, { id, text: text.trim(), addedAt: Date.now() }];
    syncPins(next);
    setShowPins(true);
  };

  const removePin = (id: string) => {
    markersRef.current.get(id)?.dispose();
    markersRef.current.delete(id);
    syncPins(pinsRef.current.filter(p => p.id !== id));
  };

  const clearPins = () => {
    flashDecoRef.current?.dispose();
    flashDecoRef.current = null;
    markersRef.current.forEach(m => m.dispose());
    markersRef.current.clear();
    syncPins([]);
  };

  const goToPin = (idx: number) => {
    const p = pins[idx];
    const term = xtermRef.current;
    if (!p || !term) return;
    setPinIdx(idx);

    // Prefer the exact marker line (survives duplicate text). Fall back to text search.
    const marker = markersRef.current.get(p.id);
    if (marker && !marker.isDisposed && marker.line >= 0) {
      // Center the pinned line in the viewport
      const target = Math.max(0, marker.line - Math.floor(term.rows / 2));
      term.scrollToLine(target);

      // Flash the line amber, then fade out
      flashDecoRef.current?.dispose();
      flashDecoRef.current = null;
      const deco = term.registerDecoration({ marker, width: term.cols, layer: 'bottom' });
      if (deco) {
        deco.onRender((el: HTMLElement) => { el.classList.add('pin-flash'); });
        flashDecoRef.current = deco;
        setTimeout(() => { deco.dispose(); if (flashDecoRef.current === deco) flashDecoRef.current = null; }, 1700);
      }
    } else if (searchAddonRef.current) {
      // Marker gone (e.g. after restart) — search highlights the matching text
      searchAddonRef.current.findNext(p.text, {
        caseSensitive: false,
        decorations: {
          matchBackground: '#f59e0b40', matchBorder: '#f59e0b',
          activeMatchBackground: '#f59e0b80', activeMatchBorder: '#f59e0b',
        },
      });
    }
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    setIsDisconnected(false);

    // ── 1. Boot xterm ────────────────────────────────────────────────────────
    const term = new Terminal({
      cursorBlink:     true,
      fontSize:        14,
      fontFamily:      '"JetBrains Mono", monospace',
      convertEol:      true,
      allowProposedApi: true,   // required for registerDecoration (pin flash)
      theme: { background: '#0a0a0a', foreground: '#e0e0e0' },
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    term.loadAddon(searchAddon);

    term.open(terminalRef.current);
    xtermRef.current = term;

    // Wait for container to have real dimensions before fitting
    // (Electron often renders at 0×0 briefly on first mount)
    const doFit = () => {
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        try { fitAddon.fit(); } catch {}
        return true;
      }
      return false;
    };
    if (!doFit()) {
      // Poll until the container has dimensions
      const poll = setInterval(() => { if (doFit()) clearInterval(poll); }, 50);
      setTimeout(() => clearInterval(poll), 3000); // give up after 3s
    }

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
        refetchSuggestions();

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

        // ── Track the typed line for autosuggest ──
        if (data === '\r') {
          // Enter — record the command, then reset and refresh suggestions
          const cmd = lineBufRef.current;
          lineBufRef.current = '';
          suggestRef.current = '';
          setGhost(null);
          if (cmd.trim() && sessionIdRef.current) {
            terminalsApi.recordCommand(sessionIdRef.current, cmd).catch(() => {});
            setTimeout(refetchSuggestions, 150);   // pick up the new command + sequence edge
          }
        } else if (data === '\x7f') {
          lineBufRef.current = lineBufRef.current.slice(0, -1);
          requestAnimationFrame(updateGhost);
        } else if (data === '\x03' || data === '\x15') {
          // Ctrl-C / Ctrl-U — line aborted/cleared
          lineBufRef.current = '';
          suggestRef.current = '';
          setGhost(null);
        } else if (data.startsWith('\x1b')) {
          // Escape sequence (arrow keys, history recall) — our line model is unreliable now
          lineBufRef.current = '';
          suggestRef.current = '';
          setGhost(null);
        } else if (/^[\x20-\x7e]+$/.test(data)) {
          // Printable char(s) — typing or paste
          lineBufRef.current += data;
          requestAnimationFrame(updateGhost);
        }
      });
    }).catch((err) => {
      term.write(`\r\n[Failed to start terminal: ${err.message}]\r\n`);
      setIsDisconnected(true);
    });

    // ── Accept autosuggest with Right-arrow / End ─────────────────────────────
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (suggestRef.current && (e.key === 'ArrowRight' || e.key === 'End')) {
        // Only intercept if there's a pending suggestion — accept it
        acceptSuggestion();
        return false;   // don't forward the key to the PTY
      }
      return true;
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

    // ── Right-click → context menu ────────────────────────────────────────────
    const handleContextMenu = (e: MouseEvent) => {
      const selection = term.getSelection();
      if (selection.trim()) {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, text: selection });
      }
    };
    terminalRef.current?.addEventListener('contextmenu', handleContextMenu);

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
      terminalRef.current?.removeEventListener('contextmenu', handleContextMenu);
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
    clearPins();
    setShowPins(false);
    sessionIdRef.current = null;
    setReconnectKey(prev => prev + 1);
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a0a] flex flex-col" onClick={() => setCtxMenu(null)}>

      {/* ── Pins panel ────────────────────────────────────────────────────── */}
      {showPins && pins.length > 0 && (
        <div className="flex-shrink-0 bg-[#0f0f0f] border-b border-white/5 px-3 py-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Pin size={10} className="text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Pins ({pins.length})</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => goToPin((pinIdx - 1 + pins.length) % pins.length)} className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-white" title="Previous pin">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => goToPin((pinIdx + 1) % pins.length)} className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-white" title="Next pin">
                <ChevronDown size={12} />
              </button>
              <button onClick={clearPins} className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-red-400 ml-1" title="Clear all pins">
                <PinOff size={12} />
              </button>
              <button onClick={() => setShowPins(false)} className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-white" title="Hide pins">
                <X size={12} />
              </button>
            </div>
          </div>
          {pins.map((p, i) => (
            <div
              key={p.id}
              onClick={() => goToPin(i)}
              className={`group flex items-start gap-2 px-2 py-1 rounded cursor-pointer text-xs font-mono transition-colors ${i === pinIdx ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-white/5 border border-transparent'}`}
            >
              <Pin size={9} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="flex-1 truncate text-white/70">{p.text}</span>
              <button onClick={e => { e.stopPropagation(); removePin(p.id); }} className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Terminal ──────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        <div ref={terminalRef} className="w-full h-full" />

        {/* Ghost-text autosuggestion — faded suffix at the cursor */}
        {ghost && (
          <div
            className="pointer-events-none absolute whitespace-pre z-10"
            style={{
              left: ghost.left, top: ghost.top,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 14, lineHeight: '17px',
              color: 'rgba(255,255,255,0.32)',
            }}
          >
            {ghost.suffix}
            <span className="ml-2 px-1 rounded bg-white/5 text-[9px] align-middle text-white/25">→</span>
          </div>
        )}

        {/* Pin toggle button */}
        {pins.length > 0 && (
          <button
            onClick={() => setShowPins(v => !v)}
            className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded text-[10px] text-amber-400 transition-colors"
            title="Toggle pins"
          >
            <Pin size={10} />
            <span>{pins.length}</span>
          </button>
        )}

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

      {/* ── Right-click context menu ──────────────────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-[500] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-white/70 hover:text-white transition-colors"
            onClick={() => { addPin(ctxMenu.text); setCtxMenu(null); }}
          >
            <Pin size={12} className="text-amber-400" />
            Pin selection
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-white/70 hover:text-white transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(ctxMenu.text).catch(() => {});
              setCtxMenu(null);
            }}
          >
            <span className="text-white/30 text-[10px] ml-0.5 mr-0.5">⎘</span>
            Copy
          </button>
        </div>
      )}
    </div>
  );
};

export default TerminalComponent;
