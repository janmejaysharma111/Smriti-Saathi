# Smriti Saathi API

FastAPI service for role-based accounts, patient-approved care-team links, and memory-game scores. Each person has their own account and signs in on their own phone.

## Start locally

From this directory, create and activate a virtual environment, install the package, then start the API:

```sh
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0
```

Open http://127.0.0.1:8000/docs for the interactive API docs on the development computer. For Expo Go on a separate phone, point the app at the computer's LAN IP (for example `http://192.168.1.20:8000`) and keep both devices on the same network. SQLite data is stored in `smriti_saathi.db` by default. Set `DATABASE_URL` to use another SQLAlchemy-supported database, `JWT_SECRET` to a long, random secret, and `CORS_ORIGINS` to a comma-separated allowlist of web client origins before deployment. The built-in secret and CORS origins are for local development only. Native mobile clients do not use browser CORS checks.

## Main flow

1. Register one account per person at `POST /auth/register` with role `patient`, `caregiver`, or `observer`.
2. Sign in at `POST /auth/token`. Use the returned bearer token for authenticated requests.
3. A caregiver or observer requests access with `POST /relationships`, supplying the patient's email.
4. The patient reviews `GET /relationships/requests` and accepts or rejects each request. Only accepted relationships grant access.
5. Patients submit their own activity results to `POST /patients/{patient_id}/scores`. Their accepted caregivers and observers can read those results with `GET /patients/{patient_id}/scores`.

Each score supports an activity name, integer score, timestamp, and JSON details. List results are paginated and can be filtered by activity. `GET /relationships` lists a user's own care-team links.

The API does not yet include password reset, account verification, database migrations, or production deployment configuration. Role selection at sign-up is self-reported; verify observer identities before using this with real patient data. Configure HTTPS and a managed database with backups for deployment.
