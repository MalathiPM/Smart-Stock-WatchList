import React, { useState, useEffect } from 'react';

const API_BASE = "https://smart-stock-watchlist.onrender.com/api";

export default function App() {
  const [watchlists, setWatchlists] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Add Stock Modal & Dynamic Search
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [shares, setShares] = useState(10);
  const [volType, setVolType] = useState("Surge Volume");

  // Watchlist Management
  const [isNewWlOpen, setIsNewWlOpen] = useState(false);
  const [newWlName, setNewWlName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const fetchWatchlists = async () => {
    try {
      const res = await fetch(`${API_BASE}/watchlists?_t=${Date.now()}`);
      const list = await res.json();
      setWatchlists(list);
      if (list.length > 0 && !activeId) {
        setActiveId(list[0].id);
      }
    } catch (err) {
      console.error("Watchlist fetch error:", err);
    }
  };

  const fetchActiveWatchlist = async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`${API_BASE}/watchlists/${activeId}?_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setEditName(json.name);
      }
    } catch (err) {
      console.error("Active watchlist fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, []);

  useEffect(() => {
    fetchActiveWatchlist();
    const interval = setInterval(fetchActiveWatchlist, 4000);
    return () => clearInterval(interval);
  }, [activeId]);

  // Debounced Dynamic Stock Search
  useEffect(() => {
    if (!searchTerm.trim() || selectedStock) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_BASE}/stocks/search?q=${encodeURIComponent(searchTerm)}`);
        if (res.ok) {
          const matches = await res.json();
          setSearchResults(matches);
        }
      } catch (err) {
        console.error("Search query error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm, selectedStock]);

  const handleMarkSeen = async () => {
    if (!data) return;
    const zeroSectors = data.sectors.map(sec => ({
      ...sec,
      avg_delta: 0.00,
      commentary: "Sector is rangebound. Prices fluctuating within normal bounds (+0.00%).",
      stocks: sec.stocks.map(st => ({
        ...st,
        seen_price: st.now_price,
        delta_val: 0.00,
        delta_pct: 0.00,
        flag: "Rangebound",
        impact_val: 0.00
      }))
    }));

    setData(prev => ({
      ...prev,
      telemetry: {
        ...prev.telemetry,
        portfolio_absence_drift: 0.00,
        leader_pct: 0.00,
        breakout_count: 0,
        fading_count: 0,
        drag_count: 0,
        has_undo: true
      },
      sectors: zeroSectors
    }));

    await fetch(`${API_BASE}/watchlists/${activeId}/mark-seen`, { method: "POST" });
    fetchActiveWatchlist();
  };

  const handleUndoSeen = async () => {
    await fetch(`${API_BASE}/watchlists/${activeId}/undo-seen`, { method: "POST" });
    fetchActiveWatchlist();
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    const symbolToAdd = (selectedStock ? selectedStock.symbol : searchTerm.split(" ")[0]).toUpperCase().trim();
    if (!symbolToAdd) return;

    await fetch(`${API_BASE}/watchlists/${activeId}/stocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: symbolToAdd,
        held: isHeld,
        shares: parseInt(shares) || 0,
        volume_type: volType
      })
    });

    setIsAddOpen(false);
    setSearchTerm("");
    setSelectedStock(null);
    setIsHeld(false);
    fetchActiveWatchlist();
    fetchWatchlists();
  };

  const handleDeleteStock = async (sym) => {
    await fetch(`${API_BASE}/watchlists/${activeId}/stocks/${sym}`, { method: "DELETE" });
    fetchActiveWatchlist();
    fetchWatchlists();
  };

  const handleCreateWatchlist = async (e) => {
    e.preventDefault();
    if (!newWlName) return;
    const res = await fetch(`${API_BASE}/watchlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newWlName })
    });
    const created = await res.json();
    setIsNewWlOpen(false);
    setNewWlName("");
    await fetchWatchlists();
    setActiveId(created.id);
  };

  const handleRename = async () => {
    await fetch(`${API_BASE}/watchlists/${activeId}/rename`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName })
    });
    setIsEditing(false);
    fetchWatchlists();
  };

  const handleDeleteWatchlist = async () => {
    if (!window.confirm("Delete this watchlist?")) return;
    await fetch(`${API_BASE}/watchlists/${activeId}`, { method: "DELETE" });
    const remaining = watchlists.filter(w => w.id !== activeId);
    setWatchlists(remaining);
    if (remaining.length > 0) setActiveId(remaining[0].id);
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#07090e] text-gray-400 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
          <span className="text-sm tracking-wide">Loading GrowwDelta Live Telemetry...</span>
        </div>
      </div>
    );
  }

  const { telemetry, sectors } = data;

  return (
    <div className="min-h-screen bg-[#07090e] text-gray-100 font-sans p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex items-center justify-between pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black">
            ⚡
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">GrowwDelta</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {telemetry.has_undo ? (
            <button
              onClick={handleUndoSeen}
              className="px-4 py-2 rounded-lg bg-[#241c14] border border-amber-500/40 text-amber-400 text-xs font-semibold hover:bg-[#2e2318] transition flex items-center gap-1.5"
            >
              ↺ Undo Reset
            </button>
          ) : (
            <button
              onClick={handleMarkSeen}
              className="px-4 py-2 rounded-lg bg-[#12161f] border border-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-800 transition flex items-center gap-1.5"
            >
              ✓ Mark All As Seen
            </button>
          )}

          <button
            onClick={() => setIsAddOpen(true)}
            className="px-4 py-2 rounded-lg bg-emerald-400 text-gray-950 font-bold text-xs hover:bg-emerald-300 transition"
          >
            + Add Stock
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        {/* Watchlist Tabs */}
        <div className="flex items-center gap-2">
          {watchlists.map(wl => (
            <div
              key={wl.id}
              onClick={() => setActiveId(wl.id)}
              className={`cursor-pointer px-4 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 border ${
                wl.id === activeId
                  ? "bg-[#0f1722] text-emerald-400 border-emerald-500/30 shadow-sm"
                  : "bg-[#0d1017] text-gray-400 border-gray-800/80 hover:text-gray-200"
              }`}
            >
              <span>{wl.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-[#0b0e14] text-[10px] text-gray-400">
                {wl.count}
              </span>
              {wl.id === activeId && (
                <div className="flex items-center gap-1 ml-1 text-gray-500 hover:text-gray-300">
                  <span onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="hover:text-white">✏️</span>
                  {watchlists.length > 1 && (
                    <span onClick={(e) => { e.stopPropagation(); handleDeleteWatchlist(); }} className="hover:text-rose-400">🗑️</span>
                  )}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setIsNewWlOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-400 bg-[#0d1017] border border-gray-800/80 hover:text-white transition"
          >
            + New Watchlist
          </button>

          {isEditing && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-xs px-2 py-1 rounded text-white"
              />
              <button onClick={handleRename} className="text-xs text-emerald-400">Save</button>
              <button onClick={() => setIsEditing(false)} className="text-xs text-gray-500">Cancel</button>
            </div>
          )}
        </div>

        {/* Top 4 Telemetry Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#0e121a] border border-gray-800/70 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Portfolio Absence Drift</div>
            <div className={`text-2xl font-bold tracking-tight ${telemetry.portfolio_absence_drift >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {telemetry.portfolio_absence_drift >= 0 ? "+" : ""}₹{telemetry.portfolio_absence_drift.toFixed(2)}
              <span className="text-xs font-normal text-gray-400 ml-2">P&L shift</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-3">
              Calculated across {telemetry.held_count} held assets in this watchlist.
            </div>
          </div>

          <div className="bg-[#0e121a] border border-gray-800/70 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Absence Delta Leader</div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-white tracking-wide">{telemetry.leader_symbol}</span>
              <span className={`text-sm font-semibold ${telemetry.leader_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {telemetry.leader_pct >= 0 ? "+" : ""}{telemetry.leader_pct.toFixed(2)}%
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-3">
              Highest divergence against baseline snapshot.
            </div>
          </div>

          <div className="bg-[#0e121a] border border-gray-800/70 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Active Behavioral Flags</div>
            <div className="flex items-center gap-4 mt-1 text-sm font-bold">
              <div><span className="text-emerald-400">{telemetry.breakout_count}</span> <span className="text-[10px] text-gray-400 font-normal">BREAKOUT</span></div>
              <div><span className="text-amber-400">{telemetry.fading_count}</span> <span className="text-[10px] text-gray-400 font-normal">FADING</span></div>
              <div><span className="text-rose-400">{telemetry.drag_count}</span> <span className="text-[10px] text-gray-400 font-normal">DRAG</span></div>
            </div>
            <div className="text-[11px] text-gray-500 mt-3">
              Automated flags evaluated on volume & momentum.
            </div>
          </div>

          <div className="bg-[#0e121a] border border-gray-800/70 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Watchlist Coverage</div>
            <div className="text-2xl font-bold text-white">
              {telemetry.sector_count}
              <span className="text-xs font-normal text-gray-400 ml-2">{telemetry.stock_count} tracked stocks</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-3">
              Active view: <span className="text-emerald-400">{data.name}</span>
            </div>
          </div>
        </div>

        {/* Sectors and Stock Cards */}
        <div className="space-y-6">
          {sectors.map((sec) => (
            <div key={sec.sector} className="bg-[#0a0d13] border border-gray-800/80 rounded-xl p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-800/60">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-wide text-white uppercase">{sec.sector}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${sec.avg_delta >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                    {sec.avg_delta >= 0 ? "+" : ""}{sec.avg_delta.toFixed(2)}%
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {sec.stocks.length} tracked
                </div>
              </div>

              <div className="mb-4 px-3 py-2 rounded-lg bg-[#0e121a] border border-gray-800/60 text-xs text-gray-400 flex items-center gap-2">
                <span className="text-emerald-400">ℹ</span>
                <span>{sec.commentary}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sec.stocks.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="bg-[#0e121a] border border-gray-800/80 hover:border-gray-700/80 transition rounded-xl p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{stock.symbol}</span>
                            {stock.held && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                HELD
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{stock.name}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteStock(stock.symbol)}
                          className="text-gray-600 hover:text-rose-400 text-xs"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-xl font-bold text-white">
                          ₹{stock.now_price.toFixed(2)}
                        </span>
                        <span className={`text-xs font-semibold ${stock.delta_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {stock.delta_pct >= 0 ? "↗" : "↘"} {stock.delta_pct >= 0 ? "+" : ""}{stock.delta_pct.toFixed(2)}%
                        </span>
                      </div>

                      <div className="mt-3 p-2 bg-[#080a0f] rounded-lg text-[11px] space-y-1">
                        <div className="flex justify-between text-gray-500">
                          <span>Seen: ₹{stock.seen_price.toFixed(2)}</span>
                          <span>→</span>
                          <span>Now: ₹{stock.now_price.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span className="text-gray-400">Since Last Visit:</span>
                          <span className={stock.delta_val >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {stock.delta_val >= 0 ? "+" : ""}₹{stock.delta_val.toFixed(2)} ({stock.delta_pct >= 0 ? "+" : ""}{stock.delta_pct.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-gray-800/60 flex items-center justify-between text-[11px]">
                      <span className={`font-bold px-2 py-0.5 rounded ${
                        stock.flag === "BREAKOUT"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : stock.flag === "DRAG"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : stock.flag === "FADING"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "text-gray-500"
                      }`}>
                        {stock.flag}
                      </span>

                      {stock.held && (
                        <span className={`font-semibold ${stock.impact_val >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {stock.impact_val >= 0 ? "+" : ""}₹{stock.impact_val.toFixed(2)} impact
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Add Stock Modal with Dynamic Search */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0e131b] border border-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800/80 mb-4">
              <h3 className="text-base font-bold text-white tracking-wide">Add Stock to Watchlist</h3>
              <button
                onClick={() => { setIsAddOpen(false); setSelectedStock(null); setSearchTerm(""); }}
                className="text-gray-500 hover:text-gray-300 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1.5 font-medium">Search Stock Symbol or Name</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedStock(null);
                    }}
                    placeholder="Search live market symbols (e.g. INFY, TATA)..."
                    className="w-full bg-[#141a24] border border-gray-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-3 text-xs text-emerald-400 animate-pulse">
                      Searching...
                    </div>
                  )}
                </div>

                {searchResults.length > 0 && !selectedStock && (
                  <div className="mt-1.5 max-h-48 overflow-y-auto bg-[#141a24] border border-gray-700/80 rounded-xl divide-y divide-gray-800/50 shadow-2xl">
                    {searchResults.map((st) => (
                      <div
                        key={st.symbol}
                        onClick={() => {
                          setSelectedStock(st);
                          setSearchTerm(`${st.symbol} — ${st.name}`);
                          setSearchResults([]);
                        }}
                        className="p-2.5 hover:bg-[#1c2432] cursor-pointer flex items-center justify-between transition"
                      >
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>{st.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 font-normal">
                              {st.sector}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-400">{st.name}</div>
                        </div>
                        <span className="text-xs font-semibold text-emerald-400">
                          ₹{st.ltp.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1.5 font-medium">Volume Profile (Behavioral Flag)</label>
                <select
                  value={volType}
                  onChange={(e) => setVolType(e.target.value)}
                  className="w-full bg-[#141a24] border border-gray-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                >
                  <option value="Surge Volume">Surge Volume (Breakout Trigger)</option>
                  <option value="Normal">Normal Volume</option>
                  <option value="Drying">Drying (Fading Trigger)</option>
                </select>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="heldCheck"
                    checked={isHeld}
                    onChange={(e) => setIsHeld(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs text-gray-300 select-none">I own this stock (Track Absence P&L)</span>
                </label>
              </div>

              {isHeld && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5 font-medium">Quantity Owned</label>
                  <input
                    type="number"
                    min="1"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="w-full bg-[#141a24] border border-gray-700/80 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-800/80">
                <button
                  type="button"
                  onClick={() => { setIsAddOpen(false); setSelectedStock(null); setSearchTerm(""); }}
                  className="px-4 py-2 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-400 hover:text-white text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-gray-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
                >
                  Add Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Watchlist Modal */}
      {isNewWlOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#12161f] border border-gray-800 p-6 rounded-xl max-w-sm w-full">
            <h3 className="text-sm font-bold text-white mb-4">Create Watchlist</h3>
            <form onSubmit={handleCreateWatchlist} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Watchlist Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High Beta"
                  value={newWlName}
                  onChange={(e) => setNewWlName(e.target.value)}
                  className="w-full bg-[#080a0f] border border-gray-700 rounded p-2 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewWlOpen(false)}
                  className="px-3 py-1.5 rounded bg-gray-800 text-gray-400 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-emerald-400 text-gray-950 font-bold text-xs"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}