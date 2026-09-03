#!/bin/sh
# Assemble index.html from the sources beside this script plus a data.json.
#
#   build/assemble.sh [path/to/data.json]
#
# With no argument it looks for data.json in the current directory, then next
# to this script. Writes index.html at the repository root.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/.." && pwd)

DATA=${1:-}
[ -n "$DATA" ] || { [ -f "./data.json" ] && DATA="./data.json"; }
[ -n "$DATA" ] || { [ -f "$DIR/data.json" ] && DATA="$DIR/data.json"; }
if [ -z "$DATA" ] || [ ! -f "$DATA" ]; then
  echo "assemble.sh: no data.json found. Build it first (see build/README.md)," >&2
  echo "             or pass its path: build/assemble.sh path/to/data.json" >&2
  exit 1
fi

python3 - "$DIR" "$DATA" "$ROOT/index.html" <<'PY'
import io,sys
src,data,out=sys.argv[1],sys.argv[2],sys.argv[3]
rd=lambda name: io.open(src+"/"+name,encoding="utf-8").read()
html="".join([
 '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n'
 '<meta charset="UTF-8">\n'
 '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
 '<title>Amtrak signal map</title>\n',
 rd("head_extra.html"),
 rd("style.css"),
 '\n<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">\n'
 '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>\n'
 '</head>\n<body>\n',
 rd("body.html"),
 "\n<script>\nconst DATA=", io.open(data,encoding="utf-8").read(), ";\n",
 rd("core.js"),"\n",rd("map.js"),"\n",rd("ui.js"),"\n",rd("agenda.js"),"\n",rd("app.js"),
 "\n</script>\n</body>\n</html>\n"])
io.open(out,"w",encoding="utf-8").write(html)
print("index.html: %.0f KB" % (len(html.encode())/1024))
PY
