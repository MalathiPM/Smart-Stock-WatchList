import os
import re
import certifi
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

from gateway import fetch_telemetry
from engine import synthesize_dashboard

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "deltawatch")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

app = FastAPI(title="DeltaWatch Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/healthz")
def health_check():
    return {"status": "alive"}
# ----------------- DATA MODELS -----------------
class WatchlistCreate(BaseModel):
    name: str

class WatchlistRename(BaseModel):
    name: str

class AddStockPayload(BaseModel):
    watchlist_id: str
    symbol: str
    name: str
    sector: str
    ltp: float
    baseline: Optional[float] = None
    volume_behavior: str
    is_held: bool
    quantity: int

# ----------------- INITIAL SEED HELPER -----------------
def get_or_create_default_watchlist(user_id: str = "demo_user"):
    wl = db.user_watchlists.find_one({"user_id": user_id, "is_default": True})
    if not wl:
        # Migrate existing items if available
        existing_items = list(db.watchlists.find({"is_active": True}))
        symbols = [item["symbol"].strip().upper() for item in existing_items]
        if not symbols:
            symbols = ["TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "TATAMOTORS", "RELIANCE"]

        inserted = db.user_watchlists.insert_one({
            "user_id": user_id,
            "name": "Primary Watchlist",
            "is_default": True,
            "symbols": symbols
        })
        wl = db.user_watchlists.find_one({"_id": inserted.inserted_id})
    return wl

# ----------------- WATCHLIST CRUD ROUTES -----------------

@app.get("/api/watchlists")
def list_watchlists(user_id: str = "demo_user"):
    get_or_create_default_watchlist(user_id)
    watchlists = list(db.user_watchlists.find({"user_id": user_id}))
    for w in watchlists:
        w["id"] = str(w["_id"])
        del w["_id"]
    return watchlists

@app.post("/api/watchlists")
def create_watchlist(payload: WatchlistCreate, user_id: str = "demo_user"):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    
    doc = {
        "user_id": user_id,
        "name": name,
        "is_default": False,
        "symbols": []
    }
    res = db.user_watchlists.insert_one(doc)
    return {"id": str(res.inserted_id), "name": name, "symbols": []}

@app.put("/api/watchlists/{watchlist_id}/rename")
def rename_watchlist(watchlist_id: str, payload: WatchlistRename, user_id: str = "demo_user"):
    new_name = payload.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    
    db.user_watchlists.update_one(
        {"_id": ObjectId(watchlist_id), "user_id": user_id},
        {"$set": {"name": new_name}}
    )
    return {"status": "success", "name": new_name}

@app.delete("/api/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: str, user_id: str = "demo_user"):
    target = db.user_watchlists.find_one({"_id": ObjectId(watchlist_id), "user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    total_count = db.user_watchlists.count_documents({"user_id": user_id})
    if total_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete your only watchlist")
    
    db.user_watchlists.delete_one({"_id": ObjectId(watchlist_id), "user_id": user_id})
    
    # If deleted was default, promote another
    if target.get("is_default"):
        remaining = db.user_watchlists.find_one({"user_id": user_id})
        if remaining:
            db.user_watchlists.update_one({"_id": remaining["_id"]}, {"$set": {"is_default": True}})
            
    return {"status": "success"}

# ----------------- DASHBOARD ROUTE (PER-WATCHLIST AWARE) -----------------

@app.get("/api/dashboard")
def get_dashboard(watchlist_id: Optional[str] = None, user_id: str = "demo_user"):
    if watchlist_id and watchlist_id != "undefined":
        active_wl = db.user_watchlists.find_one({"_id": ObjectId(watchlist_id), "user_id": user_id})
    else:
        active_wl = get_or_create_default_watchlist(user_id)

    if not active_wl:
        return {"sectors": {}, "can_undo": False}

    active_symbols = active_wl.get("symbols", [])

    # Fetch live quotes
    gateway_data = fetch_telemetry()
    dashboard_data = synthesize_dashboard(user_id, gateway_data, target_symbols=active_symbols)

    snapshot_doc = db.user_view_snapshots.find_one({"user_id": user_id}) or {}
    dashboard_data["can_undo"] = bool(snapshot_doc.get("previous_prices"))
    dashboard_data["watchlist_id"] = str(active_wl["_id"])
    dashboard_data["watchlist_name"] = active_wl["name"]
    return dashboard_data

# ----------------- STOCKS CRUD (SCOPED TO WATCHLIST) -----------------

@app.post("/api/stocks/add")
def add_custom_stock(payload: AddStockPayload, user_id: str = "demo_user"):
    sym = payload.symbol.upper().strip()
    ltp = float(payload.ltp)
    anchor_price = float(payload.baseline) if payload.baseline and payload.baseline > 0 else round(ltp * 0.985, 2)

    # 1. Add symbol to selected watchlist
    db.user_watchlists.update_one(
        {"_id": ObjectId(payload.watchlist_id), "user_id": user_id},
        {"$addToSet": {"symbols": sym}}
    )

    # 2. Update symbol master and cache
    multiplier = 2.5 if "Surge" in payload.volume_behavior else (0.5 if "Drying" in payload.volume_behavior else 1.0)
    db.global_telemetry_cache.update_one(
        {"symbol": sym},
        {
            "$set": {
                "symbol": sym,
                "name": payload.name,
                "sector": payload.sector,
                "ltp": ltp,
                "day_high": round(ltp * 1.015, 2),
                "day_low": round(ltp * 0.985, 2),
                "volume": int(1_000_000 * multiplier),
                "avg_volume_20d": 1_000_000,
                "close_price": anchor_price
            }
        },
        upsert=True
    )

    db.user_view_snapshots.update_one(
        {"user_id": user_id},
        {"$set": {f"prices.{sym}": anchor_price}},
        upsert=True
    )

    if payload.is_held and payload.quantity > 0:
        db.user_holdings.update_one(
            {"user_id": user_id, "symbol": sym},
            {"$set": {"user_id": user_id, "symbol": sym, "quantity": payload.quantity, "avg_buy_price": anchor_price}},
            upsert=True
        )

    return {"status": "success", "symbol": sym}

@app.delete("/api/watchlists/{watchlist_id}/stocks/{symbol}")
def remove_stock_from_watchlist(watchlist_id: str, symbol: str, user_id: str = "demo_user"):
    sym = symbol.upper().strip()
    db.user_watchlists.update_one(
        {"_id": ObjectId(watchlist_id), "user_id": user_id},
        {"$pull": {"symbols": sym}}
    )
    return {"status": "success", "removed": sym}

# ----------------- SNAPSHOT ACK & UNDO -----------------

@app.post("/api/snapshot/ack")
def mark_all_as_seen(user_id: str = "demo_user"):
    current_doc = db.user_view_snapshots.find_one({"user_id": user_id}) or {}
    prev_prices = current_doc.get("prices", {})

    all_telemetry = list(db.global_telemetry_cache.find({}, {"_id": 0}))
    new_prices = {doc["symbol"]: doc["ltp"] for doc in all_telemetry if "ltp" in doc}

    db.user_view_snapshots.update_one(
        {"user_id": user_id},
        {"$set": {"prices": new_prices, "previous_prices": prev_prices}},
        upsert=True
    )
    return {"status": "success", "can_undo": bool(prev_prices)}

@app.post("/api/snapshot/undo")
def undo_mark_seen(user_id: str = "demo_user"):
    all_telemetry = list(db.global_telemetry_cache.find({}, {"_id": 0}))
    prev_prices = {}

    for item in all_telemetry:
        sym = item["symbol"].strip().upper()
        ltp = float(item.get("ltp", 100.0))
        if sym in ["TATAMOTORS", "RELIANCE"]:
            prev_prices[sym] = round(ltp * 0.974, 2)
        elif sym in ["TCS", "INFY"]:
            prev_prices[sym] = round(ltp * 1.025, 2)
        elif sym == "SUNPHARMA":
            prev_prices[sym] = round(ltp * 0.982, 2)
        elif sym == "BCPL":
            prev_prices[sym] = round(ltp * 0.980, 2)
        else:
            prev_prices[sym] = round(ltp * 0.985, 2)

    db.user_view_snapshots.update_one(
        {"user_id": user_id},
        {"$set": {"prices": prev_prices}, "$unset": {"previous_prices": ""}}
    )
    return {"status": "success"}

@app.get("/api/stocks/search")
def search_stocks(query: str = ""):
    q = query.strip()
    if not q or len(q) < 2:
        return []
    try:
        safe_q = re.escape(q)
        query_filter = {
            "$or": [
                {"symbol": {"$regex": f"^{safe_q}", "$options": "i"}},
                {"name": {"$regex": safe_q, "$options": "i"}}
            ]
        }
        results = list(db.master_symbols.find(query_filter, {"_id": 0}).limit(8))
        for item in results:
            cached = db.global_telemetry_cache.find_one({"symbol": item["symbol"]}, {"_id": 0, "ltp": 1})
            item["ltp"] = cached.get("ltp", 0.0) if cached else 0.0
        return results
    except Exception as e:
        print(f"[Search API Error]: {e}")
        return []