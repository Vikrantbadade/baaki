# Baaki AI Models & Backend Integration Guide

This directory contains the AI/ML models designed for Baaki and their full integration with the Express/Supabase backend.

---

## 1. The Two AI Models

### Model 1: Voice Collection Planner (`voice model/`)
* **Notebook**: [`Baaki_Voice_Collection_Planner_Whisper (1).ipynb`](file:///d:/projects/New%20folder/backend/models/voice%20model/Baaki_Voice_Collection_Planner_Whisper%20(1).ipynb)
* **Purpose**: Allows small business owners to speak natural voice commands in **English, Hindi, or Hinglish** (e.g., *"Mere ko 5 din mein 10000 rupaye chahiye"* or *"Collect ₹25,000 within one week"*).
* **Components**:
  1. **Automatic Speech Recognition (ASR)**: Uses OpenAI Whisper (`small` or `base`) to transcribe audio to text.
  2. **Entity Extraction (NLP)**:
     - `extract_amount_rupees`: Converts numbers and number words in English, Hindi, and Hinglish (e.g., *das hazaar*, *bees*, *paanch sau*, *10,000*) into an integer rupee target.
     - `extract_deadline_days`: Detects deadline phrases (*in 5 days*, *do din me*, *within a week*, *ek hafta*) and normalizes them into days.
* **Output**:
  ```json
  {
    "transcript": "Mere ko 5 din mein 10000 rupaye chahiye",
    "targetRupees": 10000,
    "targetPaise": 1000000,
    "deadlineDays": 5,
    "confidence": 0.95,
    "isDemoModel": true
  }
  ```

---

### Model 2: Smart Collection Planner (`scheduler/`)
* **Notebook**: [`Baaki_Smart_Collection_Planner_Interactive (2).ipynb`](file:///d:/projects/New%20folder/backend/models/scheduler/Baaki_Smart_Collection_Planner_Interactive%20(2).ipynb)
* **Dataset**: `Baaki_large_synthetic_invoice_dataset.csv`
* **Purpose**: Generates optimal collection plan options to reach the target amount before the deadline using live outstanding invoices.
* **Algorithm**:
  1. **Eligibility Filtering**:
     - `outstanding_paise > 0`
     - `not disputed`
     - `not paused`
     - `expected_days_to_pay <= deadline_days`
  2. **Combinatorial Optimization**:
     - Evaluates customer/invoice combinations whose combined outstanding balance covers or exceeds the target.
     - Calculates `probability_target_met` across all independent payment scenarios using binomial / Poisson-binomial distribution.
     - Prunes excessive overshoots (> 25% over target).
  3. **3 Recommendation Strategies**:
     - **Strategy 1 — Fewest customers to contact**: Minimizes customer outreach count.
     - **Strategy 2 — Highest estimated chance of reaching target**: Maximizes probability of meeting the target.
     - **Strategy 3 — Multi-customer plan closest to target**: Spreads collection across multiple customers (>= 2) closest to target.
  4. **Approval Lifecycle**:
     - Owner reviews options and saves one as `proposed`.
     - Owner can `approve`, `reject`, `cancel`, or `execute` the plan (triggering n8n reminders).

---

## 2. Backend Integration Architecture

The backend provides a **dual integration**:
1. **Built-in Native Node.js Engine**: Works out-of-the-box without requiring an external Python process!
2. **External ML Microservice Adapter**: Can seamlessly connect to a remote Python/Whisper microservice when `ML_VOICE_SERVICE_URL` or `ML_STRATEGY_SERVICE_URL` is set in `.env`.

### Source Files:
- [src/services/voiceInterpretation.service.js](file:///d:/projects/New%20folder/backend/src/services/voiceInterpretation.service.js): Native Hindi/English NLP entity extraction.
- [src/services/collectionPlanner.service.js](file:///d:/projects/New%20folder/backend/src/services/collectionPlanner.service.js): Combinatorial collection planner and approval workflow.
- [src/integrations/ml/modelService.client.js](file:///d:/projects/New%20folder/backend/src/integrations/ml/modelService.client.js): Validated HTTP client for remote ML providers.
- [src/repositories/collectionPlans.repository.js](file:///d:/projects/New%20folder/backend/src/repositories/collectionPlans.repository.js): Supabase persistence for `collection_plans`, `collection_plan_items`, and `reminders`.
- [src/schemas/api.schemas.js](file:///d:/projects/New%20folder/backend/src/schemas/api.schemas.js): Zod validation schemas.
- [src/controllers/collectionPlans.controller.js](file:///d:/projects/New%20folder/backend/src/controllers/collectionPlans.controller.js): Route handlers.
- [src/routes/collectionPlans.routes.js](file:///d:/projects/New%20folder/backend/src/routes/collectionPlans.routes.js): Section 5.6 API routes.
- [src/docs/openapi.js](file:///d:/projects/New%20folder/backend/src/docs/openapi.js): OpenAPI documentation.

---

## 3. API Endpoints (Section 5.6)

All routes are mounted under `/api/v1/collection-plans` and protected by Supabase JWT auth:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/collection-plans/interpret-voice` | Converts voice transcript or audio into target and deadline JSON |
| `POST` | `/api/v1/collection-plans/preview` | Generates the 3 strategy recommendations from live unpaid invoices |
| `POST` | `/api/v1/collection-plans` | Saves the selected collection plan (`status: proposed`) |
| `GET` | `/api/v1/collection-plans` | Lists collection plans with status filter and pagination |
| `GET` | `/api/v1/collection-plans/:planId` | Gets full plan details with candidate invoices and items |
| `POST` | `/api/v1/collection-plans/:planId/approve` | Records owner approval (`status: approved`) |
| `POST` | `/api/v1/collection-plans/:planId/reject` | Records owner rejection with reason (`status: rejected`) |
| `POST` | `/api/v1/collection-plans/:planId/cancel` | Cancels an eligible plan (`status: cancelled`) |
| `POST` | `/api/v1/collection-plans/:planId/execute` | Executes approved plan; inserts pending reminders |

---

## 4. Running the Standalone Python Microservice (Optional)

If you wish to run the Whisper model with Python GPU acceleration:
```bash
# Start the Python ML server
python models/ml_service/ml_server.py
```
Then configure your backend `.env`:
```env
ML_VOICE_SERVICE_URL=http://localhost:5001/api/voice
ML_STRATEGY_SERVICE_URL=http://localhost:5001/api/strategy
```
