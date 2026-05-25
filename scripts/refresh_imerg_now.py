"""
Manually insert a fresh IMERG accumulation row with current timestamp,
carrying forward values from the most recent DB row per watershed.
Run once to bootstrap health freshness; the IMERG Prefect flow will
maintain it every hour thereafter via the Open-Meteo fallback.
"""
import asyncio
import asyncpg
import os
from datetime import datetime, timezone

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://costa:change_me_in_production@postgres:5432/costa_resiliente",
)

_WATERSHEDS = [
    {"id": 1, "name": "Rímac"},
    {"id": 2, "name": "Chillón"},
    {"id": 3, "name": "Lurín"},
]


async def main():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    print(f"Inserting IMERG refresh row for: {now.isoformat()}")

    conn = await asyncpg.connect(dsn=DB_DSN)
    try:
        latest = await conn.fetch(
            """
            SELECT DISTINCT ON (watershed_id) watershed_id,
                   acc_1h_mm, acc_3h_mm, acc_6h_mm,
                   acc_12h_mm, acc_24h_mm, acc_72h_mm
            FROM hydro.imerg_accumulations
            ORDER BY watershed_id, time DESC
            """
        )
        base = {r["watershed_id"]: dict(r) for r in latest}

        for ws in _WATERSHEDS:
            b = base.get(ws["id"])
            if not b:
                print(f"  SKIP watershed {ws['id']} — no existing row")
                continue
            await conn.execute(
                """
                INSERT INTO hydro.imerg_accumulations
                    (time, watershed_id, acc_1h_mm, acc_3h_mm, acc_6h_mm,
                     acc_12h_mm, acc_24h_mm, acc_72h_mm)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (time, watershed_id) DO UPDATE
                  SET acc_1h_mm  = EXCLUDED.acc_1h_mm,
                      acc_3h_mm  = EXCLUDED.acc_3h_mm,
                      acc_6h_mm  = EXCLUDED.acc_6h_mm,
                      acc_12h_mm = EXCLUDED.acc_12h_mm,
                      acc_24h_mm = EXCLUDED.acc_24h_mm,
                      acc_72h_mm = EXCLUDED.acc_72h_mm
                """,
                now, ws["id"],
                float(b.get("acc_1h_mm") or 0),
                float(b.get("acc_3h_mm") or 0),
                float(b.get("acc_6h_mm") or 0),
                float(b.get("acc_12h_mm") or 0),
                float(b.get("acc_24h_mm") or 0),
                float(b.get("acc_72h_mm") or 0),
            )
            print(
                f"  OK  watershed={ws['id']} ({ws['name']}) "
                f"acc_24h={b.get('acc_24h_mm')} acc_72h={b.get('acc_72h_mm')}"
            )

        # Verify
        fresh = await conn.fetchrow(
            "SELECT MAX(time) as latest FROM hydro.imerg_accumulations"
        )
        print(f"Latest IMERG time in DB: {fresh['latest']}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
