# TempoTuner leaderboard API

Azure Functions (Node 24, v4 programming model) + Azure Table Storage. Scores
are recomputed server-side from raw tap intervals using the exact same code the
app runs (`shared/scoring.ts`), so client and server can't drift.

## Endpoints

- `GET /api/daily?day=YYYY-MM-DD` — today's challenge: title and artist only.
  The BPM (the answer) never leaves the server before a run is scored, and only
  the current day (±1 for timezones) is served so the rotation can't be scraped.
  The full song list lives in `src/lib/songs.ts` — server-side only, on purpose.
- `POST /api/score` — `{ uuid, nickname?, day, bpms[16] }`. Rescores the raw
  intervals and returns score + actual BPM + today's rank. With a nickname the
  run goes on the leaderboard (first submission per uuid+day wins; later ones
  return the recorded result). Without one it's scored but not stored. Rejects
  machine-perfect runs and stale/future days.
- `GET /api/leaderboard?day=YYYY-MM-DD&uuid=...` — top 20 for the day + top 20
  all-time (by total points) + your ranks.
- `keepwarm` timer — pings itself every 5 min so the consumption plan stays warm.

## Data model (one table: `leaderboard`)

| PartitionKey | RowKey | contents |
| --- | --- | --- |
| `2026-07-24` (day key) | uuid | nickname, score, guess, octave, wobble |
| `player` | uuid | nickname, totalScore, games, bestScore, lastDay |

Storage uses the function app's own `AzureWebJobsStorage` account — nothing to configure.

## One-time Azure setup

```bash
az group create -n tempotuner-rg -l westeurope

# storage account name must be globally unique, lowercase, ≤24 chars
az storage account create -n tempotunerstorage -g tempotuner-rg -l westeurope --sku Standard_LRS

az functionapp create -n tempotuner-api -g tempotuner-rg \
  --consumption-plan-location westeurope \
  --runtime node --runtime-version 24 --functions-version 4 \
  --storage-account tempotunerstorage --os-type Linux

# CORS: only the app may call the API from a browser
az functionapp cors add -n tempotuner-api -g tempotuner-rg --allowed-origins https://tempotuner.app
```

If you pick different names, update `AZURE_FUNCTIONAPP_NAME` in
`.github/workflows/deploy-api.yml` (the app *name*) and `API_BASE` in
`src/lib/leaderboard.ts` (the app's full default *hostname* + `/api` — newer
apps get a unique hostname like `<name>-<hash>.<region>-01.azurewebsites.net`,
shown on the app's Overview page).

## GitHub OIDC (federated credential, no secrets)

> Actually used: the portal's Deployment Center set this up automatically
> (2026-07-23) — it created the identity + repo secrets (the
> `AZUREAPPSERVICE_*` names referenced in deploy-api.yml). One gotcha: GitHub
> presents ID-augmented OIDC subjects (`repo:owner@id/repo@id:ref:...`), so the
> federated credential's Subject in Entra must match that exact string — copy
> it from the AADSTS700213 error if login fails. The manual steps below are
> kept for reference/recreation.

```bash
# 1. App registration the workflow will log in as
az ad app create --display-name tempotuner-deploy
# note the appId (client id) it prints, then:
az ad sp create --id <appId>

# 2. Trust pushes to main of this repo
az ad app federated-credential create --id <appId> --parameters '{
  "name": "tempotuner-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:sgebb/TempoTuner:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 3. Let it deploy to (only) the function app
az role assignment create --assignee <appId> --role "Website Contributor" \
  --scope $(az functionapp show -n tempotuner-api -g tempotuner-rg --query id -o tsv)
```

Then add three GitHub repo secrets (Settings → Secrets and variables → Actions):

- `AZURE_CLIENT_ID` — the appId above
- `AZURE_TENANT_ID` — `az account show --query tenantId -o tsv`
- `AZURE_SUBSCRIPTION_ID` — `az account show --query id -o tsv`

Push to main (or run the workflow manually) and the API deploys.

## Local development

```bash
cd api
npm install
cp local.settings.sample.json local.settings.json
npm run build
func start   # needs Azure Functions Core Tools v4 + Azurite (or a real storage conn string)
```
