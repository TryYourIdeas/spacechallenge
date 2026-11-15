# User manual

How to use Layer Explorer in the browser. Start the application first; see
[config.md](config.md).

## The screen

- **Map** (right/main area): a dark world map. Zoom with the `+`/`-` buttons,
  mouse wheel or pinch; drag to pan.
- **Layer panel**: lists every layer with a checkbox, a status line, and
  Remove/Delete controls, plus the **Import CSV…** button and import tasks.
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
  lists them so you can pick one.
- The map refreshes automatically after you pan or zoom. If the refresh fails,
  use **Retry** on the map.

## Import a CSV file

1. Put the CSV in the server's data directory (`data/` by default).
2. Click **Import CSV…** and choose a file from the list.
3. Watch the task: queued, processing (rows read, then points imported), done
   or failed. Progress updates live; if the live connection drops, a hint says
   so.
4. When done, the new layer appears in the panel and on the map. Imported layers
   are stored in the database and are still there after a page reload.

CSV requirements:

- A latitude column (`lat` or `latitude`) and a longitude column (`lon`, `lng`
  or `longitude`), in WGS84 degrees. Other columns are kept as point fields.
- Rows with missing or out-of-range coordinates are skipped and counted.
- Importing a file that is already importing is refused.

Failed imports can be retried by choosing the file again. File problems are not
retried automatically; other errors are retried up to 3 times.

## Remove a layer

- Built-in layers: **Remove** hides them from the panel for this session.
- Imported layers: **Remove**, then confirm **Delete**. This permanently deletes
  the layer and its points. Cancel keeps it.

## Keyboard and accessibility

- All controls and map markers are keyboard focusable; Enter activates them.
- Progress and results are announced to screen readers.
- State is never colour-only: text accompanies every status.
- Animations respect the reduced-motion setting.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Only the three built-in layers appear, no Import button works | API disabled: `DATABASE_URL`/`QUEUE_URL` missing, or the backend is not running |
| "No CSV files found" | Put `*.csv` files in `DATA_DIR` (default `data/`) |
| Import stays queued | The `worker` service is not running: `./backend/docker/compose.sh ps` |
| Browser CORS errors on a separate front end | Add its origin to `CORS_ORIGINS` |
| Import failed | Read the message on the task; check the file has latitude and longitude columns |
