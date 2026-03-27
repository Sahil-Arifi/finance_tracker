$urls = Get-Content "stitch-export/urls/stitch-screen-urls.json" | ConvertFrom-Json
foreach ($item in $urls) {
  curl.exe -L $item.htmlUrl -o ("stitch-export/code/" + $item.name + ".html")
  curl.exe -L $item.imageUrl -o ("stitch-export/images/" + $item.name + ".png")
}
