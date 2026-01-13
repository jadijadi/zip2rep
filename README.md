# Zip2Rep - Find Your Representative

**🌐 [Visit the Live Website →](https://jadijadi.github.io/zip2rep/)**

Zip2Rep is a frontend-only web application that helps users find their Member of Parliament (MP) or representative by entering their country and postal/zip code. If you're just looking to use the website, [visit the live version here](https://jadijadi.github.io/zip2rep/). This repository contains the source code for developers who want to contribute, deploy their own instance, or understand how it works.

## Features

- 🇨🇦 **Canada**: Look up MPs by postal code using Represent API and OpenParliament
- 🇺🇸 **United States**: Look up House Representatives by zip code using Whoismyrepresentative.com and 5 Calls APIs
- 🌍 **Extensible**: Architecture designed to support additional countries
- 🚀 **No Backend Required**: All API calls are made directly from the browser
- 📦 **GitHub Pages Ready**: Can be deployed to GitHub Pages with zero configuration

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **APIs**: Direct calls to public APIs (no backend needed)

## Getting Started

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in `dist/`

## Deployment to GitHub Pages

### Automatic Deployment (Recommended)

1. Push your code to GitHub
2. Go to your repository Settings → Pages
3. Under "Source", select "GitHub Actions"
4. The GitHub Actions workflow (`.github/workflows/deploy.yml`) will automatically build and deploy on every push to `main` or `master`

### Manual Deployment

1. Build the project:
```bash
npm run build
```

2. Copy the contents of `dist/` to your GitHub Pages branch (usually `gh-pages`)

### Base Path Configuration

If your repository name is `zip2rep`, the app is configured to work at `https://yourusername.github.io/zip2rep/`.

To change the base path, edit `vite.config.ts`:
- For root domain: `base: '/'`
- For subdirectory: `base: '/your-repo-name/'`

## Testing

Visit the deployed site or `http://localhost:5173` in your browser and try:
- **Canada**: Enter "CA" and postal code "K1A0A6" (or "K1A 0A6")
- **United States**: Enter "US" and zip code "90210" or "10001"

## APIs Used

### Canada
- **Represent API** (https://represent.opennorth.ca/): Free, no API key required
- **OpenParliament API** (https://api.openparliament.ca/): Free, no API key required

### United States
- **Whoismyrepresentative.com API**: Free, no API key required (primary)
- **5 Calls API** (https://api.5calls.org/): Free, no API key required (fallback)

All APIs are called directly from the browser. No backend server is needed.

## Project Structure

```
zip2rep/
├── src/
│   ├── App.tsx                  # Main React component
│   ├── services/
│   │   ├── lookup.ts           # Main lookup router
│   │   ├── canada.ts           # Canada MP lookup service
│   │   └── usa.ts              # US representative lookup service
│   ├── types.ts                # Shared TypeScript types
│   └── main.tsx                # Entry point
├── public/
│   └── .nojekyll               # GitHub Pages config
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment workflow
├── package.json
├── vite.config.ts
└── README.md
```

## Adding New Countries

To add support for a new country:

1. Create a new service file in `src/services/` (e.g., `uk.ts`)
2. Implement the lookup function following the pattern in `canada.ts` or `usa.ts`
3. Export a `ContactInfo` interface and lookup function
4. Register it in `src/services/lookup.ts`
5. Add the country to `getSupportedCountries()` in `lookup.ts`

## Notes

- **CORS**: All APIs used support CORS and can be called directly from the browser
- **No API Keys**: All services used are free and don't require API keys
- **Email Addresses**: Free APIs don't provide email addresses. Users can find contact information on the representative's official website (provided in the results)

## License

MIT
