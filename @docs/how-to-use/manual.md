# User manual

How to use Layer Explorer in the browser. Start the application first; see
[config.md](config.md).

## The screen

- **Map** (right/main area): a dark world map. Zoom with the `+`/`-` buttons,
  mouse wheel or pinch; drag to pan.
- **Layer panel**: lists every layer with a checkbox, a status line, and
  Remove/Delete controls, and any load error.
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

CSV requirements:

- A latitude column (`lat` or `latitude`) and a longitude column (`lon`, `lng`
  or `longitude`), in WGS84 degrees. Other columns are kept as point fields.
- Rows with missing or out-of-range coordinates are skipped and counted.

## Remove a layer

- Built-in layers: **Remove** hides them from the panel for this session.
- Imported layers: **Remove**, then confirm **Delete**. This permanently deletes
  the layer and its points. Cancel keeps it.

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
