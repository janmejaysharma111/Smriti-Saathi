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

Open http://127.0.0.1:8000/docs for the interactive API docs on the development computer. The Expo frontend reads the host used by the development server and calls port 8000 on that same computer, so leave its API address unset for local development. On a physical phone, open Expo Go and the API computer on the same Wi-Fi network. Allow inbound TCP port 8000 through the computer firewall if prompted. SQLite data is stored in `smriti_saathi.db` by default. Set `DATABASE_URL` to use another SQLAlchemy-supported database and `JWT_SECRET` to a long, random secret before deployment. For a deployed app, set `expo.extra.apiBaseUrl` in `frontend/app.json` to the HTTPS API URL. For a deployed web client, set `CORS_ORIGINS` to a comma-separated exact allowlist; without it, the API allows localhost and private-LAN HTTP origins for development. Native mobile clients do not use browser CORS checks.

## Main flow

1. Register one account per person at `POST /auth/register` with role `patient`, `caregiver`, or `observer`.
2. Sign in at `POST /auth/token`. Use the returned bearer token for authenticated requests.
3. A caregiver or observer requests access with `POST /relationships`, supplying the patient's email.
4. The patient reviews `GET /relationships/requests` and accepts or rejects each request. Only accepted relationships grant access.
5. A caregiver or observer creates patient quiz questions with `POST /patients/{patient_id}/memories`; the patient and accepted team members can read them with `GET /patients/{patient_id}/memories`.
6. Patients submit their own activity results to `POST /patients/{patient_id}/scores`. Their accepted caregivers and observers can read those results with `GET /patients/{patient_id}/scores`.

The frontend sign-in screen creates or authenticates accounts with these endpoints. The **Care team** screen lets caregivers and observers request a patient connection, lets patients approve or decline requests, and shows scores only after a connection is active. Caregivers create quiz questions for an accepted patient and the patient's phone loads those questions from the API. Completing the family memory quiz or pattern recognition game uploads its score for the signed-in patient. Reminders and reminder responses remain on the device for now.

Each score supports an activity name, integer score, timestamp, and JSON details. List results are paginated and can be filtered by activity. `GET /relationships` lists a user's own care-team links.

The API does not yet include password reset, account verification, database migrations, or production deployment configuration. Role selection at sign-up is self-reported; verify observer identities before using this with real patient data. Configure HTTPS and a managed database with backups for deployment.
