#!/usr/bin/env python
"""刷新中国期货全品种日线看板数据。

数据源：新浪期货 InnerFuturesNewService.getDailyKLine。
连续合约口径：品种代码 + 0，属于未复权直接拼接序列，换月跳点保留。
仅使用 Python 标准库。
"""
from __future__ import annotations

import csv
import json
import math
import re
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UNIVERSE_PATH = ROOT / "config" / "universe.csv"
OUTPUT_PATH = ROOT / "data" / "market.json"
MAX_BARS = 5200  # 大约20个交易年；短历史品种保留全部
MAX_WORKERS = 6
CST = timezone(timedelta(hours=8))
API = (
    "https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20R=/"
    "InnerFuturesNewService.getDailyKLine?symbol={}"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://finance.sina.com.cn/futures/",
}


def fnum(value):
    try:
        x = float(value)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def fetch_daily(symbol: str, attempts: int = 3):
    url = API.format(symbol)
    last_error = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as response:
                body = response.read().decode("utf-8", "ignore")
            match = re.search(r"=\s*\((\[.*\])\)", body, re.S)
            if not match:
                raise ValueError("JSONP载荷格式异常")
            raw = json.loads(match.group(1))
            rows = []
            for item in raw[-MAX_BARS:]:
                row = {
                    "d": str(item.get("d", "")),
                    "o": fnum(item.get("o")),
                    "h": fnum(item.get("h")),
                    "l": fnum(item.get("l")),
                    "c": fnum(item.get("c")),
                    "v": fnum(item.get("v")),
                    "p": fnum(item.get("p")),
                    "s": fnum(item.get("s")),
                }
                if not row["d"] or any(row[k] is None for k in ("o", "h", "l", "c")):
                    continue
                if row["h"] + 1e-12 < max(row["o"], row["c"]) or row["l"] - 1e-12 > min(row["o"], row["c"]):
                    continue
                rows.append(row)
            if not rows:
                raise ValueError("无有效日线")
            return rows, None
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            last_error = str(exc)
            if attempt + 1 < attempts:
                time.sleep(0.8 * (attempt + 1))
    return None, last_error or "未知错误"


def mean(values):
    values = [x for x in values if x is not None]
    return sum(values) / len(values) if values else None


def pct(a, b):
    return (a / b - 1.0) if a is not None and b not in (None, 0) else None


def logret(a, b):
    return math.log(a / b) if a and b and a > 0 and b > 0 else None


def wilder_atr(rows, period=14):
    if len(rows) < period + 1:
        return None
    trs = []
    for i in range(1, len(rows)):
        h, l, prev = rows[i]["h"], rows[i]["l"], rows[i - 1]["c"]
        trs.append(max(h - l, abs(h - prev), abs(l - prev)))
    if len(trs) < period:
        return None
    atr = sum(trs[:period]) / period
    for tr in trs[period:]:
        atr = ((period - 1) * atr + tr) / period
    return atr


def sign_eps(value, epsilon=0.001):
    if value is None or abs(value) <= epsilon:
        return 0
    return 1 if value > 0 else -1


