"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

type Persona = 'Rich' | 'Business';

type Message = { role: 'user' | 'agent'; text: string; ts: number };

type Flight = {
  id: string; from: string; to: string; date: string;
  depart: string; arrive: string; airline: string; class: string; price: number; overnight: boolean;
};

type Hotel = { id: string; city: string; name: string; stars: number; price: number };

type Memory = {
  persona: Persona;
  lastQuery?: { from?: string; to?: string; date?: string };
  chosenFlightId?: string;
  hotelRequired?: boolean;
};

const STORAGE_KEY = 'agentic_travel_memory_v1';

function loadMemory(): Memory {
  if (typeof window === 'undefined') return { persona: 'Business' };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { persona: 'Business' };
    const parsed = JSON.parse(raw) as Memory;
    return { persona: 'Business', ...parsed };
  } catch {
    return { persona: 'Business' };
  }
}

function saveMemory(memory: Memory) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);
}

export default function Chat() {
  const [memory, setMemory] = useState<Memory>(() => loadMemory());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveMemory(memory); }, [memory]);
  useEffect(() => { chatRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); }, [messages]);

  const personaBadge = useMemo(() => {
    return memory.persona === 'Rich' ? 'Prefers First Class & 5?' : 'Prefers Business Class & 4?+';
  }, [memory.persona]);

  async function searchFlights(params: { from?: string; to?: string; date?: string }) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => !!v) as any));
    const res = await fetch(`/api/flights?${qs.toString()}`);
    const data = await res.json();
    let list = data.flights as Flight[];
    // Rank by persona preference
    list = list.sort((a, b) => personaScore(b) - personaScore(a) || a.price - b.price);
    setFlights(list);
  }

  async function searchHotels(city: string) {
    const minStars = memory.persona === 'Rich' ? 5 : 4;
    const res = await fetch(`/api/hotels?city=${encodeURIComponent(city)}&minStars=${minStars}`);
    const data = await res.json();
    const list = (data.hotels as Hotel[]).sort((a, b) => b.stars - a.stars || a.price - b.price);
    setHotels(list);
  }

  function personaScore(f: Flight) {
    const isRich = memory.persona === 'Rich';
    const cls = f.class.toLowerCase();
    let score = 0;
    if (isRich) {
      if (cls === 'first') score += 3;
      if (cls === 'business') score += 2;
      if (f.overnight) score -= 1; // avoid overnights if possible
    } else {
      if (cls === 'business') score += 3;
      if (cls === 'economy') score += 1;
      if (!f.overnight) score += 1;
    }
    return score;
  }

  function addAgent(text: string) {
    setMessages(m => [...m, { role: 'agent', text, ts: Date.now() }]);
  }
  function addUser(text: string) {
    setMessages(m => [...m, { role: 'user', text, ts: Date.now() }]);
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (!q) return;
    setInput('');
    addUser(q);

    // lightweight NLU: parse intents (from, to, date)
    const from = (q.match(/from\s+([A-Za-z]{3})/i)?.[1] || q.match(/\b([A-Za-z]{3})\s*->/i)?.[1])?.toUpperCase();
    const to = (q.match(/to\s+([A-Za-z]{3})/i)?.[1] || q.match(/->\s*([A-Za-z]{3})/i)?.[1])?.toUpperCase();
    const date = q.match(/(\d{4}-\d{2}-\d{2})/)?.[1];

    const newMem: Memory = { ...memory, lastQuery: { from: from ?? memory.lastQuery?.from, to: to ?? memory.lastQuery?.to, date: date ?? memory.lastQuery?.date } };
    setMemory(newMem);

    if (from || to || date || flights.length === 0) {
      await searchFlights(newMem.lastQuery ?? {});
      addAgent('I found flight options ranked by your persona.');
    }

    // If any flight is overnight or user mentions hotel, require hotel
    const needsHotel = /hotel|stay|night|overnight/i.test(q) || (flights[0]?.overnight ?? false);
    if (needsHotel) {
      const arrivalCity = (newMem.lastQuery?.to ?? flights[0]?.to) || '';
      if (arrivalCity) {
        setMemory(cur => ({ ...cur, hotelRequired: true }));
        await searchHotels(arrivalCity);
        addAgent(`Hotel is required in ${arrivalCity}. Suggested options listed.`);
      }
    }
  }

  function choosePersona(p: Persona) {
    setMemory(m => ({ ...m, persona: p }));
    addAgent(`Persona set to ${p}. ${p === 'Rich' ? 'I will prefer First Class flights and 5? hotels.' : 'I will prefer Business Class flights and 4?+ hotels.'}`);
  }

  function selectFlight(id: string) {
    const f = flights.find(x => x.id === id);
    if (!f) return;
    setMemory(m => ({ ...m, chosenFlightId: id, lastQuery: { from: f.from, to: f.to, date: f.date } }));
    addAgent(`Selected ${f.airline} ${f.id} ${f.from}?${f.to} on ${f.date} (${f.class}, ${formatCurrency(f.price)}).`);
    if (f.overnight) {
      setMemory(m => ({ ...m, hotelRequired: true }));
      searchHotels(f.to);
      addAgent('This is an overnight flight; I will arrange a hotel.');
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Agentic Travel Planner</h1>
        <div>
          <span className="badge" style={{ marginRight: 8 }}>Persona: {memory.persona}</span>
          <span className="small">{personaBadge}</span>
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select className="select" value={memory.persona} onChange={e => choosePersona(e.target.value as Persona)}>
              <option>Business</option>
              <option>Rich</option>
            </select>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flex: 1 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Try: flights from NYC to LAX on 2025-11-10, need hotel"
                value={input}
                onChange={e => setInput(e.target.value)}
              />
              <button className="button primary" type="submit">Ask</button>
            </form>
          </div>

          <div className="chat card" ref={chatRef}>
            {messages.map(m => (
              <div key={m.ts + m.role} className={`msg ${m.role}`}>{m.text}</div>
            ))}
            {messages.length === 0 && (
              <div className="small">I remember your persona, flight searches, selections, and whether a hotel is required.</div>
            )}
          </div>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Flights</h3>
          {flights.length === 0 ? (
            <div className="small">No flights yet. Ask me to search.</div>
          ) : (
            <ul className="list">
              {flights.map(f => (
                <li key={f.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div><strong>{f.from}?{f.to}</strong> ? {f.date} ? {f.depart}?{f.arrive}</div>
                      <div className="small">{f.airline} ? {f.class} ? {f.overnight ? 'Overnight' : 'Same day'} ? {formatCurrency(f.price)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {memory.chosenFlightId === f.id && <span className="badge">Selected</span>}
                      <button className="button" onClick={() => selectFlight(f.id)}>Select</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="button" onClick={() => memory.lastQuery && searchFlights(memory.lastQuery)}>Refresh Flights</button>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Hotels {memory.hotelRequired ? <span className="badge" style={{ marginLeft: 8 }}>Required</span> : null}</h3>
        {hotels.length === 0 ? (
          <div className="small">Hotels appear after you ask for a hotel or select an overnight flight.</div>
        ) : (
          <ul className="list">
            {hotels.map(h => (
              <li key={h.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div><strong>{h.name}</strong> ? {h.city}</div>
                    <div className="small">{h.stars}? ? {formatCurrency(h.price)} / night</div>
                  </div>
                  <button className="button">Reserve</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
