# Smart Posture Monitor

IoT + AI project for real-time posture monitoring.

Smart Posture Monitor is a wearable system that uses an **MPU6050 accelerometer** and **ESP8266** to detect sitting posture without using a camera.

The system detects 4 posture conditions:

- STRAIGHT
- HUNCHED
- LEAN LEFT
- LEAN RIGHT

If an incorrect posture is maintained for more than **5 seconds**, the device activates a buzzer alert.

## System Architecture

    MPU6050
       ↓
    ESP8266
       ↓ Wi-Fi
    Vercel Next.js /api/predict proxy
       ↓
    Python FastAPI + Random Forest
       ↓
    Supabase posture_data
       ↓
    Vercel Dashboard

## Features

- Real-time posture detection
- Buzzer alert for prolonged bad posture
- Wireless sensor data transmission
- Supabase data storage
- Web dashboard
- Posture statistics
- MPU6050 sensor monitoring
- AI/ML classification planned for posture prediction

## Hardware

- ESP8266 NodeMCU
- MPU6050
- Buzzer

### Wiring

**MPU6050 → ESP8266**

- VCC → 3V3
- GND → GND
- SDA → D2
- SCL → D1

**Buzzer → ESP8266**

- Signal → D5
- GND → GND

## Technology Stack

### IoT

- ESP8266
- MPU6050
- Wi-Fi
- Arduino IDE

### Backend

- Next.js 16
- TypeScript
- Supabase
- PostgreSQL

### Frontend

- Next.js
- React
- Tailwind CSS

### AI

- Python FastAPI service loads the trained Random Forest from `posture_model.joblib`
- Feature order matches training: `ax`, `ay`, `az`

## Posture Detection

The current prototype uses sensor thresholds:

    AY < -0.06  → LEAN LEFT
    AY >  0.06  → LEAN RIGHT
    AZ <  0.24  → HUNCHED
    Otherwise   → STRAIGHT

Bad posture is considered prolonged after **5 seconds**.

## Deploying the prediction service

The Vercel route is a proxy. It does not start Python and does not write to
Supabase. The FastAPI service in `python_api/main.py` performs inference and
inserts exactly one row into the existing `posture_data` table. The insert
uses the existing columns `posture`, `confidence`, `ax`, `ay`, `az`, and
`bad_duration_ms`; Supabase supplies `id` and `created_at`. The current
confidence migration is `database/migrations/20261001_add_posture_confidence.sql`.

The checked-in `posture_model.joblib` is the trained model artifact. Deploy
from the repository root so Render's `MODEL_PATH=posture_model.joblib` resolves
to that file. `render.yaml` installs `python_api/requirements.txt`, starts
Uvicorn, and sets `/health` as the health check. A compatible Python host can
use the same build/start commands:

```sh
pip install -r python_api/requirements.txt
uvicorn python_api.main:app --host 0.0.0.0 --port "$PORT"
```

Configure these variables in the Python host's environment/secrets settings:

- `SUPABASE_URL`: the existing Supabase project URL.
- `SUPABASE_SECRET_KEY`: a server-side Supabase secret/service-role key. Never
  use an anon key for this server write path or expose this value to a client.
- `MODEL_PATH`: path to the trained `.joblib` file; default deployment path is
  `posture_model.joblib` from the repository root.

In Vercel, set `PYTHON_API_URL` to the Python service's base URL, for example
`https://your-python-service.example.com` (placeholder only; replace it with
the URL assigned by the hosting provider). Do not add `/api/predict` to this
variable. `.env.example` documents the variable names and contains no secrets.

Apply the existing confidence migration in Supabase if it has not already been
applied. No other schema change is required. The proxy forwards the request and
upstream status; it never performs a database insert. It returns 502/503/504
when the service is unreachable, unconfigured, or times out.

## Deploying the ESP8266 API

The device sends HTTPS requests to the deployed API. Keep `ESP8266/secrets.h`
local and set these values there (the Wi-Fi values remain private):

```cpp
#define WIFI_SSID_VALUE "your Wi-Fi name"
#define WIFI_PASSWORD_VALUE "your Wi-Fi password"
#define VERCEL_API_URL_VALUE "https://smart-posture-monitor.vercel.app/api/predict"
```

The firmware continues posting HTTPS JSON to the existing Vercel endpoint;
the proxy then forwards the unchanged body to Python. No sensor, posture
classification, timer, or endpoint changes are required. Keep
`ESP8266/secrets.h` local and set `VERCEL_API_URL_VALUE` to the deployed
Vercel `/api/predict` URL as shown above.

## Verification plan

Use real credentials and a test sample only in a safe environment. These
commands do not claim a successful deployment or database write:

1. Check service liveness: `curl -i https://<python-host>/health` should return
   HTTP 200 and `{"status":"ok"}`.
2. Send a test request directly to Python:

   ```sh
   curl -i -X POST https://<python-host>/api/predict \
     -H 'Content-Type: application/json' \
     -d '{"sensor_posture":"LEAN RIGHT","ax":-0.318,"ay":0.111,"az":0.987,"bad_duration_ms":7600}'
   ```

   A successful request returns HTTP 200 with model-generated `posture` and
   `confidence`, and should create one `posture_data` row. Check the row in
   Supabase, including generated `created_at` and supplied axes.
3. Confirm inference uses the loaded model and its probability output (there is
   no fixed prediction value in the service).
4. Send the same JSON to `https://smart-posture-monitor.vercel.app/api/predict`
   after setting Vercel's `PYTHON_API_URL`; verify the proxy status/body match
   the Python response and that only one row was inserted.
5. Observe the ESP8266 serial output while it sends actual MPU6050 readings to
   the configured Vercel URL; confirm a successful HTTP response.
6. Confirm that row appears in `/api/posture/latest` and the dashboard history.

If inference or database saving fails, Python returns a non-2xx response and
the Vercel proxy preserves that status; transport failures return 502 or 504.
