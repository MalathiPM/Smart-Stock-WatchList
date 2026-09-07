import os
import random
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from bson import ObjectId

app = FastAPI(title="GrowwDelta Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "deltawatch")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

STOCK_UNIVERSE = {
    "TATATECH": {"name": "Tata Technologies", "sector": "IT", "base_price": 950.00},
    "SUNPHARMA": {"name": "Sun Pharma. Inds.", "sector": "PHARMA", "base_price": 1895.00},
    "BALAJEE": {"name": "Shree Tirup.Bal.Agro", "sector": "DIVERSIFIED", "base_price": 72.50},
    "HATSUN": {"name": "Hatsun Agro Prod", "sector": "CONSUMER", "base_price": 1085.00},
    "HDFCEQUAL": {"name": "HDFC Nifty50 Equal Wt", "sector": "FINANCE", "base_price": 142.30},
    "AFCONS": {"name": "Afcons Infrastruct.", "sector": "INFRA", "base_price": 485.00},
    "TATAGOLD": {"name": "Tata Gold ETF", "sector": "COMMODITIES", "base_price": 18.40},
    "RELIANCE": {"name": "Reliance Industries", "sector": "ENERGY", "base_price": 2980.00},
    "INFY": {"name": "Infosys Ltd", "sector": "IT", "base_price": 1845.00},
    "HDFCBANK": {"name": "HDFC Bank Ltd", "sector": "FINANCE", "base_price": 1650.00},
    "TCS": {"name": "Tata Consultancy Services", "sector": "IT", "base_price": 4210.00},
    "ICICIBANK": {"name": "ICICI Bank Ltd", "sector": "FINANCE", "base_price": 1240.00},
    "SBIN": {"name": "State Bank of India", "sector": "FINANCE", "base_price": 815.00},
    "TATAMOTORS": {"name": "Tata Motors Ltd", "sector": "AUTO", "base_price": 985.00},
}

LIVE_PRICES: Dict[str, float] = {}

def get_live_price(symbol: str) -> float:
    base = STOCK_UNIVERSE.get(symbol, {}).get("base_price", 500.00)
    if symbol not in LIVE_PRICES:
        LIVE_PRICES[symbol] = base

    # Small simulated step drift (-0.35% to +0.35%) per tick
    step_pct = random.uniform(-0.0035, 0.0035)
    new_price = round(LIVE_PRICES[symbol] * (1 + step_pct), 2)
    if abs(new_price - base) / base > 0.05:
        new_price = round(base * (1 + random.uniform(-0.01, 0.01)), 2)

    LIVE_PRICES[symbol] = new_price
    return new_price

@app.on_event("startup")
def seed_default_watchlist():
    if db.watchlists.count_documents({}) == 0:
        default_stocks = [
            {"symbol": "TATATECH", "held": False, "shares": 0, "volume_type": "Surge Volume"},
            {"symbol": "SUNPHARMA", "held": True, "shares": 10, "volume_type": "Normal"},
            {"symbol": "BALAJEE", "held": True, "shares": 50, "volume_type": "Normal"},
            {"symbol": "HATSUN", "held": False, "shares": 0, "volume_type": "Normal"},
            {"symbol": "HDFCEQUAL", "held": False, "shares": 0, "volume_type": "Normal"},
            {"symbol": "AFCONS", "held": False, "shares": 0, "volume_type": "Surge Volume"},
            {"symbol": "TATAGOLD", "held": False, "shares": 0, "volume_type": "Normal"}
        ]
        
        initial_snapshots = {}
        for s in default_stocks:
            sym = s["symbol"]
            current_p = get_live_price(sym)
            prior_p = round(current_p * random.choice([0.985, 1.015]), 2)
            initial_snapshots[sym] = {
                "seen_price": prior_p,
                "seen_at": datetime.utcnow().isoformat()
            }

        db.watchlists.insert_one({
            "name": "Primary watchlist",
            "stocks": default_stocks,
            "snapshots": initial_snapshots,
            "undo_snapshots": {}
        })

class AddStockRequest(BaseModel):
    symbol: str
    held: bool = False
    shares: int = 0
    volume_type: str = "Normal"

class CreateWatchlistRequest(BaseModel):
    name: str

class RenameWatchlistRequest(BaseModel):
    name: str

@app.get("/api/stocks/search")
def dynamic_stock_search(q: str = Query("", description="Search ticker or name")):
    query = q.strip().upper()
    if not query:
        return []

    results = []
    for sym, details in STOCK_UNIVERSE.items():
        if query in sym or query in details.get("name", "").upper():
            live_ltp = get_live_price(sym)
            results.append({
                "symbol": sym,
                "name": details.get("name", f"{sym} Ltd"),
                "sector": details.get("sector", "GENERAL"),
                "ltp": live_ltp
            })
    
    if not any(r["symbol"] == query for r in results) and len(query) >= 2:
        results.append({
            "symbol": query,
            "name": f"{query} Industries",
            "sector": "GENERAL",
            "ltp": get_live_price(query)
        })

    return results[:8]

@app.get("/api/watchlists")
def list_watchlists():
    wls = list(db.watchlists.find())
    return [{"id": str(w["_id"]), "name": w["name"], "count": len(w.get("stocks", []))} for w in wls]

@app.post("/api/watchlists")
def create_watchlist(req: CreateWatchlistRequest):
    new_wl = {
        "name": req.name,
        "stocks": [],
        "snapshots": {},
        "undo_snapshots": {}
    }
    res = db.watchlists.insert_one(new_wl)
    return {"id": str(res.inserted_id), "name": req.name, "count": 0}

@app.put("/api/watchlists/{watchlist_id}/rename")
def rename_watchlist(watchlist_id: str, req: RenameWatchlistRequest):
    res = db.watchlists.update_one({"_id": ObjectId(watchlist_id)}, {"$set": {"name": req.name}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return {"status": "success"}

@app.delete("/api/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: str):
    if db.watchlists.count_documents({}) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only watchlist")
    res = db.watchlists.delete_one({"_id": ObjectId(watchlist_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return {"status": "success"}

@app.get("/api/watchlists/{watchlist_id}")
def get_watchlist(watchlist_id: str):
    wl = db.watchlists.find_one({"_id": ObjectId(watchlist_id)})
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    snapshots = wl.get("snapshots", {})
    stocks_out = []
    total_portfolio_drift = 0.0
    held_count = 0

    breakout_count = 0
    fading_count = 0
    drag_count = 0
    sectors = {}

    for s in wl.get("stocks", []):
        sym = s["symbol"]
        meta = STOCK_UNIVERSE.get(sym, {"name": f"{sym} Corp", "sector": "GENERAL", "base_price": 500.00})
        
        now_price = get_live_price(sym)
        seen_price = snapshots.get(sym, {}).get("seen_price", now_price)
        
        delta_val = round(now_price - seen_price, 2)
        delta_pct = round((delta_val / seen_price) * 100, 2) if seen_price > 0 else 0.0

        vol_type = s.get("volume_type", "Normal")
        if delta_pct >= 1.0 and vol_type == "Surge Volume":
            flag = "BREAKOUT"
            breakout_count += 1
        elif delta_pct <= -1.0:
            flag = "DRAG"
            drag_count += 1
        elif delta_pct > 0 and vol_type == "Drying":
            flag = "FADING"
            fading_count += 1
        else:
            flag = "Rangebound"

        impact_val = 0.0
        if s.get("held", False) and s.get("shares", 0) > 0:
            held_count += 1
            impact_val = round(delta_val * s.get("shares", 0), 2)
            total_portfolio_drift += impact_val

        stock_item = {
            "symbol": sym,
            "name": meta["name"],
            "sector": meta["sector"],
            "now_price": now_price,
            "seen_price": seen_price,
            "delta_val": delta_val,
            "delta_pct": delta_pct,
            "flag": flag,
            "held": s.get("held", False),
            "shares": s.get("shares", 0),
            "impact_val": impact_val
        }
        stocks_out.append(stock_item)

        sec = meta["sector"]
        if sec not in sectors:
            sectors[sec] = []
        sectors[sec].append(stock_item)

    leader = max(stocks_out, key=lambda x: abs(x["delta_pct"])) if stocks_out else None

    sector_clusters = []
    for sec_name, sec_stocks in sectors.items():
        avg_delta = sum(st["delta_pct"] for st in sec_stocks) / len(sec_stocks)
        breakouts = [st["symbol"] for st in sec_stocks if st["flag"] == "BREAKOUT"]
        drags = [st["symbol"] for st in sec_stocks if st["flag"] == "DRAG"]

        if breakouts:
            commentary = f"Active breakout detected in {', '.join(breakouts)}. Volume supporting move."
        elif drags:
            commentary = f"Downward drag active in {', '.join(drags)}. Sector undergoing distribution."
        else:
            commentary = f"Sector is rangebound. Prices fluctuating within normal bounds ({avg_delta:+.2f}%)."

        sector_clusters.append({
            "sector": sec_name,
            "avg_delta": round(avg_delta, 2),
            "commentary": commentary,
            "stocks": sec_stocks
        })

    has_undo = bool(wl.get("undo_snapshots"))

    return {
        "id": str(wl["_id"]),
        "name": wl["name"],
        "telemetry": {
            "portfolio_absence_drift": round(total_portfolio_drift, 2),
            "held_count": held_count,
            "leader_symbol": leader["symbol"] if leader else "—",
            "leader_pct": leader["delta_pct"] if leader else 0.0,
            "leader_sector": leader["sector"] if leader else "—",
            "breakout_count": breakout_count,
            "fading_count": fading_count,
            "drag_count": drag_count,
            "sector_count": len(sectors),
            "stock_count": len(stocks_out),
            "has_undo": has_undo
        },
        "sectors": sector_clusters
    }

@app.post("/api/watchlists/{watchlist_id}/mark-seen")
def mark_seen(watchlist_id: str):
    wl = db.watchlists.find_one({"_id": ObjectId(watchlist_id)})
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    current_snapshots = wl.get("snapshots", {})
    db.watchlists.update_one(
        {"_id": ObjectId(watchlist_id)},
        {"$set": {"undo_snapshots": current_snapshots}}
    )

    new_snapshots = {}
    for s in wl.get("stocks", []):
        sym = s["symbol"]
        current_ltp = get_live_price(sym)
        new_snapshots[sym] = {
            "seen_price": current_ltp,
            "seen_at": datetime.utcnow().isoformat()
        }

    db.watchlists.update_one(
        {"_id": ObjectId(watchlist_id)},
        {"$set": {"snapshots": new_snapshots}}
    )

    return {"status": "success", "snapshots": new_snapshots}

@app.post("/api/watchlists/{watchlist_id}/undo-seen")
def undo_seen(watchlist_id: str):
    wl = db.watchlists.find_one({"_id": ObjectId(watchlist_id)})
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    undo_snapshots = wl.get("undo_snapshots", {})
    if not undo_snapshots:
        raise HTTPException(status_code=400, detail="No previous baseline to restore")

    db.watchlists.update_one(
        {"_id": ObjectId(watchlist_id)},
        {"$set": {"snapshots": undo_snapshots, "undo_snapshots": {}}}
    )

    return {"status": "success", "restored": undo_snapshots}

@app.post("/api/watchlists/{watchlist_id}/stocks")
def add_stock(watchlist_id: str, req: AddStockRequest):
    sym = req.symbol.upper().strip()
    if sym not in STOCK_UNIVERSE:
        STOCK_UNIVERSE[sym] = {"name": f"{sym} Industries", "sector": "GENERAL", "base_price": 500.00}

    cur_price = get_live_price(sym)
    baseline = round(cur_price * 0.98, 2) if req.volume_type == "Surge Volume" else cur_price

    stock_doc = {
        "symbol": sym,
        "held": req.held,
        "shares": req.shares,
        "volume_type": req.volume_type
    }

    db.watchlists.update_one(
        {"_id": ObjectId(watchlist_id)},
        {
            "$push": {"stocks": stock_doc},
            "$set": {f"snapshots.{sym}": {"seen_price": baseline, "seen_at": datetime.utcnow().isoformat()}}
        }
    )
    return {"status": "success"}

@app.delete("/api/watchlists/{watchlist_id}/stocks/{symbol}")
def delete_stock(watchlist_id: str, symbol: str):
    sym = symbol.upper().strip()
    db.watchlists.update_one(
        {"_id": ObjectId(watchlist_id)},
        {
            "$pull": {"stocks": {"symbol": sym}},
            "$unset": {f"snapshots.{sym}": "", f"undo_snapshots.{sym}": ""}
        }
    )
    return {"status": "success"}