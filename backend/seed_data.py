import os
import certifi
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "deltawatch")

print(f"Connecting to MongoDB Atlas: {DB_NAME}...")
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

def seed():
    print("Clearing old collections...")
    db.watchlists.delete_many({})
    db.user_view_snapshots.delete_many({})
    db.global_telemetry_cache.delete_many({})
    db.user_holdings.delete_many({})

    print("Inserting watchlists...")
    watchlists = [
        {"symbol": "TCS", "name": "Tata Consultancy Services", "sector": "IT", "is_active": True},
        {"symbol": "INFY", "name": "Infosys Ltd", "sector": "IT", "is_active": True},
        {"symbol": "HDFCBANK", "name": "HDFC Bank Ltd", "sector": "Banking", "is_active": True},
        {"symbol": "ICICIBANK", "name": "ICICI Bank Ltd", "sector": "Banking", "is_active": True},
        {"symbol": "SBIN", "name": "State Bank of India", "sector": "Banking", "is_active": True},
        {"symbol": "RELIANCE", "name": "Reliance Industries", "sector": "Energy", "is_active": True},
    ]
    db.watchlists.insert_many(watchlists)

    print("Inserting global telemetry...")
    telemetry = [
        {"symbol": "TCS", "ltp": 3942.0, "day_high": 3955.0, "day_low": 3810.0, "volume": 2800000, "avg_volume_20d": 1000000, "high_52w": 3960.0},
        {"symbol": "INFY", "ltp": 1805.0, "day_high": 1845.0, "day_low": 1795.0, "volume": 850000, "avg_volume_20d": 1400000, "high_52w": 1920.0},
        {"symbol": "HDFCBANK", "ltp": 1595.0, "day_high": 1642.0, "day_low": 1590.0, "volume": 12000000, "avg_volume_20d": 11000000, "high_52w": 1790.0},
        {"symbol": "ICICIBANK", "ltp": 1185.0, "day_high": 1222.0, "day_low": 1180.0, "volume": 9500000, "avg_volume_20d": 9000000, "high_52w": 1300.0},
        {"symbol": "SBIN", "ltp": 782.0, "day_high": 805.0, "day_low": 780.0, "volume": 14000000, "avg_volume_20d": 13500000, "high_52w": 912.0},
        {"symbol": "RELIANCE", "ltp": 2942.0, "day_high": 2950.0, "day_low": 2935.0, "volume": 3100000, "avg_volume_20d": 3500000, "high_52w": 3217.0},
    ]
    db.global_telemetry_cache.insert_many(telemetry)

    print("Inserting user baseline snapshot...")
    user_snapshot = {
        "user_id": "demo_user",
        "last_viewed_at": datetime(2026, 9, 4, 10, 15, tzinfo=timezone.utc),
        "snapshot_label": "Friday 10:15 AM",
        "prices": {
            "TCS": 3820.0,
            "INFY": 1800.0,
            "HDFCBANK": 1640.0,
            "ICICIBANK": 1220.0,
            "SBIN": 803.0,
            "RELIANCE": 2940.0
        }
    }
    db.user_view_snapshots.insert_one(user_snapshot)

    print("Inserting user holdings...")
    holdings = [
        {"user_id": "demo_user", "symbol": "TCS", "quantity": 10, "avg_buy_price": 3500.0},
        {"user_id": "demo_user", "symbol": "HDFCBANK", "quantity": 10, "avg_buy_price": 1550.0}
    ]
    db.user_holdings.insert_many(holdings)

    print("SUCCESS: Database fully populated!")

# Directly invoke the function
seed()