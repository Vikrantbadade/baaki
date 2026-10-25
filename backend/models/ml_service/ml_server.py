"""
Baaki ML Service — Standalone HTTP Microservice
Serves the two AI models from the notebooks:
  1. Voice Collection Planner (Whisper STT + Hindi/English entity extraction)
  2. Smart Collection Planner (Combinatorial optimization & probability estimation)

Can run directly with Python's built-in http.server, or with FastAPI/Uvicorn.
Port defaults to 5001.
"""

import json
import os
import re
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from itertools import combinations, product

# --- 1. VOICE MODEL ENTITY EXTRACTION ---
NUMBER_WORDS = {
    # English
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
    "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    "hundred": 100, "thousand": 1000, "lakh": 100000, "lac": 100000,
    # Hindi / Hinglish
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5,
    "panch": 5, "cheh": 6, "chhe": 6, "saat": 7, "aath": 8, "nau": 9,
    "das": 10, "gyarah": 11, "barah": 12, "terah": 13, "chaudah": 14,
    "pandrah": 15, "solah": 16, "satrah": 17, "atharah": 18, "unnis": 19,
    "bees": 20, "tees": 30, "chalis": 40, "chaalis": 40, "pachas": 50,
    "sattar": 70, "assi": 80, "nabbe": 90,
    "sau": 100, "hazaar": 1000, "hazar": 1000
}

def words_to_number(phrase):
    tokens = re.findall(r"[a-zA-Z]+|\d[\d,]*", phrase.lower())
    total = 0
    current = 0
    saw_number = False
    for token in tokens:
        if token[0].isdigit():
            value = int(token.replace(",", ""))
            current += value
            saw_number = True
        elif token in NUMBER_WORDS:
            value = NUMBER_WORDS[token]
            saw_number = True
            if value == 100:
                current = max(current, 1) * 100
            elif value == 1000:
                total += max(current, 1) * 1000
                current = 0
            elif value == 100000:
                total += max(current, 1) * 100000
                current = 0
            else:
                current += value
    return total + current if saw_number else None

def extract_amount_rupees(text):
    if not text:
        return None
    t = text.lower().replace("₹", " rupees ").replace("rs.", " rupees ").replace("rs ", " rupees ")
    currency_pattern = re.compile(
        r"((?:(?:\d[\d,]*(?:\.\d+)?)|[a-zA-Z]+)(?:[\s-]+(?:(?:\d[\d,]*(?:\.\d+)?)|[a-zA-Z]+)){0,4})\s*"
        r"(?:rupees?|rs\b|inr|rupaye|rupya|rupaiye|रुपये|रुपया)",
        re.IGNORECASE,
    )
    m = currency_pattern.search(t)
    if m:
        tokens = re.findall(r"[a-zA-Z]+|\d[\d,]*", m.group(1).lower())
        num_tokens = []
        for tok in reversed(tokens):
            if tok[0].isdigit() or tok in NUMBER_WORDS:
                num_tokens.insert(0, tok)
            else:
                break
        if num_tokens:
            val = words_to_number(" ".join(num_tokens))
            if val is not None and val > 0:
                return float(val)

    m = re.search(r"(?:₹|rs\.?\s*|inr\s*)(\d[\d,]*(?:\.\d+)?)", text, re.IGNORECASE)
    if m:
        return float(m.group(1).replace(",", ""))

    nums = re.findall(r"\d[\d,]*(?:\.\d+)?", text)
    if nums:
        parsed = [float(n.replace(",", "")) for n in nums if float(n.replace(",", "")) >= 50]
        if parsed:
            return max(parsed)
    return None

