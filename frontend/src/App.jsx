import React, { useState, useEffect, useRef } from "react";
import { 
  Search, Plus, CheckCircle2, RotateCcw, Trash2, X, 
  TrendingUp, TrendingDown, Eye, RefreshCw, Zap, Layers, Activity, Award,
  Compass, Info, ArrowRight, MoreVertical, Edit2
} from "lucide-react";

const API_BASE = "https://smart-stock-watchlist.onrender.com";

export default function App() {
  const [watchlists, setWatchlists] = useState([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUndoState, setIsUndoState] = useState(false);
  const [isSyncingAction, setIsSyncingAction] = useState(false);

  // Watchlist Modal & Edit States
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isCreateWlOpen, setIsCreateWlOpen] = useState(false);
  const [renameInputValue, setRenameInputValue] = useState("");
  const [newWlName, setNewWlName] = useState("");
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Stock Add Modal State
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);

  // Autocomplete State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchContainerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const menuRef = useRef(null);

  // Stock Form State
  const [formData, setFormData] = useState({
    symbol: "",
    name: "",
    sector: "Diversified",
    ltp: "",
    baseline: "",
    volume_behavior: "Normal Volume (1.0x avg - Rangebound)",
    is_held: false,
    quantity: 0
  });

  const fetchWatchlists = async () => {
    try {
      const res = await fetch(API_BASE + "/api/watchlists");
      if (!res.ok) throw new Error("Failed to load watchlists");
      const list = await res.json();
      setWatchlists(list);
      if (list.length > 0) {
        if (!activeWatchlistId || !list.some((w) => w.id === activeWatchlistId)) {
          const defaultWl = list.find((w) => w.is_default) || list[0];
          setActiveWatchlistId(defaultWl.id);
        }
      } else {
        setActiveWatchlistId(null);
      }
      return list;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const fetchDashboard = async (isManual = false) => {
    if (!activeWatchlistId) return;
    if (isManual) setIsRefreshing(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(API_BASE + "/api/dashboard?watchlist_id=" + encodeURIComponent(activeWatchlistId), {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.sectors) {
        setDashboard(data);
      }
      if (typeof data?.can_undo === "boolean") {
        setIsUndoState(data.can_undo);
      }
    } catch (err) {
      console.warn("Dashboard sync notice:", err.message);
    } finally {
      clearTimeout(timeoutId);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, []);

  useEffect(() => {
    if (activeWatchlistId) {
      setDashboard(null);
      fetchDashboard();
    }
  }, [activeWatchlistId]);

  useEffect(() => {
    const interval = setInterval(() => fetchDashboard(false), 8000);
    return () => clearInterval(interval);
  }, [activeWatchlistId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchResults([]);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        if (!e.target.closest("[data-menu-trigger]")) {
          setActiveMenuId(null);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!val.trim() || val.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(API_BASE + "/api/stocks/search?query=" + encodeURIComponent(val.trim()));
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 180);
  };

  const handleSelectStock = (item) => {
    const ltpValue = item.ltp && item.ltp > 0 ? item.ltp : 950.00;
    setFormData((prev) => ({
      ...prev,
      symbol: item.symbol,
      name: item.name,
      sector: item.sector || "Diversified",
      ltp: ltpValue,
      baseline: (ltpValue * 0.985).toFixed(2)
    }));
    setSearchQuery(`${item.symbol} - ${item.name}`);
    setSearchResults([]);
  };

  const handleCreateWatchlist = async (e) => {
    e.preventDefault();
    const trimmed = newWlName.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(API_BASE + "/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      if (!res.ok) throw new Error("Failed to create watchlist");
      const created = await res.json();
      await fetchWatchlists();
      setActiveWatchlistId(created.id);
      setNewWlName("");
      setIsCreateWlOpen(false);
    } catch (err) {
      alert("Error creating watchlist: " + err.message);
    }
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    const trimmed = renameInputValue.trim();
    if (!trimmed || !activeWatchlistId) return;

    try {
      const res = await fetch(API_BASE + "/api/watchlists/" + encodeURIComponent(activeWatchlistId) + "/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      if (!res.ok) throw new Error("Rename failed");

      setIsRenameOpen(false);
      setActiveMenuId(null);
      await fetchWatchlists();
    } catch (err) {
      alert("Error renaming watchlist: " + err.message);
    }
  };

  const handleDeleteWatchlist = async (id) => {
    if (watchlists.length <= 1) {
      alert("You must keep at least one active watchlist.");
      return;
    }
    if (!window.confirm("Delete this watchlist?")) return;
    try {
      const res = await fetch(API_BASE + "/api/watchlists/" + encodeURIComponent(id), { 
        method: "DELETE" 
      });
      if (!res.ok) throw new Error("Delete failed");

      setActiveMenuId(null);
      const remaining = watchlists.filter((w) => w.id !== id);
      if (activeWatchlistId === id) {
        setActiveWatchlistId(remaining[0]?.id || null);
      }
      await fetchWatchlists();
    } catch (err) {
      alert("Error deleting watchlist: " + err.message);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.symbol || !formData.ltp) return;
    try {
      await fetch(API_BASE + "/api/stocks/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          watchlist_id: activeWatchlistId,
          ltp: parseFloat(formData.ltp),
          baseline: formData.baseline ? parseFloat(formData.baseline) : null,
          quantity: parseInt(formData.quantity) || 0
        })
      });
      setIsAddStockOpen(false);
      setSearchQuery("");
      setSearchResults([]);
      setFormData({
        symbol: "",
        name: "",
        sector: "Diversified",
        ltp: "",
        baseline: "",
        volume_behavior: "Normal Volume (1.0x avg - Rangebound)",
        is_held: false,
        quantity: 0
      });
      fetchDashboard(true);
      fetchWatchlists();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveStock = async (symbol) => {
    if (!window.confirm(`Untrack ${symbol} from this watchlist?`)) return;
    try {
      await fetch(API_BASE + "/api/watchlists/" + encodeURIComponent(activeWatchlistId) + "/stocks/" + encodeURIComponent(symbol), { method: "DELETE" });
      fetchDashboard(true);
      fetchWatchlists();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBaselineSnapshot = async () => {
    setIsSyncingAction(true);
    try {
      if (!isUndoState) {
        const res = await fetch(API_BASE + "/api/snapshot/ack", { method: "POST" });
        const data = await res.json();
        setIsUndoState(data.can_undo);
      } else {
        await fetch(API_BASE + "/api/snapshot/undo", { method: "POST" });
        setIsUndoState(false);
      }
      await fetchDashboard(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncingAction(false);
    }
  };

  const sectors = dashboard?.sectors || {};
  const allStocks = Object.values(sectors).flatMap((s) => s.stocks || []);
  let bestPerformer = null;
  let totalHeldImpact = 0;
  let heldStockCount = 0;
  let breakoutCount = 0;
  let fadingCount = 0;
  let dragCount = 0;

  allStocks.forEach((stk) => {
    if (!bestPerformer || stk.delta_pct > bestPerformer.delta_pct) bestPerformer = stk;
    if (stk.badge === "BREAKOUT") breakoutCount += 1;
    if (stk.badge === "MOMENTUM FADING") fadingCount += 1;
    if (stk.badge === "CLUSTER DRAG") dragCount += 1;
    if (stk.is_held) {
      heldStockCount += 1;
      if (stk.pnl_impact) totalHeldImpact += stk.pnl_impact;
    }
  });

  const getSectorNarrative = (group) => {
    const avg = group.sector_delta_avg || 0;
    const count = group.stocks.length;
    const positiveCount = group.stocks.filter((s) => s.delta_pct > 0).length;
    const breakoutStocks = group.stocks.filter((s) => s.badge === "BREAKOUT");

    if (breakoutStocks.length > 0) {
      return { tone: "positive", text: `Active breakout detected in ${breakoutStocks.map((s) => s.symbol).join(", ")}. Institutional volume supporting move.` };
    }
    if (avg <= -1.0) {
      return { tone: "negative", text: `Cluster drag warning: ${count - positiveCount} of ${count} stocks sliding below baseline.` };
    }
    if (avg >= 1.0) {
      return { tone: "positive", text: `Strong sector momentum: ${positiveCount} of ${count} stocks advancing comfortably above baseline.` };
    }
    return { tone: "neutral", text: `Sector is rangebound. Prices fluctuating within normal bounds (${avg > 0 ? "+" : ""}${avg.toFixed(2)}%).` };
  };

  const activeWatchlist = watchlists.find((w) => w.id === activeWatchlistId);

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#F3F4F6] font-sans antialiased selection:bg-[#00D09C]/20 selection:text-[#00D09C]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#12151B]/95 backdrop-blur-md border-b border-[#232731]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[4rem] py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#00D09C] to-[#25D7AA] flex items-center justify-center shadow-lg shadow-[#00D09C]/20 shrink-0">
              <Zap className="w-5 h-5 text-[#0F1115] fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold tracking-tight text-white">Groww<span className="text-[#00D09C]">Delta</span></span>
                <span className="text-[10px] bg-[#1C212A] text-[#00D09C] font-semibold px-2 py-0.5 rounded-full border border-[#00D09C]/30">
                  ABSENCE INTELLIGENCE
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <button
              onClick={handleToggleBaselineSnapshot}
              disabled={isSyncingAction}
              className={`flex items-center gap-1.5 sm:gap-2 text-xs font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border transition duration-200 active:scale-95 ${
                isUndoState
                  ? "bg-[#252219] hover:bg-[#302B1F] text-[#FBBF24] border-[#F59E0B]/40 shadow-md shadow-[#F59E0B]/10"
                  : "bg-[#1C212A] hover:bg-[#252C37] text-slate-200 border-[#2D3340]"
              }`}
            >
              {isSyncingAction ? <RefreshCw className="w-4 h-4 animate-spin" /> : isUndoState ? <RotateCcw className="w-4 h-4 text-[#FBBF24]" /> : <CheckCircle2 className="w-4 h-4 text-[#00D09C]" />}
              <span>{isUndoState ? "Undo Reset" : "Mark All As Seen"}</span>
            </button>

            <button
              onClick={() => setIsAddStockOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold bg-[#00D09C] hover:bg-[#00B98A] text-[#0F1115] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-lg shadow-[#00D09C]/25 transition duration-150 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Stock</span>
            </button>
          </div>
        </div>

        {/* Watchlist Tabs Strip */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between border-t border-[#1C2028] bg-[#0E1015]/90 py-2.5 relative z-30 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {watchlists.map((wl) => {
              const isActive = wl.id === activeWatchlistId;

              return (
                <div key={wl.id} className="relative flex items-center" ref={isActive ? menuRef : null}>
                  <button
                    onClick={() => setActiveWatchlistId(wl.id)}
                    className={`text-xs px-3 sm:px-3.5 py-1.5 rounded-xl font-semibold transition whitespace-nowrap flex items-center gap-2 ${
                      isActive
                        ? "bg-[#00D09C]/15 text-[#00D09C] border border-[#00D09C]/30 shadow-sm"
                        : "bg-[#181B20] text-slate-400 hover:text-white border border-[#232731]"
                    }`}
                  >
                    <span>{wl.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#12151B] text-slate-500">
                      {wl.symbols ? wl.symbols.length : 0}
                    </span>
                  </button>

                  {/* 3-Dots Menu Button */}
                  {isActive && (
                    <button
                      type="button"
                      data-menu-trigger="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId((prev) => (prev === wl.id ? null : wl.id));
                      }}
                      className="p-1.5 hover:text-white text-slate-400 rounded-lg hover:bg-[#232731] transition -ml-1"
                      title="Watchlist Options"
                    >
                      <MoreVertical className="w-3.5 h-3.5 pointer-events-none" />
                    </button>
                  )}

                  {/* Menu Dropdown */}
                  {activeMenuId === wl.id && (
                    <div className="absolute top-full left-0 mt-2 bg-[#1C2028] border border-[#2B313E] rounded-xl shadow-2xl py-1.5 z-50 w-36">
                      <button
                        type="button"
                        onClick={() => {
                          setRenameInputValue(wl.name);
                          setIsRenameOpen(true);
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-[#252B37] hover:text-[#00D09C] flex items-center gap-2 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWatchlist(wl.id)}
                        className="w-full text-left px-3 py-2 text-xs text-[#EB5B56] hover:bg-[#252B37] flex items-center gap-2 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => {
                setNewWlName("");
                setIsCreateWlOpen(true);
              }}
              className="text-xs px-3 sm:px-3.5 py-1.5 rounded-xl text-slate-400 hover:text-[#00D09C] hover:bg-[#181B20] border border-dashed border-[#2C313E] transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" /> New Watchlist
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-9">
        {!dashboard ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-[#141820] border border-[#232731] rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="h-64 bg-[#141820] border border-[#232731] rounded-2xl animate-pulse" />
          </div>
        ) : allStocks.length === 0 ? (
          <div className="text-center py-20 sm:py-24 px-4 bg-[#141820] border border-dashed border-[#262B34] rounded-2xl">
            <Eye className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300 font-medium text-sm">
              "{activeWatchlist?.name}" has no tracked stocks.
            </p>
            <p className="text-slate-500 text-xs mt-1">Add equities from the Master Universe to track absence drift.</p>
            <button
              onClick={() => setIsAddStockOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#00D09C] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add Stock to {activeWatchlist?.name}
            </button>
          </div>
        ) : (
          <>
            {/* Top Summaries */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#181B20] border border-[#262B34] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-[#353C49] transition shadow-sm">
                <div>
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Portfolio Absence Drift</span>
                    <Activity className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${totalHeldImpact >= 0 ? "text-[#00D09C]" : "text-[#EB5B56]"}`}>
                      {totalHeldImpact >= 0 ? "+" : "-"}₹{Math.abs(totalHeldImpact).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[11px] text-slate-400">P&L shift</span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#232731] text-[11px] text-slate-400">
                  Calculated across <span className="text-white font-semibold">{heldStockCount} held assets</span> in this watchlist.
                </div>
              </div>

              <div className="bg-[#181B20] border border-[#262B34] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-[#353C49] transition shadow-sm">
                <div>
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Absence Delta Leader</span>
                    <Award className="w-4 h-4 text-[#00D09C]" />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-base sm:text-lg font-bold text-white font-mono">{bestPerformer?.symbol || "—"}</span>
                      <p className="text-[11px] text-slate-400 line-clamp-1">{bestPerformer?.name || "No assets"}</p>
                    </div>
                    <span className={`text-sm font-bold font-mono ${(bestPerformer?.delta_pct || 0) >= 0 ? "text-[#00D09C]" : "text-[#EB5B56]"}`}>
                      {(bestPerformer?.delta_pct || 0) >= 0 ? "+" : ""}{(bestPerformer?.delta_pct || 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#232731] text-[11px] text-slate-400">
                  Highest divergence from snapshot anchor ({bestPerformer?.sector || "General"}).
                </div>
              </div>

              <div className="bg-[#181B20] border border-[#262B34] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-[#353C49] transition shadow-sm">
                <div>
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Active Behavioral Flags</span>
                    <Compass className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div>
                      <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400">{breakoutCount}</span>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Breakout</p>
                    </div>
                    <div className="h-6 w-px bg-[#262B34]" />
                    <div>
                      <span className="text-lg sm:text-xl font-bold font-mono text-amber-400">{fadingCount}</span>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Fading</p>
                    </div>
                    <div className="h-6 w-px bg-[#262B34]" />
                    <div>
                      <span className="text-lg sm:text-xl font-bold font-mono text-rose-400">{dragCount}</span>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Drag</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#232731] text-[11px] text-slate-400">
                  Automated flags evaluated on volume & intraday momentum.
                </div>
              </div>

              <div className="bg-[#181B20] border border-[#262B34] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-[#353C49] transition shadow-sm">
                <div>
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Watchlist Coverage</span>
                    <Layers className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-xl sm:text-2xl font-bold font-mono text-white">
                      {Object.keys(sectors).length}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {allStocks.length} tracked stocks
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#232731] text-[11px] text-slate-400">
                  Active view: <span className="text-[#00D09C] font-semibold">{activeWatchlist?.name}</span>
                </div>
              </div>
            </section>

            {/* Sectors and Stock Cards */}
            {Object.entries(sectors).map(([sectorName, group]) => {
              const isSectorPos = (group.sector_delta_avg || 0) >= 0;
              const narrative = getSectorNarrative(group);

              return (
                <section key={sectorName} className="space-y-3 bg-[#13161C] p-4 sm:p-5 rounded-2xl border border-[#202530]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                        {sectorName}
                      </h2>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ${
                          isSectorPos 
                            ? "bg-[#00D09C]/15 text-[#00D09C] border border-[#00D09C]/30" 
                            : "bg-[#EB5B56]/15 text-[#EB5B56] border border-[#EB5B56]/30"
                        }`}
                      >
                        {isSectorPos ? "+" : ""}{(group.sector_delta_avg || 0).toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {group.stocks.length} tracked
                    </span>
                  </div>

                  <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed ${
                    narrative.tone === "positive" 
                      ? "bg-[#00D09C]/5 border-[#00D09C]/20 text-[#25D7AA]" 
                      : narrative.tone === "negative"
                      ? "bg-[#EB5B56]/5 border-[#EB5B56]/20 text-[#F87171]"
                      : "bg-[#1A1E26] border-[#29303D] text-slate-400"
                  }`}>
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{narrative.text}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                    {group.stocks.map((stock) => {
                      const isStockPos = (stock.delta_pct || 0) >= 0;
                      const priceDiff = stock.ltp - stock.baseline;
                      const isZero = Math.abs(priceDiff) < 0.05;

                      return (
                        <div
                          key={stock.symbol}
                          className="bg-[#181B20] border border-[#262B34] hover:border-[#353C49] rounded-2xl p-4 sm:p-5 relative group transition duration-150 flex flex-col justify-between shadow-sm hover:shadow-xl hover:shadow-black/20"
                        >
                          <div>
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-sm tracking-wide">
                                    {stock.symbol}
                                  </span>
                                  {stock.is_held && (
                                    <span className="text-[9px] bg-[#222938] text-[#818CF8] px-2 py-0.5 rounded-full font-bold border border-[#818CF8]/30">
                                      HELD
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5">
                                  {stock.name}
                                </p>
                              </div>
                              <button
                                onClick={() => handleRemoveStock(stock.symbol)}
                                className="text-slate-600 hover:text-[#EB5B56] transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded-md hover:bg-[#262B34]"
                                title="Untrack from this watchlist"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex items-baseline justify-between mt-4">
                              <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white">
                                ₹{Number(stock.ltp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                              <div className="flex items-center gap-1 font-mono text-xs font-bold">
                                {isStockPos ? <TrendingUp className="w-4 h-4 text-[#00D09C]" /> : <TrendingDown className="w-4 h-4 text-[#EB5B56]" />}
                                <span className={isStockPos ? "text-[#00D09C]" : "text-[#EB5B56]"}>
                                  {isStockPos ? "+" : ""}{(stock.delta_pct || 0).toFixed(2)}%
                                </span>
                              </div>
                            </div>

                            <div className="mt-3.5 bg-[#12151B] border border-[#232731] rounded-xl p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-slate-400">
                                  Seen: <span className="text-slate-200">₹{Number(stock.baseline).toFixed(2)}</span>
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-600" />
                                <span className="text-slate-400">
                                  Now: <span className="text-white font-semibold">₹{Number(stock.ltp).toFixed(2)}</span>
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#1C2028]">
                                <span className="text-slate-500">Since Last Visit:</span>
                                <span
                                  className={`font-mono font-bold ${
                                    isZero ? "text-slate-400" : isStockPos ? "text-[#00D09C]" : "text-[#EB5B56]"
                                  }`}
                                >
                                  {isStockPos && !isZero ? "+" : ""}₹{priceDiff.toFixed(2)} ({isStockPos && !isZero ? "+" : ""}{(stock.delta_pct || 0).toFixed(2)}%)
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-[#232731] flex items-center justify-between text-xs">
                            <div>
                              {stock.badge ? (
                                <span
                                  className={`font-bold px-2.5 py-0.5 rounded-full text-[10px] tracking-wide uppercase ${
                                    stock.badge === "BREAKOUT"
                                      ? "bg-[#00D09C]/15 text-[#00D09C] border border-[#00D09C]/35"
                                      : stock.badge === "MOMENTUM FADING"
                                      ? "bg-[#F59E0B]/15 text-[#FBBF24] border border-[#F59E0B]/35"
                                      : "bg-[#EB5B56]/15 text-[#EB5B56] border border-[#EB5B56]/35"
                                  }`}
                                >
                                  {stock.badge}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">Rangebound</span>
                              )}
                            </div>

                            {stock.is_held && stock.pnl_impact !== undefined && (
                              <span className={`font-mono font-semibold ${stock.pnl_impact >= 0 ? "text-[#00D09C]" : "text-[#EB5B56]"}`}>
                                {stock.pnl_impact >= 0 ? "+" : "-"}₹{Math.abs(stock.pnl_impact).toLocaleString("en-IN", { minimumFractionDigits: 2 })} impact
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>

      {/* RENAME MODAL */}
      {isRenameOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181B20] border border-[#2D3340] rounded-3xl w-full max-w-sm p-6 relative shadow-2xl">
            <h3 className="font-bold text-base text-white mb-4">Rename Watchlist</h3>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-xs mb-1.5 font-semibold">New Name</label>
                <input
                  type="text"
                  required
                  value={renameInputValue}
                  onChange={(e) => setRenameInputValue(e.target.value)}
                  className="w-full bg-[#101216] border border-[#2E3442] focus:border-[#00D09C] rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRenameOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold bg-[#00D09C] hover:bg-[#00B98A] text-[#0F1115] rounded-xl font-mono"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE WATCHLIST MODAL */}
      {isCreateWlOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181B20] border border-[#2D3340] rounded-3xl w-full max-w-sm p-6 relative shadow-2xl">
            <h3 className="font-bold text-base text-white mb-4">Create New Watchlist</h3>
            <form onSubmit={handleCreateWatchlist} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-xs mb-1.5 font-semibold">Watchlist Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High Growth Tech, Bluechips..."
                  value={newWlName}
                  onChange={(e) => setNewWlName(e.target.value)}
                  className="w-full bg-[#101216] border border-[#2E3442] focus:border-[#00D09C] rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateWlOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold bg-[#00D09C] hover:bg-[#00B98A] text-[#0F1115] rounded-xl font-mono"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD STOCK MODAL */}
      {isAddStockOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181B20] border border-[#2D3340] rounded-3xl w-full max-w-md p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-[#262B34]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00D09C]" />
                <h3 className="font-bold text-sm sm:text-base text-white">Add Stock to "{activeWatchlist?.name}"</h3>
              </div>
              <button onClick={() => setIsAddStockOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#232731]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 relative" ref={searchContainerRef}>
              <label className="block text-slate-300 text-xs font-semibold mb-1.5">Search Master Stock Universe</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Type symbol (e.g. SUN, TATA, INFY)..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full bg-[#101216] border border-[#2E3442] focus:border-[#00D09C] rounded-xl pl-10 pr-24 py-2.5 text-xs text-white outline-none"
                />
                {isSearching && <div className="absolute right-3.5 top-2.5 text-[10px] text-[#00D09C] animate-pulse font-mono">Searching...</div>}
              </div>

              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#1C2027] border border-[#2D3340] rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-[#262B34]">
                  {searchResults.map((item) => (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => handleSelectStock(item)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#00D09C]/10 transition flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-white text-xs font-mono">{item.symbol}</span>
                        <p className="text-[11px] text-slate-400">{item.name}</p>
                      </div>
                      <div className="text-right">
                        {item.ltp > 0 && <span className="text-xs font-semibold text-[#00D09C] font-mono block">₹{item.ltp}</span>}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#12151B] text-slate-300">{item.sector || "Diversified"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Symbol</label>
                  <input
                    type="text"
                    required
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="w-full bg-[#101216] border border-[#2E3442] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Sector</label>
                  <input
                    type="text"
                    required
                    value={formData.sector}
                    onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                    className="w-full bg-[#101216] border border-[#2E3442] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#101216] border border-[#2E3442] rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Current LTP (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={formData.ltp}
                    onChange={(e) => setFormData({ ...formData, ltp: e.target.value })}
                    className="w-full bg-[#101216] border border-[#2E3442] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Baseline Ref (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={formData.baseline}
                    onChange={(e) => setFormData({ ...formData, baseline: e.target.value })}
                    className="w-full bg-[#101216] border border-[#2E3442] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Volume Behavior</label>
                <select
                  value={formData.volume_behavior}
                  onChange={(e) => setFormData({ ...formData, volume_behavior: e.target.value })}
                  className="w-full bg-[#101216] border border-[#2E3442] rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option>Normal Volume (1.0x avg - Rangebound)</option>
                  <option>Surge Volume (2.5x avg - triggers Breakout)</option>
                  <option>Drying Volume (0.5x avg - triggers Momentum Fading)</option>
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.is_held}
                    onChange={(e) => setFormData({ ...formData, is_held: e.target.checked })}
                    className="rounded bg-[#101216] border-[#2E3442] text-[#00D09C] focus:ring-0"
                  />
                  I own this stock (Portfolio)
                </label>
                {formData.is_held && (
                  <input
                    type="number"
                    placeholder="Quantity of shares owned"
                    value={formData.quantity || ""}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="mt-2 w-full bg-[#101216] border border-[#2E3442] rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#262B34]">
                <button type="button" onClick={() => setIsAddStockOpen(false)} className="px-4 py-2 text-xs text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" className="px-5 py-2.5 text-xs font-bold bg-[#00D09C] hover:bg-[#00B98A] text-[#0F1115] rounded-xl">Add to Watchlist</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}