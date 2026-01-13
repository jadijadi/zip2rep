# Zip2MP - Find Your Member of Parliament

A web application that helps users find their Member of Parliament (MP) or representative by entering their country and postal/zip code.

## Features

- 🇨🇦 **Canada**: Look up MPs by postal code
- 🇺🇸 **United States**: Look up House Representatives and Senators by zip code
- 🌍 **Extensible**: Architecture designed to support additional countries

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Python + FastAPI
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites

- Python 3.8+ 
- Node.js 16+ and npm
- (Optional) Google Civic API key for US lookups - Get one at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. (Optional) Set up environment variables for US lookups:
```bash
cd backend
# Create .env file and add your Google Civic API key:
echo "GOOGLE_CIVIC_API_KEY=your_api_key_here" > .env
# Or manually create .env file with: GOOGLE_CIVIC_API_KEY=your_api_key_here
# Note: Canada lookups work without any API keys
```

5. Start the server:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Testing

Visit `http://localhost:5173` in your browser and try:
- **Canada**: Enter "CA" and postal code "K1A0A6" (or "K1A 0A6")
- **United States**: Enter "US" and zip code "10001" (requires Google Civic API key)

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/lookup` - Look up MP by country and postal/zip code
  ```json
  {
    "country": "CA",
    "postal_code": "K1A 0A6"
  }
  ```

## Adding New Countries

The architecture is designed to be extensible. See [EXTENDING.md](backend/EXTENDING.md) for detailed instructions on adding support for new countries.

Quick steps:
1. Create a new lookup module in `backend/services/lookup/`
2. Implement the lookup function following the pattern in `canada.py` or `usa.py`
3. Register it in `backend/main.py` in the `LOOKUP_FUNCTIONS` dictionary
4. Add the country to the `/api/countries` endpoint

## API Keys & Services

### United States
- **Google Civic Information API**: Free tier available, requires API key
- Get your key: https://console.cloud.google.com/apis/credentials
- Set in `.env`: `GOOGLE_CIVIC_API_KEY=your_key_here`

### Canada
- Currently uses OpenParliament API (public, no key required)
- For production, consider integrating with:
  - Canada Post API for postal code to riding mapping
  - Elections Canada open data

## Project Structure

```
zip2mp/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── models.py               # Pydantic models
│   ├── services/
│   │   └── lookup/
│   │       ├── canada.py      # Canada MP lookup
│   │       ├── usa.py          # US representative lookup
│   │       └── base.py         # Base classes
│   └── EXTENDING.md            # Guide for adding countries
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main React component
│   │   └── main.tsx           # Entry point
│   └── package.json
└── README.md
```