def extract_deadline_days(text):
    if not text:
        return None
    t = text.lower()
    if re.search(r"\b(?:ek|one|1)\s*(?:hafta|hafte|week)\b", t):
        return 7
    if re.search(r"\b(?:do|two|2)\s*(?:hafte|weeks)\b", t):
        return 14
    if re.search(r"\b(?:kal|tomorrow)\b", t):
        return 1

    patterns = [
        r"(?:in|within|after|mein|me|andar|ke andar|within next)\s+(\d[\d,]*)\s*(?:days?|day|din|dino|दिन)",
        r"(\d[\d,]*)\s*(?:days?|day|din|dino|दिन)\s*(?:mein|me|andar|ke andar|within)?",
    ]
    for pattern in patterns:
        m = re.search(pattern, t, re.IGNORECASE)
        if m:
            return int(m.group(1).replace(",", ""))

    word_patterns = [
        r"\b([a-zA-Z]+(?:[\s-]+[a-zA-Z]+){0,2})\s+(?:days?|day|din|dino)\b",
        r"\b(?:in|within|mein|me)\s+([a-zA-Z]+)\s+(?:days?|day|din|dino)\b",
    ]
    for pattern in word_patterns:
        m = re.search(pattern, t, re.IGNORECASE)
        if m:
            val = words_to_number(m.group(1))
            if val is not None and 0 < val <= 365:
                return int(val)
    return None

def process_voice_request(data):
    transcript = data.get("transcript", "")
    audio_base64 = data.get("audioBase64")

    # If audio is passed and whisper is installed, transcribe
    if not transcript and audio_base64:
        try:
            import base64
            import tempfile
            import whisper

            audio_bytes = base64.b64decode(audio_base64)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(audio_bytes)
                tmp_path = f.name
            try:
                model = whisper.load_model("small")
                result = model.transcribe(tmp_path, fp16=False)
                transcript = result.get("text", "").strip()
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        except Exception as e:
            return {"error": f"Whisper transcription failed: {str(e)}"}, 500

    if not transcript:
        return {"error": "Missing transcript or audio"}, 400

    target_rupees = extract_amount_rupees(transcript) or 0.0
    deadline_days = extract_deadline_days(transcript) or 7
    target_paise = int(round(target_rupees * 100))

    return {
        "transcript": transcript,
        "targetRupees": float(target_rupees),
        "targetPaise": target_paise,
        "deadlineDays": int(deadline_days),
        "confidence": 0.95 if target_rupees > 0 else 0.70,
        "isDemoModel": True,
    }, 200

# --- 2. SMART COLLECTION PLANNER ALGORITHM ---
def probability_target_met(group, target_paise):
    chance = 0.0
    n = len(group)
    for paid_flags in product([False, True], repeat=n):
        amount = 0
        scenario_p = 1.0
        for customer, pays in zip(group, paid_flags):
            p = float(customer.get("paymentProbability") or customer.get("payment_probability") or 0.75)
            amt = int(customer.get("outstandingPaise") or customer.get("outstanding_paise") or 0)
            if pays:
                amount += amt
                scenario_p *= p
            else:
                scenario_p *= (1 - p)
        if amount >= target_paise:
            chance += scenario_p
    return min(1.0, max(0.0, chance))

