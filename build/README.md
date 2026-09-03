# Build

`index.html` is generated. Do not edit it directly; edit the sources here and re-assemble.

## Sources
- `core.js` — leg construction, time zones, coverage lookups, solar position, station names, scenery
- `map.js` — dynamic projection and SVG basemap
- `ui.js` — timeline, coverage cards, sights, dining
- `agenda.js` — "now happening / up next"
- `app.js` — station-first picker, live position, shareable URL, Leaflet map
- `style.css`, `body.html`, `head_extra.html` — page shell, favicon and link-preview metadata
- `assemble.sh` — concatenates the above plus `data.json` into `index.html`

## Data

`data.json` is built from three public sources, none of which are vendored here:

1. Amtrak GTFS — https://content.amtrak.com/content/gtfs/GTFS.zip
2. US state boundaries — https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json (US Census, public domain)
3. GeoNames cities5000 — https://download.geonames.org/export/dump/cities5000.zip (CC BY 4.0)

Download those into a working directory, then:

```bash
python3 build_pat.py    # GTFS -> routes_raw.json
python3 build_geo.py    # boundaries + cities -> geo_raw.json
python3 build_all.py    # -> data.json
./assemble.sh           # -> index.html
```

Two GTFS details the build depends on:

- **Times are in the agency timezone (Eastern), not local to each stop.** Elapsed
  time is the raw difference; only the displayed clock changes zone. Reading them
  as stop-local inflates a transcontinental trip by the zone shift and can produce
  negative durations on short eastbound hops.
- **Some shapes are stored running the opposite way down the line.** Snapping
  stations to the track stalls unless the shape is flipped first. Detected by
  comparing the first stop's distance to each end.

`build_pat.py` keeps one itinerary per terminal pair per direction, dropping
short-turn variants whose stops are a subset of a longer one, so real branches
(Empire Builder to Seattle vs Portland) survive but 761 Northeast Regional trips
collapse to 10.

## The coverage model

Coverage is estimated, not measured. For each sub-segment midpoint:

```
strength = (nearest-town reach + density floor) / terrain penalty
```

- **nearest-town reach** — `max over towns of A*(pop/5000)^B / distance`. A town of
  5,000 reaches about 11 km, a city of 5,000,000 about 90 km.
- **density floor** — `C * max(0, log10(sum of population within 75 km) - D)`, so
  farmland dotted with small towns does not score the same as true wilderness.
  Without this the model called rural Nebraska dead.
- **terrain penalty** — from how tightly the track curves, in degrees of heading
  change per km. Mountain segments run 59–92; plains run 2–12. This is what catches
  canyons and passes, where towns are close but signal is not.
- Three long tunnels (Moffat, Cascade, Flathead) are marked by hand, because a
  10 km bore is invisible at 25 km sub-segment resolution.

`tune3.py` re-fits the parameters against the hand-authored, rider-reported
California Zephyr arrays from the first version of this page, which are preserved
in git at `1be12e7:index.html`. Current fit: **84%** agreement at station-segment
midpoints, and **76%** when sub-segments are collapsed to one status per station
segment. Errors are nearly all one class apart.

### Spot checks on other routes

The fit is against one route, so the model was checked against places known to be
bad. Its longest dead runs land where they should:

| Route | Longest dead run found |
|---|---|
| Sunset Limited | Alpine → Del Rio, 2h 09m (the Sanderson stretch of West Texas) |
| Empire Builder | Williston → Havre, 2h 57m (the Montana Hi-Line) |
| Coast Starlight | Redding → Klamath Falls, 3h 46m (the Cascade crossing) |
| Southwest Chief | Trinidad → Raton, 1h 02m (Raton Pass) |

None of these are curated; they fall out of population, town density and track
sinuosity alone.

### What did not work

Adding highway proximity, from the US Census TIGER primary-roads shapefile
(interstates and US routes, 17k records), made no difference: the fit chose a
weight of zero for both interstate and other-primary terms. Railroads and highways
follow the same valleys, so along a rail line the distance to a major road barely
varies and carries almost no signal. Not worth the build dependency.
