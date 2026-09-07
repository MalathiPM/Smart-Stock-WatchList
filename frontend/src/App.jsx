import React, { useState, useEffect } from 'react';

const API_BASE = "https://smart-stock-watchlist.onrender.com/api"; 
// or "http://localhost:8000/api" for local run

export default function App() {
  const [watchlists, setWatchlists] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newSym, setNewSym] = useState("");
  const [isHeld, setIsHeld] = useState(false);
  const [shares, setShares] = useState(10);
  const [volType, setVolType] = useState("Surge Volume");

  const [isNewWlOpen, setIsNewWlOpen] = useState(false);
  const [newWlName, setNewWlName] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  // Load Watchlists
  const fetchWatchlists = async () => {
    try {
      const res = await fetch(`${API_BASE}/watchlists?_t=${Date.now()}`);
      const list = await res.json();
      setWatchlists(list);
      if (list.length > 0 && !activeId) {
        setActiveId(list[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Load Active Watchlist Detail
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, []);

  useEffect(() => {
    fetchActiveWatchlist();
    // 5-second polling to capture continuous live ticks
    const interval = setInterval(fetchActiveWatchlist, 5000);
    return () => clearInterval(interval);
  }, [activeId]);

  // Mark All As Seen (Optimistic UI Update)
  const handleMarkSeen = async () => {
    if (!data) return;

    // Zero out drift instantly on screen
    const optimisticSectors = data.sectors.map(sec => ({
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
      sectors: optimisticSectors
    }));

    await fetch(`${API_BASE}/watchlists/${activeId}/mark-seen`, { method: "POST" });
    fetchActiveWatchlist();
  };

  // Undo Reset
  const handleUndoSeen = async () => {
    await fetch(`${API_BASE}/watchlists/${activeId}/undo-seen`, { method: "POST" });
    fetchActiveWatchlist();
  };

  // Add Stock
  const handleAddStock = async (e) => {
    e.preventDefault();
    if (!newSym) return;
    await fetch(`${API_BASE}/watchlists/${activeId}/stocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: newSym.toUpperCase(),
        held: isHeld,
        shares: parseInt(shares) || 0,
        volume_type: volType
      })
    });
    setIsAddOpen(false);
    setNewSym("");
    fetchActiveWatchlist();
    fetchWatchlists();
  };

  // Delete Stock
  const handleDeleteStock = async (sym) => {
    await fetch(`${API_BASE}/watchlists/${activeId}/stocks/${sym}`, { method: "DELETE" });
    fetchActiveWatchlist();
    fetchWatchlists();
  };

  // Create Watchlist
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

  // Rename Watchlist
  const handleRename = async () => {
    await fetch(`${API_BASE}/watchlists/${activeId}/rename`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName })
    });
    setIsEditing(false);
    fetchWatchlists();
  };

  // Delete Watchlist
  const handleDeleteWatchlist = async () => {
    if (!window.confirm("Delete this watchlist?")) return;
    await fetch(`${API_BASE}/watchlists/${activeId}`, { method: "DELETE" });
    const remaining = watchlists.filter(w => w.id !== activeId);
    setWatchlists(remaining);
    if (remaining.length > 0) setActiveId(remaining[0].id);
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#0d1117] text-white flex items-center justify-center">
        <div className="text-xl text-emerald-400 animate-pulse">Loading GrowwDelta Engine...</div>
      </div>
    );
  }

  const { telemetry, sectors } = data;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-gray-100 font-sans p-6">
      {/* Navigation Header */}
      <header className="max-w-7xl mx-auto flex items-center justify-between pb-6 border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-xl">
            ⚡
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              GrowwDelta
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Absence Intelligence
              </span>
            </h1>
          </div>
        </div>

        {/* Top Actions: Mark As Seen / Undo & Add Stock */}
        <div className="flex items-center space-x-3">
          {telemetry.has_undo ? (
            <button
              onClick={handleUndoSeen}
              title="Restore prior session baseline"
              className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 font-medium text-sm hover:bg-amber-500/30 transition flex items-center gap-1.5"
            >
              ↺ Undo Reset
            </button>
          ) : (
            <button
              onClick={handleMarkSeen}
              title="Reset drift to ₹0.00"
              className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 font-medium text-sm hover:bg-gray-700 hover:text-white transition flex items-center gap-1.5"
            >
              ✓ Mark All As Seen
            </button>
          )}

          <button
            onClick={() => setIsAddOpen(true)}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-gray-950 font-semibold text-sm hover:bg-emerald-400 transition"
          >
            + Add Stock
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto mt-6">
        {/* Watchlist Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2 overflow-x-auto pb-2">
            {watchlists.map(wl => (
              <button
                key={wl.id}
                onClick={() => setActiveId(wl.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  wl.id === activeId
                    ? "bg-gray-800 text-emerald-400 border border-emerald-500/40"
                    : "bg-[#161b22] text-gray-400 border border-transparent hover:text-gray-200"
                }`}
              >
                <span>{wl.name}</span>
                <span className="text-xs px-1.5 py-0.2 bg-gray-900 rounded-full text-gray-400">
                  {wl.count}
                </span>
              </button>
            ))}
            <button
              onClick={() => setIsNewWlOpen(true)}
              className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-[#161b22] hover:bg-gray-800 transition"
            >
              + New Watchlist
            </button>
          </div>

          {/* Inline Rename / Delete Tab */}
          <div className="flex items-center space-x-2">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-sm px-2 py-1 rounded text-white"
                />
                <button onClick={handleRename} className="text-xs text-emerald-400 hover:underline">Save</button>
                <button onClick={() => setIsEditing(false)} className="text-xs text-gray-400">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <button onClick={() => setIsEditing(true)} className="hover:text-white">✏️</button>
                {watchlists.length > 1 && (
                  <button onClick={handleDeleteWatchlist} className="hover:text-red-400">🗑️</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Top 4 Telemetry Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#12161f] border border-gray-800/80 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Portfolio Absence Drift</div>
            <div className={`text-2xl font-bold ${telemetry.portfolio_absence_drift >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {telemetry.portfolio_absence_drift >= 0 ? "+" : ""}₹{telemetry.portfolio_absence_drift.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Calculated across {telemetry.held_count} held assets in this view.
            </div>
          </div>

          <div className="bg-[#12161f] border border-gray-800/80 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Absence Delta Leader</div>
            <div className="text-2xl font-bold text-white flex items-center justify-between">
              <span>{telemetry.leader_symbol}</span>
              <span className={`text-base font-semibold ${telemetry.leader_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {telemetry.leader_pct >= 0 ? "+" : ""}{telemetry.leader_pct.toFixed(2)}%
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-2">Highest divergence against your baseline.</div>
          </div>

          <div className="bg-[#12161f] border border-gray-800/80 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Active Behavioral Flags</div>
            <div className="flex items-center gap-4 text-base font-bold mt-1">
              <div><span className="text-emerald-400">{telemetry.breakout_count}</span> <span className="text-xs text-gray-400 font-normal">BREAKOUT</span></div>
              <div><span className="text-amber-400">{telemetry.fading_count}</span> <span className="text-xs text-gray-400 font-normal">FADING</span></div>
              <div><span className="text-rose-400">{telemetry.drag_count}</span> <span className="text-xs text-gray-400 font-normal">DRAG</span></div>
            </div>
            <div className="text-xs text-gray-500 mt-2">Automated flags on volume & price velocity.</div>
          </div>

          <div className="bg-[#12161f] border border-gray-800/80 p-5 rounded-xl">
            <div className="text-xs text-gray-400 mb-1">Watchlist Coverage</div>
            <div className="text-2xl font-bold text-white">
              {telemetry.sector_count} <span className="text-sm font-normal text-gray-400">sectors</span>
            </div>
            <div className="text-xs text-gray-500 mt-2">{telemetry.stock_count} tracked stocks in this list.</div>
          </div>
        </div>

        {/* Sectors & Stock Grid */}
        <div className="space-y-8">
          {sectors.map((sec) => (
            <div key={sec.sector} className="bg-[#12161f]/50 border border-gray-800/60 rounded-xl p-5">
              {/* Sector Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-gray-800/60 gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold tracking-wide text-white">{sec.sector}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${sec.avg_delta >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                    {sec.avg_delta >= 0 ? "+" : ""}{sec.avg_delta.toFixed(2)}%
                  </span>
                </div>
                <div className="text-xs text-gray-400 italic">
                  💡 {sec.commentary}
                </div>
              </div>

              {/* Stock Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sec.stocks.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="bg-[#161b24] border border-gray-800/90 hover:border-gray-700 transition rounded-xl p-4 flex flex-col justify-between relative group"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-white">{stock.symbol}</span>
                            {stock.held && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded">
                                HELD ({stock.shares})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">{stock.name}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteStock(stock.symbol)}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-rose-400 transition text-sm"
                          title="Remove stock"
                        >
                          ✕
                        </button>
                      </div>

                      {/* LTP */}
                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-2xl font-black text-white">
                          ₹{stock.now_price.toFixed(2)}
                        </span>
                        <span className={`text-sm font-bold ${stock.delta_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {stock.delta_pct >= 0 ? "↗" : "↘"} {stock.delta_pct >= 0 ? "+" : ""}{stock.delta_pct.toFixed(2)}%
                        </span>
                      </div>

                      {/* Seen vs Now Baseline Strip */}
                      <div className="mt-3 p-2 bg-[#0e1218] rounded-lg text-xs space-y-1">
                        <div className="flex justify-between text-gray-400">
                          <span>Seen: ₹{stock.seen_price.toFixed(2)}</span>
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

                    {/* Behavioral Flag Badge & P&L Impact */}
                    <div className="mt-4 pt-2 border-t border-gray-800 flex items-center justify-between">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded tracking-wide ${
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
                        <span className={`text-xs font-semibold ${stock.impact_val >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {stock.impact_val >= 0 ? "+" : ""}₹{stock.impact_val.toFixed(2)} P&L
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

      {/* Modal: Add Stock */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b24] border border-gray-700 p-6 rounded-xl max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-4">Add Stock to Watchlist</h3>
            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Stock Ticker (e.g. RELIANCE, INFY, TATATECH)</label>
                <input
                  type="text"
                  required
                  value={newSym}
                  onChange={(e) => setNewSym(e.target.value)}
                  placeholder="Enter symbol"
                  className="w-full bg-[#0e1218] border border-gray-700 rounded-lg px-3 py-2 text-white uppercase text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Volume Profile</label>
                <select
                  value={volType}
                  onChange={(e) => setVolType(e.target.value)}
                  className="w-full bg-[#0e1218] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="Surge Volume">Surge Volume (Breakout Trigger)</option>
                  <option value="Normal">Normal Volume</option>
                  <option value="Drying">Drying (Fading Trigger)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="heldCheck"
                  checked={isHeld}
                  onChange={(e) => setIsHeld(e.target.checked)}
                  className="rounded bg-gray-900 border-gray-700"
                />
                <label htmlFor="heldCheck" className="text-sm text-gray-300">I own this stock (Calculate P&L)</label>
              </div>

              {isHeld && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Number of Shares</label>
                  <input
                    type="number"
                    min="1"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="w-full bg-[#0e1218] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-gray-950 font-semibold text-sm hover:bg-emerald-400"
                >
                  Add Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Watchlist */}
      {isNewWlOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b24] border border-gray-700 p-6 rounded-xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-4">Create New Watchlist</h3>
            <form onSubmit={handleCreateWatchlist} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Watchlist Name</label>
                <input
                  type="text"
                  required
                  value={newWlName}
                  onChange={(e) => setNewWlName(e.target.value)}
                  placeholder="e.g. High Beta, Tech Picks"
                  className="w-full bg-[#0e1218] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewWlOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-gray-950 font-semibold text-sm hover:bg-emerald-400"
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