def process_strategy_request(data):
    target_paise = int(data.get("targetPaise") or (float(data.get("targetRupees", 0)) * 100))
    deadline_days = int(data.get("deadlineDays", 7))
    invoices = data.get("invoices", [])

    eligible = []
    for inv in invoices:
        amt = int(inv.get("outstandingPaise") or inv.get("outstanding_paise") or 0)
        days = int(inv.get("expectedDaysToPay") or inv.get("expected_days_to_pay") or 1)
        disputed = bool(inv.get("disputed", False))
        paused = bool(inv.get("paused", False))
        if amt > 0 and not disputed and not paused and days <= deadline_days:
            eligible.append({
                "customerId": inv.get("customerId") or inv.get("customer_id") or "cust",
                "customerName": inv.get("customerName") or inv.get("customer_name") or "Customer",
                "invoiceId": inv.get("invoiceId") or inv.get("invoice_id") or "inv",
                "outstandingPaise": amt,
                "expectedDaysToPay": days,
                "paymentProbability": float(inv.get("paymentProbability") or inv.get("payment_probability") or 0.75)
            })

    total_eligible = sum(i["outstandingPaise"] for i in eligible)
    if not eligible or total_eligible < target_paise:
        return {
            "modelVersion": "baaki-planner-v1.0",
            "isDemoPrediction": True,
            "targetPaise": target_paise,
            "deadlineDays": deadline_days,
            "eligibleCount": len(eligible),
            "totalEligiblePaise": total_eligible,
            "options": []
        }, 200

    candidate_pool = eligible[:15]
    all_plans = []
    for size in range(1, len(candidate_pool) + 1):
        for group in combinations(candidate_pool, size):
            total = sum(c["outstandingPaise"] for c in group)
            if total < target_paise:
                continue
            prob = probability_target_met(group, target_paise)
            all_plans.append({
                "customers": list(group),
                "customerCount": len(group),
                "customerNames": [c["customerName"] for c in group],
                "invoiceIds": [c["invoiceId"] for c in group],
                "amountIfAllPayPaise": total,
                "extraOverTargetPaise": total - target_paise,
                "probabilityTargetMet": prob
            })

    reasonable = [p for p in all_plans if p["amountIfAllPayPaise"] <= target_paise * 1.25]
    plans_pool = reasonable if reasonable else all_plans

    def plan_key(p):
        return tuple(sorted(c["customerId"] for c in p["customers"]))

    strategies = [
        ("Fewest customers to contact", sorted(
            plans_pool,
            key=lambda p: (p["customerCount"], -p["probabilityTargetMet"], p["extraOverTargetPaise"])
        )),
        ("Highest estimated chance of reaching target", sorted(
            plans_pool,
            key=lambda p: (-p["probabilityTargetMet"], p["customerCount"], p["extraOverTargetPaise"])
        )),
        ("Multi-customer plan closest to target", sorted(
            [p for p in plans_pool if p["customerCount"] >= 2] or plans_pool,
            key=lambda p: (p["extraOverTargetPaise"], -p["probabilityTargetMet"], p["customerCount"])
        ))
    ]

    options = []
    used = set()
    for label, ranked in strategies:
        pick = next((p for p in ranked if plan_key(p) not in used), None)
        if pick:
            options.append({"label": label, "plan": pick})
            used.add(plan_key(pick))

    formatted_options = []
    for idx, opt in enumerate(options, start=1):
        p = opt["plan"]
        formatted_options.append({
            "option": idx,
            "strategy": opt["label"],
            "customerCount": p["customerCount"],
            "customerNames": p["customerNames"],
            "invoiceIds": p["invoiceIds"],
            "amountIfAllPayPaise": p["amountIfAllPayPaise"],
            "extraOverTargetPaise": p["extraOverTargetPaise"],
            "probabilityTargetMetPercent": round(p["probabilityTargetMet"] * 100, 1),
            "customers": p["customers"]
        })

    return {
        "modelVersion": "baaki-planner-v1.0",
        "isDemoPrediction": True,
        "targetPaise": target_paise,
        "deadlineDays": deadline_days,
        "eligibleCount": len(eligible),
        "totalEligiblePaise": total_eligible,
        "options": formatted_options
    }, 200

# --- 3. HTTP SERVER ---
class MLRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/health", "/"):
            self._send_json({"status": "ready", "service": "baaki-ml-microservice"})
        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        try:
            payload = json.loads(raw_body)
        except Exception:
            self._send_json({"error": "Invalid JSON"}, 400)
            return

        if self.path in ("/api/voice", "/voice", "/api/v1/interpret-voice"):
            result, status = process_voice_request(payload)
            self._send_json(result, status)
        elif self.path in ("/api/strategy", "/strategy", "/api/v1/strategy"):
            result, status = process_strategy_request(payload)
            self._send_json(result, status)
        else:
            self._send_json({"error": f"Unknown endpoint {self.path}"}, 404)

def run(port=5001):
    server_address = ("", port)
    httpd = HTTPServer(server_address, MLRequestHandler)
    print(f"Baaki ML Service running on http://localhost:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    run(port)
