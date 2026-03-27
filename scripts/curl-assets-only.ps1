$urls = Get-Content "stitch-export/urls/stitch-screen-urls.json" | ConvertFrom-Json
$asset = $urls | Where-Object { $_.name -eq "accounts-cards-web-v1" }
curl.exe -L $asset.htmlUrl -o "stitch-export/code/accounts-cards-web-v1.html"
curl.exe -L $asset.imageUrl -o "stitch-export/images/accounts-cards-web-v1.png"
