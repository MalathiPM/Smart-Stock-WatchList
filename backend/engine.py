import os
import certifi
from typing import List, Optional
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "deltawatch")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

def evaluate_badge(delta_pct: float, volume: int, avg_volume: int, ltp: float, day_high: float) -> str:
    if abs(delta_pct) < 0.1:
        return ""

    vol_ratio = (volume / avg_volume) if avg_volume and avg_volume > 0 else 1.0
    pullback = ((day_high - ltp) / day_high * 100) if day_high and day_high > 0 else 0.0

    if delta_pct >= 1.5 and vol_ratio >= 1.4:
        return "BREAKOUT"
    if delta_pct <= -0.5 and vol_ratio <= 0.8:
        return "MOMENTUM FADING"
    return ""

def synthesize_dashboard(user_id: str, gateway_payload: dict, target_symbols: Optional[List[str]] = None) -> dict:
    telemetry_map = gateway_payload.get("telemetry", {})
    telemetry_clean = {k.strip().upper(): v for k, v in telemetry_map.items()}

    snapshot_doc = db.user_view_snapshots.find_one({"user_id": user_id}) or {}
    baseline_prices = snapshot_doc.get("prices", {})
    baseline_clean = {k.strip().upper(): float(v) for k, v in baseline_prices.items() if v is not None}

    holdings_cursor = db.user_holdings.find({"user_id": user_id})
    user_holdings = {h["symbol"].strip().upper(): h for h in holdings_cursor}

    # If specific watchlist target symbols are provided, filter strictly by them.
    # Otherwise, fallback to active items in db.watchlists.
    if target_symbols is not None:
        target_set = [s.strip().upper() for s in target_symbols if s]
    else:
        tracked_stocks = list(db.watchlists.find({"is_active": True}))
        target_set = [item.get("symbol", "").strip().upper() for item in tracked_stocks if item.get("symbol")]

    sectors_accumulator = {}

    for sym in target_set:
        if not sym:
            continue

        telem = telemetry_clean.get(sym, {})
        cached_item = db.global_telemetry_cache.find_one({"symbol": sym}, {"_id": 0}) or {}
        master_item = db.master_symbols.find_one({"symbol": sym}, {"_id": 0}) or {}
        watchlist_item = db.watchlists.find_one({"symbol": sym}, {"_id": 0}) or {}

        # Resolve display attributes
        sector = cached_item.get("sector") or watchlist_item.get("sector") or master_item.get("sector") or "Diversified"
        name = cached_item.get("name") or watchlist_item.get("name") or master_item.get("name") or sym

        # Safe LTP resolution hierarchy
        ltp = float(telem.get("ltp") or cached_item.get("ltp") or watchlist_item.get("ltp") or 100.0)
        day_high = float(telem.get("day_high", ltp))
        volume = int(telem.get("volume", 1_000_000))
        avg_vol = int(telem.get("avg_volume_20d", 1_000_000))

        # Baseline resolution
        baseline = float(baseline_clean.get(sym, telem.get("close_price", cached_item.get("close_price", ltp))))

        # Sanity Guard: Prevent corrupted or wildly divergent baselines
        if baseline <= 0 or abs(ltp - baseline) / baseline > 0.40:
            baseline = ltp

        delta_pct = round(((ltp - baseline) / baseline) * 100, 2) if baseline > 0 else 0.0
        badge = evaluate_badge(delta_pct, volume, avg_vol, ltp, day_high)

        is_held = sym in user_holdings
        pnl_impact = 0.0
        if is_held:
            qty = user_holdings[sym].get("quantity", 0)
            pnl_impact = round((ltp - baseline) * qty, 2)

        stock_card = {
            "symbol": sym,
            "name": name,
            "sector": sector,
            "ltp": ltp,
            "baseline": baseline,
            "delta_pct": delta_pct,
            "badge": badge,
            "is_held": is_held,
            "pnl_impact": pnl_impact
        }

        sectors_accumulator.setdefault(sector, []).append(stock_card)

    sectors_output = {}
    for sector_name, stocks in sectors_accumulator.items():
        avg_delta = round(sum(s["delta_pct"] for s in stocks) / len(stocks), 2) if stocks else 0.0

        for s in stocks:
            if avg_delta <= -1.0 and s["delta_pct"] < 0 and not s["badge"]:
                s["badge"] = "CLUSTER DRAG"

        sectors_output[sector_name] = {
            "sector_delta_avg": avg_delta,
            "stocks": stocks
        }

    return {
        "regime": gateway_payload.get("regime", {"status": "LIVE", "regime": "LIVE STREAM"}),
        "sectors": sectors_output
    }