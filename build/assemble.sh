#!/bin/zsh
S=/private/tmp/claude-501/-Users-jtan-Workspace-amtrak/23869394-ea4b-478a-a486-cf86f5c41af5/scratchpad
python3 - <<'PY'
import io
S="/private/tmp/claude-501/-Users-jtan-Workspace-amtrak/23869394-ea4b-478a-a486-cf86f5c41af5/scratchpad"
rd=lambda p: io.open(p,encoding="utf-8").read()
out="".join(['<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Amtrak signal map</title>\n'+rd(S+"/src/head_extra.html"),
 rd(S+"/src/style.css"),
 '\n<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">\n<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>\n</head>\n<body>\n',
 rd(S+"/src/body.html"),
 "\n<script>\nconst DATA=", rd(S+"/data.json"), ";\n",
 rd(S+"/src/core.js"),"\n",rd(S+"/src/map.js"),"\n",rd(S+"/src/ui.js"),"\n",
 rd(S+"/src/agenda.js"),"\n",rd(S+"/src/app.js"),
 "\n</script>\n</body>\n</html>\n"])
io.open("/Users/jtan/Workspace/amtrak/index.html","w",encoding="utf-8").write(out)
print("index.html: %.0f KB"%(len(out.encode())/1024))
PY
