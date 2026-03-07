import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal, AlertTriangle, Radio, Clock, ChevronRight,
  Send, Zap, Info, AlertCircle, Download, Satellite,
} from 'lucide-react';
import { api } from '../services/api';

/* ───────── severity config ───────── */
const SEV = {
  INFO:     { color: '#3b82f6', icon: Info,           tag: 'INFO' },
  WARNING:  { color: '#f59e0b', icon: AlertTriangle,  tag: 'WARN' },
  CRITICAL: { color: '#ef4444', icon: AlertCircle,     tag: 'CRIT' },
  SYSTEM:   { color: '#64748b', icon: Terminal,        tag: 'SYS' },
  CMD:      { color: '#22c55e', icon: Send,            tag: 'CMD' },
};

/* ───────── predefined satellite commands ───────── */
const SAT_COMMANDS = [
  { cmd: 'PAYLOAD ON',      desc: 'Activate imaging payload' },
  { cmd: 'PAYLOAD OFF',     desc: 'Deactivate payload' },
  { cmd: 'ATTITUDE NADIR',  desc: 'Set nadir pointing' },
  { cmd: 'ATTITUDE SUN',    desc: 'Set sun pointing' },
  { cmd: 'TX HIGH',         desc: 'High-gain transmitter ON' },
  { cmd: 'TX LOW',          desc: 'Low-power transmitter' },
  { cmd: 'HEATER ON',       desc: 'Battery heater enable' },
  { cmd: 'HEATER OFF',      desc: 'Battery heater disable' },
  { cmd: 'SAFE MODE',       desc: 'Enter safe mode' },
];

function formatUTC(date) {
  if (!date) return '--:--:--';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(11, 19);
}

/* ════════════════════════════════════════
   EVENT LOG PANEL
   ════════════════════════════════════════ */
