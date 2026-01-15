import { useState, useEffect } from 'react'
import './App.css'
import { lookupMP, getSupportedCountries, type LookupResponse } from './services/lookup'

interface Country {
  code: string
  name: string
  format: string
}

function App() {
  const [country, setCountry] = useState<string>('')
  const [postalCode, setPostalCode] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<LookupResponse | null>(null)
  const [countries, setCountries] = useState<Country[]>([])

  useEffect(() => {
    // Get supported countries from local service
    setCountries(getSupportedCountries())
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResults(null)
    setLoading(true)

    try {
      const data = await lookupMP(country, postalCode)
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const selectedCountry = countries.find(c => c.code === country)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Zip2Rep
          </h1>
          <p className="text-xl text-gray-600">
            Find Your Representative by Country and Postal Code
          </p>
        </header>

        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-8 mb-8">
            <div className="space-y-6">
              <div>
                <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-2">
                  Country
                </label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select a country</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {selectedCountry && (
                  <p className="mt-2 text-sm text-gray-500">
                    Format: {selectedCountry.format}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 mb-2">
                  {country === 'CA' ? 'Postal Code' : country === 'US' ? 'Zip Code' : 'Postal/Zip Code'}
                </label>
                <input
                  type="text"
                  id="postalCode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder={country === 'CA' ? 'K1A 0A6' : country === 'US' ? '10001' : 'Enter postal/zip code'}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !country || !postalCode}
                className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Looking up...' : 'Find My Representative'}
              </button>
            </div>
          </form>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg mb-8">
              <p className="font-semibold">Error</p>
              <p>{error}</p>
            </div>
          )}

          {results && (
            <div className="bg-white rounded-lg shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Your Representatives
              </h2>
              <div className="space-y-6">
                {results.representatives.map((rep, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                          {rep.name}
                        </h3>
                        <p className="text-indigo-600 font-medium">{rep.role}</p>
                        {rep.party && (
                          <p className="text-sm text-gray-600 mt-1">{rep.party}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {rep.riding && (
                        <div>
                          <p className="text-sm font-medium text-gray-700">Riding</p>
                          <p className="text-gray-900">{rep.riding}</p>
                        </div>
                      )}
                      {rep.district && (
                        <div>
                          <p className="text-sm font-medium text-gray-700">District</p>
                          <p className="text-gray-900">{rep.district}</p>
                        </div>
                      )}
                      {rep.email && (
                        <div>
                          <p className="text-sm font-medium text-gray-700">Email</p>
                          <a
                            href={`mailto:${rep.email}`}
                            className="text-indigo-600 hover:text-indigo-800 break-all"
                          >
                            {rep.email}
                          </a>
                        </div>
                      )}
                      {rep.phone && (
                        <div>
                          <p className="text-sm font-medium text-gray-700">Phone</p>
                          <a
                            href={`tel:${rep.phone}`}
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            {rep.phone}
                          </a>
                        </div>
                      )}
                      {rep.website && (
                        <div className="md:col-span-2">
                          <p className="text-sm font-medium text-gray-700">Website</p>
                          <a
                            href={rep.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 break-all"
                          >
                            {rep.website}
                          </a>
                        </div>
                      )}
                      {rep.address && (
                        <div className="md:col-span-2">
                          <p className="text-sm font-medium text-gray-700">Address</p>
                          <p className="text-gray-900">{rep.address}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="text-center mt-12 text-gray-600">
          <p>Zip2Rep - Find your representatives easily</p>
        </footer>
      </div>
    </div>
  )
}

export default App
