import os
import certifi
import pandas as pd
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "deltawatch")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

GROWW_INSTRUMENTS_URL = "https://growwapi-assets.groww.in/instruments/instrument.csv"

def infer_sector_from_name(name: str) -> str:
    n = str(name).upper()
    if any(k in n for k in ["BANK", "FINANCE", "FINANCIAL", "CAPITAL", "INVEST", "HOLDINGS"]):
        return "Banking & Finance"
    if any(k in n for k in ["TECH", "SOFTWARE", "INFOSYS", "SYSTEMS", "CYBER", "CONSULTANCY"]):
        return "IT"
    if any(k in n for k in ["PHARMA", "LABORATORIES", "HEALTH", "DRUGS", "LIFE SCIENCES"]):
        return "Pharma"
    if any(k in n for k in ["MOTORS", "AUTO", "TYRES", "FORGINGS", "AUTOMOBILE"]):
        return "Auto"
    if any(k in n for k in ["STEEL", "METALS", "MINING", "ALUMINIUM", "COPPER", "ZINC"]):
        return "Metals"
    if any(k in n for k in ["POWER", "ENERGY", "PETROLEUM", "OIL", "GAS", "RENEWABLE"]):
        return "Energy"
    if any(k in n for k in ["CONSUMER", "FOODS", "FMCG", "BEVERAGES", "BREWERIES"]):
        return "FMCG"
    return "Diversified"

def sync_groww_master():
    print("Downloading Groww instrument directory from CDN...")
    try:
        df = pd.read_csv(GROWW_INSTRUMENTS_URL, low_memory=False)

        # Filter strictly for NSE Cash Equities
        df_equities = df[
            (df["exchange"] == "NSE") &
            (df["segment"] == "CASH") &
            (df["series"] == "EQ")
        ].copy()

        records = []
        for _, row in df_equities.iterrows():
            sym = str(row.get("trading_symbol", "")).strip().upper()
            name = str(row.get("name", sym)).strip()
            groww_sym = str(row.get("groww_symbol", f"NSE-{sym}")).strip()
            isin = str(row.get("isin", "")).strip()

            if sym:
                records.append({
                    "symbol": sym,
                    "name": name,
                    "sector": infer_sector_from_name(name),
                    "groww_symbol": groww_sym,
                    "isin": isin
                })

        if records:
            db.master_symbols.delete_many({})
            db.master_symbols.insert_many(records)
            db.master_symbols.create_index("symbol")
            db.master_symbols.create_index([("symbol", "text"), ("name", "text")])
            print(f"Successfully stored {len(records)} stocks into db.master_symbols!")
            return True
    except Exception as e:
        print(f"Failed to sync master instruments: {e}")
        return False

if __name__ == "__main__":
    sync_groww_master()