# Build

`index.html` is generated. Do not edit it directly; edit the sources here and re-assemble.

## Sources
- `core.js` — leg construction, time zones, coverage lookups, solar position, scenery list
- `map.js` — dynamic projection and SVG basemap
- `ui.js` — timeline, coverage cards, sights, dining
- `agenda.js` — "now happening / up next"
- `app.js` — route picker, live position, Leaflet map
- `style.css`, `body.html` — page shell
- `assemble.sh` — concatenates the above plus `data.json` into `index.html`

## Data
`data.json` is built from three public sources, none of which are vendored here:

1. Amtrak GTFS — https://content.amtrak.com/content/gtfs/GTFS.zip
2. US state boundaries — https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json (US Census, public domain)
3. GeoNames cities5000 — https://download.geonames.org/export/dump/cities5000.zip (CC BY 4.0)

Download those into a working directory, then:

```bash
python3 build_pat.py    # GTFS -> routes_raw.json (118 itineraries, branches kept)
python3 build_geo.py    # boundaries + cities -> geo_raw.json
python3 build_all.py    # -> data.json (adds modelled coverage)
./assemble.sh           # -> index.html
```

`tune3.py` re-fits the coverage model against the hand-authored California Zephyr
arrays from the original version of this page. Its output is `cov_params.json`.
Current fit: 84% agreement at station-segment midpoints.