def calculate_metrics(rows):
    closes = [r["c"] for r in rows]
    volumes = [r["v"] for r in rows]
    oi = [r["p"] for r in rows]
    n = len(rows)
    c = closes[-1]

    def back(k):
        return closes[-1 - k] if n > k else None

    returns = {str(k): logret(c, back(k)) for k in (1, 5, 20, 60, 120, 252)}
    ma5 = mean(closes[-5:]) if n >= 5 else None
    ma20 = mean(closes[-20:]) if n >= 20 else None
    ma60 = mean(closes[-60:]) if n >= 60 else None
    ma20_prev5 = mean(closes[-25:-5]) if n >= 25 else None
    slope20 = ((ma20 - ma20_prev5) / (5 * ma20_prev5)) if ma20 and ma20_prev5 else None

    votes = sum(sign_eps(returns[str(k)]) for k in (5, 20, 60))
    score_r = {3: 2, 2: 2, 1: 1, 0: 0, -1: -1, -2: -2, -3: -2}.get(votes, 0)

    score_m = 0
    if all(x is not None for x in (ma5, ma20, ma60, slope20)):
        if c > ma5 > ma20 > ma60 and slope20 > 0:
            score_m = 2
        elif c > ma20 > ma60 and slope20 > 0:
            score_m = 1
        elif c < ma5 < ma20 < ma60 and slope20 < 0:
            score_m = -2
        elif c < ma20 < ma60 and slope20 < 0:
            score_m = -1

    atr = wilder_atr(rows, 14)
    buffer = 0.1 * atr if atr else 0
    score_b = 0
    breakout = "区间内"
    if n >= 56:
        prev20, prev55 = closes[-21:-1], closes[-56:-1]
        hh20, ll20, hh55, ll55 = max(prev20), min(prev20), max(prev55), min(prev55)
        if c > hh55 + buffer:
            score_b, breakout = 2, "55日新高"
        elif c > hh20 + buffer:
            score_b, breakout = 1, "20日新高"
        elif c < ll55 - buffer:
            score_b, breakout = -2, "55日新低"
        elif c < ll20 - buffer:
            score_b, breakout = -1, "20日新低"

    score = score_r + score_m + score_b
    if score >= 5:
        trend = "强上行"
    elif score >= 2:
        trend = "上行"
    elif score <= -5:
        trend = "强下行"
    elif score <= -2:
        trend = "下行"
    else:
        trend = "震荡"

    prev20_vol = [x for x in volumes[-21:-1] if x is not None]
    vr = volumes[-1] / mean(prev20_vol) if volumes[-1] is not None and mean(prev20_vol) not in (None, 0) else None
    oi5 = pct(oi[-1], oi[-6]) if n >= 6 else None
    volume_confirm = vr is not None and vr >= 1.2
    oi_confirm = oi5 is not None and oi5 > 0.01
    q = int(volume_confirm) + int(oi_confirm)
    confirm = ("量仓双确认" if q == 2 else "部分确认" if q == 1 else "未确认")

    if atr and ma20:
        z_atr = (c - ma20) / atr
        natr = 100 * atr / c if c else None
    else:
        z_atr = natr = None
    if z_atr is None:
        risk = "样本不足"
    elif abs(z_atr) >= 3:
        risk = "极端偏离"
    elif abs(z_atr) >= 2:
        risk = "偏离较大"
    elif abs(z_atr) >= 1:
        risk = "趋势延伸"
    else:
        risk = "偏离正常"

    recent_rets = [abs(logret(closes[i], closes[i - 1]) or 0) for i in range(max(1, n - 120), n)]
    med = statistics.median(recent_rets) if recent_rets else 0
    jump_threshold = max(0.06, 4 * med)
    jump_dates = []
    for i in range(max(1, n - 60), n):
        r = abs(logret(closes[i], closes[i - 1]) or 0)
        if r > jump_threshold:
            jump_dates.append(rows[i]["d"])
    roll_sensitive = any(d >= rows[max(0, n - 5)]["d"] for d in jump_dates)

    conflict = False
    if score_r and score_m and (score_r > 0) != (score_m > 0):
        conflict = True
    if score_b and returns["20"] is not None and (score_b > 0) != (returns["20"] > 0):
        conflict = True
    if abs(score) >= 5 and oi5 is not None and oi5 < 0:
        conflict = True

    price_oi = "持仓信号不足"
    if returns["5"] is not None and oi5 is not None:
        if returns["5"] > 0 and oi5 > 0:
            price_oi = "价涨增仓"
        elif returns["5"] > 0 and oi5 <= 0:
            price_oi = "价涨减仓"
        elif returns["5"] < 0 and oi5 > 0:
            price_oi = "价跌增仓"
        elif returns["5"] < 0 and oi5 <= 0:
            price_oi = "价跌减仓"
        else:
            price_oi = "价格持平"

    return {
        "latest_date": rows[-1]["d"],
        "latest": c,
        "returns": returns,
        "ma5": ma5,
        "ma20": ma20,
        "ma60": ma60,
        "slope20": slope20,
        "score_r": score_r,
        "score_m": score_m,
        "score_b": score_b,
        "score": score,
        "trend": trend,
        "breakout": breakout,
        "volume_ratio": vr,
        "oi_change_5": oi5,
        "confirmation": confirm,
        "price_oi": price_oi,
        "atr14": atr,
        "natr14": natr,
        "z_atr": z_atr,
        "risk": risk,
        "conflict": conflict,
        "roll_sensitive": roll_sensitive,
        "jump_dates_60d": jump_dates,
        "observations": n,
    }


