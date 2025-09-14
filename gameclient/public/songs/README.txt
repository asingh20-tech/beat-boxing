# Songs folder

Place each song in its own subfolder here. Required files inside each song folder:

- chart.chart  // the .chart file
- song.ogg     // audio file (OGG recommended)
- optional: cover.png, metadata.txt

Example structure:

/songs
  /hello-world
    chart.chart
    song.ogg

Access paths used by the game:
- Chart URL: /songs/<songId>/chart.chart
- Audio URL: /songs/<songId>/song.ogg
