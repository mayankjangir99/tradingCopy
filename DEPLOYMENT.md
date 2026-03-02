# Deployment

To keep the site working when your PC is off, host both parts online:

- Frontend: publish the `docs/` folder with GitHub Pages or another static host.
- Backend: deploy `backend/` to a Node host such as Render or Railway.

This repo now includes:

- `render.yaml`
- `.github/workflows/deploy-pages.yml`

Use `render.yaml` as the starting point for the backend service and the GitHub Actions workflow for `docs/`.

## Backend

The backend now supports cloud-safe storage paths:

- `DATA_DIR`: base folder for persisted files
- `DB_FILE_PATH`: optional exact path for the JSON database
- `REGISTER_EXPORT_FILE_PATH`: optional exact path for the CSV export
- `ALLOWED_ORIGINS`: comma-separated list of frontend origins allowed by CORS

Example for a persistent disk mount:

```env
DATA_DIR=/var/data/tradingcopy
ALLOWED_ORIGINS=https://yourname.github.io
AUTH_SECRET=replace-with-a-long-random-secret
```

If your hosting provider supports persistent disks, point `DATA_DIR` to that mount path.

## Frontend

The frontend uses the backend URL from this order:

1. `window.TRADEPRO_CONFIG.API_BASE`
2. `<meta name="tradepro-api-base" content="https://your-api.example">`
3. Default fallback in code

If you want to change the API without editing JavaScript, add this tag inside each HTML page's `<head>`:

```html
<meta name="tradepro-api-base" content="https://your-api.example">
```

## Minimum checklist

1. Deploy `backend/` with the variables from `backend/.env.example`.
2. Configure a persistent disk path for `DATA_DIR`.
3. Publish `docs/` as the frontend.
4. Set `ALLOWED_ORIGINS` to your frontend domain.
5. If needed, add the `tradepro-api-base` meta tag to the frontend pages.
