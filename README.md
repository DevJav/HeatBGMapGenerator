# HeatBGMapGenerator

HeatBGMapGenerator is a web-based tool for generating, editing, and exporting racing track maps, designed for use with the game "Heat: Pedal to the Metal".

**Use it online:** https://devjav.github.io/HeatBGMapGenerator/

## Features

- **SVG Track Import**: Load an SVG whose first path is the track's centerline.
- **Interactive Editing**: Pan, zoom, move segment lines, mark curves with speed limits, and add kerbs or white lines.
- **Visual Customization**: Adjust segment numbers, speed limits, track width, colors, and more.
- **Export Options**: Export the whole track as SVG, or as PNG at a chosen width, regardless of the current zoom.
- **Session Management**: Your work is kept in the browser and restored on your next visit.
- **Track Data Management**: Save and load track data in JSON format for further editing or sharing.

## Project Structure

- `index.html` — Main web interface for the track generator.
- `src/track-generator.js` — Core JavaScript logic for track editing and generation.
- `assets/` — Sign images used in the track and exports.
- `assets/tracks/` — Example SVG centerlines to try.

## Running Locally

The app is plain static files, but it has to be served over HTTP (opening `index.html` directly from disk
prevents the sign images from being embedded in exports):

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deployment

The site is served by GitHub Pages from the `main` branch root; pushing to `main` updates it.

---

Feel free to contribute or suggest improvements!