function EventLog({ alerts, contactState, bufferDump, clearBufferDump }) {
  const logRef = useRef(null);
  const [events, setEvents] = useState([]);
  const seenRef = useRef(new Set());
  const prevContactRef = useRef(null);

  // Merge FDIR alerts into event stream
  useEffect(() => {
    if (!alerts || alerts.length === 0) return;
    const newEvents = [];
    for (const a of alerts) {
      const key = `${a.rule_name}-${a.timestamp}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      newEvents.push({
        id: key,
        time: new Date(a.timestamp),
        severity: a.severity || 'WARNING',
        subsystem: a.subsystem || 'FDIR',
        message: `${a.rule_name}: ${a.corrective_action || a.message || 'Threshold exceeded'}`,
      });
    }
    if (newEvents.length > 0) {
      setEvents(prev => [...newEvents, ...prev].slice(0, 200));
    }
  }, [alerts]);

  // Track contact transitions
  useEffect(() => {
    if (!contactState) return;
    const prev = prevContactRef.current;
    prevContactRef.current = contactState.inContact;

    if (prev === null) return; // Skip first render

    if (contactState.inContact && !prev) {
      setEvents(ev => [{
        id: `contact-aos-${Date.now()}`,
        time: new Date(),
        severity: 'SYSTEM',
        subsystem: 'COMMS',
        message: `AOS — Contact acquired: ${contactState.station} (${contactState.elevationDeg}\u00B0)`,
      }, ...ev].slice(0, 200));
    } else if (!contactState.inContact && prev) {
      setEvents(ev => [{
        id: `contact-los-${Date.now()}`,
        time: new Date(),
        severity: 'SYSTEM',
        subsystem: 'COMMS',
        message: 'LOS — Signal lost, entering blackout. Telemetry is now PREDICTED.',
      }, ...ev].slice(0, 200));
    }
  }, [contactState]);

  // Buffer dump events
  useEffect(() => {
    if (!bufferDump) return;
    setEvents(ev => [{
      id: `dump-${bufferDump.receivedAt}`,
      time: new Date(),
      severity: 'CMD',
      subsystem: 'DATA',
      message: `Buffer dump received: ${bufferDump.count} stored frames from blackout period`,
    }, ...ev].slice(0, 200));
    if (clearBufferDump) clearBufferDump();
  }, [bufferDump, clearBufferDump]);

  // System boot event
  useEffect(() => {
    setEvents(prev => [{
      id: 'boot',
      time: new Date(),
      severity: 'SYSTEM',
      subsystem: 'CORE',
      message: 'Mission control online — awaiting ground station contact',
    }, ...prev]);
  }, []);

  // Auto-scroll to top on new events
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [events.length]);

  return (
    <div className="cs-panel cs-events">
      <div className="cs-panel-header">
        <AlertTriangle size={12} /> EVENT LOG
        <span className="cs-badge">{events.length}</span>
      </div>
      <div className="cs-event-list" ref={logRef}>
        {events.length === 0 && (
          <div className="cs-empty">No events</div>
        )}
        {events.map(ev => {
          const sev = SEV[ev.severity] || SEV.INFO;
          const Icon = sev.icon;
          return (
            <div className="cs-event-row" key={ev.id}>
              <span className="cs-event-time">{formatUTC(ev.time)}</span>
              <span className="cs-event-tag" style={{ color: sev.color, borderColor: sev.color }}>
                <Icon size={9} /> {sev.tag}
              </span>
              <span className="cs-event-sub">[{ev.subsystem}]</span>
              <span className="cs-event-msg">{ev.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   COMMAND TERMINAL
   ════════════════════════════════════════ */
function CommandTerminal() {
  const [input, setInput] = useState('');
  const [queue, setQueue] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  const filtered = input.length > 0
    ? SAT_COMMANDS.filter(c => c.cmd.toLowerCase().includes(input.toLowerCase()))
    : SAT_COMMANDS;

  const sendCommand = useCallback((cmdText) => {
    const text = cmdText || input.trim();
    if (!text) return;

    const id = `CMD-${Date.now().toString(36).toUpperCase()}`;
    const newCmd = { id, command: text, status: 'QUEUED', time: new Date() };
    setQueue(prev => [newCmd, ...prev].slice(0, 50));
    setInput('');
    setShowSuggestions(false);

    // Simulate status progression: QUEUED -> SENT -> EXECUTED
    setTimeout(() => {
      setQueue(prev => prev.map(c => c.id === id ? { ...c, status: 'SENT' } : c));
    }, 800 + Math.random() * 500);

    setTimeout(() => {
      setQueue(prev => prev.map(c => c.id === id ? { ...c, status: 'EXECUTED' } : c));
    }, 2500 + Math.random() * 1500);
  }, [input]);

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      sendCommand();
    } else if (e.key === 'Tab' && filtered.length > 0) {
      e.preventDefault();
      setInput(filtered[0].cmd);
      setShowSuggestions(false);
    }
  };

  const statusColor = { QUEUED: '#f59e0b', SENT: '#3b82f6', EXECUTED: '#22c55e' };

  return (
    <div className="cs-panel cs-terminal">
      <div className="cs-panel-header">
        <Terminal size={12} /> COMMAND TERMINAL
        <span className="cs-badge">{queue.filter(c => c.status !== 'EXECUTED').length}</span>
      </div>

      {/* Command input */}
      <div className="cs-cmd-input-area">
        <span className="cs-prompt">{'>'}</span>
        <input
          ref={inputRef}
          className="cs-cmd-input"
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKey}
          placeholder="Type command..."
          spellCheck={false}
        />
        <button className="cs-send-btn" onClick={() => sendCommand()}>
          <Send size={12} /> SEND
        </button>
      </div>

      {/* Autocomplete suggestions */}
      {showSuggestions && filtered.length > 0 && (
        <div className="cs-suggestions">
          {filtered.slice(0, 5).map(s => (
            <div
              key={s.cmd}
              className="cs-suggestion"
              onMouseDown={() => sendCommand(s.cmd)}
            >
              <span className="cs-sug-cmd">{s.cmd}</span>
              <span className="cs-sug-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Command queue */}
      <div className="cs-cmd-queue">
        {queue.map(cmd => (
          <div className="cs-cmd-row" key={cmd.id}>
            <span className="cs-cmd-id">{cmd.id}</span>
            <span className="cs-cmd-text">{cmd.command}</span>
            <span className="cs-cmd-status" style={{ color: statusColor[cmd.status] }}>
              {cmd.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   PASS COUNTDOWN
   ════════════════════════════════════════ */
function PassCountdown({ contactState }) {
  const [passes, setPasses] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchPasses = () => {
      api.getGroundStationPasses().then(data => {
        if (data && data.passes) setPasses(data.passes);
      });
    };
    fetchPasses();
    // Refresh pass predictions periodically
    const id = setInterval(fetchPasses, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Use live contact state from backend if available
  const liveContact = contactState?.inContact || false;
  const liveStation = contactState?.station;

  // Find next upcoming pass from predictions
  const nextPass = passes.find(p => new Date(p.aos_time).getTime() > now);

  const formatCountdown = (targetMs) => {
    const diff = Math.max(0, targetMs - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatBlackout = (sec) => {
    if (!sec || sec <= 0) return '--:--:--';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="cs-panel cs-pass">
      <div className="cs-panel-header">
        <Radio size={12} /> GROUND CONTACT
      </div>

      {liveContact ? (
        <div className="cs-pass-body">
          <div className="cs-pass-status active">
            <div className="cs-pass-dot active" />
            IN CONTACT
          </div>
          <div className="cs-pass-station">
            <Satellite size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
            {liveStation}
          </div>
          <div className="cs-pass-meta" style={{ marginTop: 6 }}>
            <span>Elev: {contactState?.elevationDeg}°</span>
            <span>Source: LIVE</span>
          </div>
        </div>
      ) : (
        <div className="cs-pass-body">
          <div className="cs-pass-status blackout">
            <div className="cs-pass-dot blackout" />
            BLACKOUT
          </div>
          <div className="cs-pass-countdown blackout-timer">
            {formatBlackout(contactState?.blackoutSec)}
          </div>
          <div className="cs-pass-label">BLACKOUT DURATION</div>
          {nextPass && (
            <>
              <div className="cs-pass-station" style={{ marginTop: 8, fontSize: '0.65rem', opacity: 0.7 }}>
                Next: {nextPass.station_name}
              </div>
              <div className="cs-pass-countdown" style={{ fontSize: '0.9rem' }}>
                {formatCountdown(new Date(nextPass.aos_time).getTime())}
              </div>
              <div className="cs-pass-label">TIME TO AOS</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN CONTROL STRIP (exports)
   ════════════════════════════════════════ */
export default function ControlStrip({ alerts, contactState, bufferDump, clearBufferDump }) {
  return (
    <div className="control-strip">
      <EventLog alerts={alerts} contactState={contactState} bufferDump={bufferDump} clearBufferDump={clearBufferDump} />
      <CommandTerminal />
      <PassCountdown contactState={contactState} />
    </div>
  );
}
