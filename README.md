# 🌍 EarthPulse — Acoustic GeoGuessr

> Explore weather around the world through sound. Listen to a climate-inspired soundscape, place your guess on the map, and learn how the measured conditions shaped the audio.

<!-- Replace this with a link to a demo video or an image hosted in the repository. -->
**Demo:** _https://drive.google.com/drive/u/0/my-drive_

**Website:** _https://earth-pulse-drab.vercel.app/_

## What It Does

EarthPulse turns live temperature, relative humidity, and wind speed into a synthesized soundscape. In **Acoustic GeoGuessr**, players listen to a mystery location, pin their guess on an interactive world map, and see how close they were. The revealed answer connects that round's weather and sound to broad latitude-related climate patterns.

Outside the game, you can explore locations on the map, search for places, listen to their soundscapes, and use the Sonification Lab to experiment with weather values and sound layers. The optional Climate Bands overlay adds latitude references and illustrative biome tints.

## How the Sound Works

- **Temperature → root pitch:** Temperature selects the soundscape's central note.
- **Humidity → harmonic richness:** Humidity adjusts harmonic and chord enrichment, modulation, chorus, and filter openness.
- **Wind speed → motion and texture:** Wind influences arpeggio timing and the filtered noise layer.

These are artistic mappings of current weather measurements, not direct recordings or a scientific model of long-term climate. The map's biome shading is an illustrative country/latitude-based guide, not a measured land-cover dataset.

## Running Locally

### Requirements

- Node.js 20.9 or newer
- npm
- Meteomatics API credentials for live weather

### Setup

1. Clone the repository and enter the project directory:

   ```bash
   git clone https://github.com/YOUR_USERNAME/earthpulse.git
   cd earthpulse
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env.local` in the project root. Add your [Meteomatics API](https://www.meteomatics.com/en/sign-up-weather-api/) username and password:

   ```dotenv
   METEOMATICS_USERNAME=your_meteomatics_username
   METEOMATICS_PASSWORD=your_meteomatics_password
   ```

   The credentials are read by the server and are not exposed to the browser. No `NEXT_PUBLIC_` prefix is needed. Live weather is required; if credentials are missing or Meteomatics is unavailable, the app displays an error instead of substituting demo values.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

To create and run a production build:

```bash
npm run build
npm run start
```

## Data and Services

- **Weather:** [Meteomatics Weather API](https://www.meteomatics.com/en/weather-api/) provides temperature, relative humidity, and wind speed when credentials are configured.
- **Place search:** [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) resolves typed place names; it does not require an API key in this app.
- **Map-click place names:** [BigDataCloud reverse geocoding](https://www.bigdatacloud.com/) resolves clicked coordinates; it does not require an API key in this app.
- **Map and audio:** D3-Geo renders the interactive map, and [Tone.js](https://tonejs.github.io/) powers browser-based synthesis.

The app's “NASA EIC Planetary Stories” are curated location prompts. This version does **not** ingest NASA Earth Information Center visualization frames or use them as sonification input. The weather-driven audio is based on Meteomatics data (or demo fallback data).

## Security

- Keep `.env.local` and all API credentials private. Do not commit them or paste them into screenshots, issues, or public logs.
- `.env*` files are ignored by Git; commit only non-secret examples such as `.env.local.example`.
- If credentials are accidentally exposed, revoke or rotate them with the provider.
