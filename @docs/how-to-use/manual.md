# User manual

How to use Layer Explorer in the browser. Start the application first; see
[config.md](config.md).

## The screen

- **Map** (right/main area): a dark world map. Zoom with the `+`/`-` buttons,
  mouse wheel or pinch; drag to pan.
- **Layer panel**: lists every layer with a checkbox, a status line, and
  and any load error.
- **Point details**: shows the fields of the selected point.

## Show and hide layers

Three built-in layers ship with the app: launch sites, ground stations and
meteorite finds. Each has its own colour and marker shape (triangle, square,
diamond). Tick or untick a layer's checkbox to show or hide it. The status
shows the point count, and how many rows were skipped for invalid coordinates.
While a layer loads you see "Loading…"; a failed layer shows an error with a
**Retry** button.

## Inspect a point

Click (or focus and press Enter on) a marker. The **Point details** panel shows
its fields, latitude and longitude. For imported layers, every CSV column is
loaded on demand. **Clear selection** closes it.

## Clusters

Imported layers can hold very large numbers of points, so the map groups nearby
points into numbered clusters.

- Click a cluster, or focus it and press Enter, to zoom into it.
- If its points share coordinates and zooming cannot separate them, a popup
  lists them so you can pick one. The dark popup shows the count and layer,
  and each entry shows the point name (wrapped to two lines, full text on hover)
  with its id below and the layer colour on its edge. The list scrolls
  vertically only; the first entry is focused, and Esc or the close button
  dismisses the popup.
- The map refreshes automatically after you pan or zoom. If the refresh fails,
  use **Retry** on the map.

## Add a CSV layer

Importing is done on your machine, not in the browser:

```sh
scripts/import_csv.sh path/to/file.csv
```

Then reload the page: the new layer appears in the panel and on the map and
stays after later reloads. See [config.md](config.md#importing-data) for
details. Importing the same file name again replaces that layer.

Have GeoJSON instead? Convert it first with `scripts/geojson_to_csv.sh file.geojson`
(see [config.md](config.md#converting-geojson-to-csv)).

CSV requirements:

- A latitude column (`lat` or `latitude`) and a longitude column (`lon`, `lng`
  or `longitude`), in WGS84 degrees. Other columns are kept as point fields.
- Rows with missing or out-of-range coordinates are skipped and counted.

## Remove a layer

The app is read-only, so it has no remove button. Untick a layer to hide it. To
delete an imported layer for good, remove it in the database
(`DELETE FROM layers WHERE label = '<name>'`; its points go with it), or import a
corrected file of the same name to replace it.

## Deploy to Vercel

The app is hosted at <https://spacechallenge-gamma.vercel.app/>. The Vercel
project is connected to the GitHub repository `TryYourIdeas/spacechallenge`, so
a push to `main` builds and publishes a new production deployment (other
branches get preview URLs). No CLI login is needed for this flow.

Project settings (Vercel dashboard, Project Settings):

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Build command | `npm run build:server` (from `frontend/vercel.json`) |
| Install command | `npm ci` (from `frontend/vercel.json`) |
| Environment variable `DATABASE_URL` | The PostgreSQL connection string, in Production and Preview |
| `NUXT_PUBLIC_API_BASE` | Leave empty (same origin) |

To publish a change:

1. Commit and push to `main`: `git push origin main`.
2. In the Vercel dashboard, open **Deployments** and wait for the new
   production deployment to reach **Ready**; read its build log if it fails.
3. Check the result:

   ```sh
   curl -s https://spacechallenge-gamma.vercel.app/readyz    # {"status":"ready"}
   curl -s https://spacechallenge-gamma.vercel.app/api/layers # JSON list of layers
   ```

   Both should return JSON, not the HTML page. HTML means the deployment is an
   old or static build without the server routes.

Vercel only presents data. Migrations and CSV imports run from your machine
(see [Add a CSV layer](#add-a-csv-layer) and
[config.md](config.md#deploying-the-nuxt-app-to-vercel)); the database must
accept connections from Vercel's IP addresses. The site has no login, so enable
Deployment Protection if the data is private.

## Keyboard and accessibility

- All controls and map markers are keyboard focusable; Enter activates them.
- State is never colour-only: text accompanies every status.
- Animations respect the reduced-motion setting.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Only the three built-in layers appear | API disabled: `DATABASE_URL` missing, or the backend is not running |
| Browser CORS errors on a separate front end | Add its origin to `CORS_ORIGINS` |
| `scripts/import_csv.sh` fails | Read its message; check the file has latitude and longitude columns and `DATABASE_URL` is reachable |
| Imported layer missing | Reload the page; confirm the script printed `Imported N rows` |
| Vercel site shows the page but `/readyz` or `/api/layers` return HTML or 404 | The live deployment is stale or static: check the latest deployment in Vercel and its build log |