def compact_series(rows):
    return {key: [r[key] for r in rows] for key in ("d", "o", "h", "l", "c", "v", "p", "s")}


def load_previous():
    if not OUTPUT_PATH.exists():
        return {"series": {}, "universe": []}
    try:
        return json.loads(OUTPUT_PATH.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"series": {}, "universe": []}


def main():
    with UNIVERSE_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        universe = list(csv.DictReader(handle))
    previous = load_previous()
    previous_series = previous.get("series", {})
    previous_items = {item.get("symbol"): item for item in previous.get("universe", [])}

    fetched = {}
    errors = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_daily, row["symbol"] + "0"): row for row in universe}
        for future in as_completed(futures):
            row = futures[future]
            symbol = row["symbol"]
            try:
                rows, error = future.result()
            except Exception as exc:  # 最后一层隔离，避免单品种拖垮全量刷新
                rows, error = None, str(exc)
            if rows:
                fetched[symbol] = rows
            else:
                errors.append({"symbol": symbol, "error": error})

    all_latest_dates = [rows[-1]["d"] for rows in fetched.values()]
    market_date = max(all_latest_dates) if all_latest_dates else None
    output_items = []
    output_series = {}

    for row in universe:
        symbol = row["symbol"]
        rows = fetched.get(symbol)
        source_state = "live"
        if rows is None and symbol in previous_series:
            cached = previous_series[symbol]
            keys = ("d", "o", "h", "l", "c", "v", "p", "s")
            rows = [dict(zip(keys, values)) for values in zip(*(cached[k] for k in keys))]
            source_state = "cache"
        base = {
            "exchange": row["exchange"],
            "name": row["chinese_name"],
            "symbol": symbol,
            "continuous_symbol": symbol + "0",
            "sector": row["sector_suggestion"],
            "status": row["status_flag"],
            "official_url": row["authoritative_url"],
            "source_state": source_state,
        }
        if rows:
            metrics = calculate_metrics(rows)
            if market_date:
                metrics["stale"] = metrics["latest_date"] < market_date
            base.update(metrics)
            output_series[symbol] = compact_series(rows)
        else:
            old = previous_items.get(symbol, {})
            base.update({
                "latest_date": old.get("latest_date"),
                "latest": old.get("latest"),
                "trend": "无数据",
                "score": None,
                "stale": True,
                "observations": 0,
            })
            base["source_state"] = "missing"
        output_items.append(base)

    trend_counts = {}
    for item in output_items:
        trend_counts[item.get("trend", "无数据")] = trend_counts.get(item.get("trend", "无数据"), 0) + 1

    payload = {
        "meta": {
            "generated_at": datetime.now(CST).isoformat(timespec="seconds"),
            "market_date": market_date,
            "source": "新浪期货日K",
            "source_url": "https://finance.sina.com.cn/futures/",
            "continuous_contract": "品种代码+0，未复权直接拼接，保留换月跳点",
            "frequency": "日度",
            "universe_count": len(universe),
            "series_count": len(output_series),
            "live_count": sum(1 for x in output_items if x["source_state"] == "live"),
            "cache_count": sum(1 for x in output_items if x["source_state"] == "cache"),
            "missing_count": sum(1 for x in output_items if x["source_state"] == "missing"),
            "trend_counts": trend_counts,
            "errors": errors,
        },
        "universe": output_items,
        "series": output_series,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = OUTPUT_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), "utf-8")
    tmp_path.replace(OUTPUT_PATH)
    print(json.dumps(payload["meta"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
